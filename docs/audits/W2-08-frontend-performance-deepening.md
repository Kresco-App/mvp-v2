# Frontend Performance Deepening Follow-up

## Summary
- First command run: `git status --short`, confirming `M frontend/app/page.tsx`, `?? docs/audits/`, and `?? frontend/components/landing/`.
- No full build or browser run was needed. The requested follow-up items are verifiable from import boundaries and synchronous render paths on disk.
- Confirmed: `apiDataCache` can synchronously block initial SWR render; the WIP root route has not split auth from landing; exam correction videos still create iframes immediately; Sonner is dynamically imported but still eagerly requested after hydration.

## Findings - severity, exact file:line, quoted evidence, concrete fix

### MEDIUM - `apiDataCache` can block first render with synchronous `sessionStorage` hydration

Evidence:
- `frontend/components/ApiDataProvider.tsx:7-10`: `const apiDataProviderConfig = { ...apiSWRConfig, provider: createApiDataCacheProvider }`
- `frontend/lib/apiDataCache.ts:100-104`: `get(key) { ... const hydrated = hydrateApiDataSessionCacheEntry(key) }`
- `frontend/lib/apiDataCache.ts:166-172`: `hydrateApiDataSessionCacheEntry(key)` calls `getApiDataCacheStorage()` and `readApiDataSessionCacheEntry(storage, storageKey)`.
- `frontend/lib/apiDataCache.ts:309-311`: `const parsed = JSON.parse(storage.getItem(storageKey) || 'null')`
- `frontend/lib/apiDataCache.ts:9`: `API_DATA_SESSION_CACHE_MAX_ENTRY_BYTES = 320_000`
- `frontend/node_modules/swr/dist/index/index.mjs:175`: `const [getCache, setCache, subscribeCache, getInitialCache] = createCacheHelper(cache, key);`
- `frontend/node_modules/swr/dist/index/index.mjs:201-202`: `const getSnapshot = useMemo(()=>{ const cachedData = getCache();`
- `frontend/node_modules/swr/dist/_internal/config-context-12s-CCVTDPOP.mjs:33-37`: `const createCacheHelper = (cache, key)=>{ ... ()=>!isUndefined(key) && cache.get(key) || EMPTY_CACHE`

Why this is verified: SWR invokes the provider getter while building the hook snapshot, and this provider getter performs `sessionStorage.getItem` plus `JSON.parse` on first access to each persisted key. `sessionStorage` and JSON parsing are synchronous, so one or more near-320 KB entries can run on the main thread before the hook returns its first client snapshot.

Concrete fix:
- Make `createApiDataCacheProvider().get` memory-only: return `cache.get(key)` or `undefined`, and remove `hydrateApiDataSessionCacheEntry(key)` from that path.
- Add a client-only `ApiDataSessionCacheHydrator` inside `ApiDataProvider` that uses `useSWRConfig()` and schedules persisted-cache hydration after mount with `requestIdleCallback` plus a `setTimeout` fallback.
- In that hydrator, enumerate `API_DATA_SESSION_CACHE_KEY_PREFIX` keys, decode the original SWR key, parse at most a small batch per idle slice, and call `mutate(decodedKey, data, { populateCache: true, revalidate: false })` only for unexpired entries.
- Lower the per-entry cap for session hydration or split large payloads out of this cache if above-the-fold reuse still needs synchronous fallback data.

### MEDIUM [WIP-PROVISIONAL] - Root landing still front-loads auth and animation work instead of using a lazy auth island

Evidence:
- `frontend/app/page.tsx:4`: `import { AuthPageView } from '@/components/auth/AuthPageView'`
- `frontend/app/page.tsx:7`: `import { useAuthPageController } from '@/lib/authPageController'`
- `frontend/app/page.tsx:10`: `const controller = useAuthPageController()`
- `frontend/app/page.tsx:22-35`: the auth branch is conditional, but the controller was already created before `{authVisible ? (...) : (<KrescoLandingExperience ... />)}`.
- `frontend/lib/authPageController.ts:5-11`: the controller imports toast, API, auth policy/session, Zustand store, API error helpers, and Firebase config.
- `frontend/lib/authPageController.ts:556-584`: `useAuthPageController()` reads router/search params, creates onboarding/auth form state, and calls `useAuthForm(...)`.
- `frontend/components/auth/AuthPageView.tsx:3-5`: the auth view imports auth UI icons, logo, and controller types.
- `frontend/components/landing/KrescoLandingExperience.tsx:18`: `import { motion, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from 'framer-motion'`
- `frontend/components/landing/KrescoLandingExperience.tsx:158-161`: the landing subscribes to `useScroll()`, `useSpring(...)`, and `useTransform(...)` on the root route.

Concrete fix:
- Move `useAuthPageController()` and `AuthPageView` into a new `AuthIsland` client component.
- In `frontend/app/page.tsx`, replace the direct auth imports with `next/dynamic`, for example `const AuthIsland = dynamic(() => import('@/components/auth/AuthIsland'), { ssr: false })`, and render it only when `authVisible` is true.
- Pass the initial auth mode to the island as a prop, and preload the island on login/signup button hover or focus with `void import('@/components/auth/AuthIsland')` to keep interaction latency low.
- Keep the landing shell independent of auth state beyond the two callbacks. If Framer Motion remains, split below-the-fold animated sections into a separate dynamic component or make the first viewport CSS-only so the initial public route does not need scroll-linked motion before interaction.

### MEDIUM - Exam correction videos are iframe-loaded immediately instead of click/viewport gated

Evidence:
- `frontend/app/(dashboard)/exam-bank/[examId]/page.tsx:249`: `primaryContent={<ExamProblemVideoFrame problem={activeProblem} />}`
- `frontend/app/(dashboard)/exam-bank/[examId]/page.tsx:331-332`: `const videoSource = problemVideoSource(problem)` then `if (videoSource?.youtubeId) return <VideoPlayerFrame videoId={videoSource.youtubeId} />`
- `frontend/components/figma/workspace.tsx:88-96`: `VideoPlayerFrame` builds a YouTube embed URL and renders `<iframe ... src={iframeSrc}>`.
- `frontend/app/(dashboard)/exam-bank/[examId]/page.tsx:336-343`: the non-YouTube path renders `<iframe ... src={videoSource.url} ...>`.
- `frontend/app/(dashboard)/exam-bank/[examId]/page.tsx:614-649`: `problemVideoSource` accepts YouTube, VdoCipher, Vimeo, and YouTube-nocookie correction URLs.
- Existing lazy contrast: `frontend/app/(dashboard)/topics/[topicId]/page.tsx:54-61` dynamically imports `VideoPlayer` and `YouTubeVideoPlayer`, and `frontend/components/YouTubeVideoPlayer.tsx:127-172` waits for `useNearViewport()` before loading the YouTube iframe API.

Concrete fix:
- Replace `ExamProblemVideoFrame`'s direct iframe branches with a small `ExamCorrectionVideoFrame` client component.
- Initial state should render a stable poster/play surface with no iframe `src`. For YouTube, use the video id to show a thumbnail or simple poster; for VdoCipher/Vimeo URLs, show the same play surface without embedding.
- On explicit click, render `VideoPlayerFrame` for YouTube or the sanitized non-YouTube iframe. Add `loading="lazy"` to the iframe as a secondary guard, but do not rely on it because this frame is primary above-fold content.
- Optionally use the existing `useNearViewport` hook to prepare poster assets near viewport, but do not set the third-party iframe `src` until user intent unless product explicitly requires autoplay.

### LOW - The global toaster lazy import is still eager after hydration

Evidence:
- `frontend/app/layout.tsx:265-267`: root layout renders `{children}`, `ClientErrorReporter`, and `<AppToaster />` on every route.
- `frontend/components/AppToaster.tsx:23-28`: `load()` imports `sonner` and stores `mod.Toaster`.
- `frontend/components/AppToaster.tsx:31-32`: it registers `APP_TOASTER_REQUEST_EVENT`, then immediately calls `load()`.
- `frontend/lib/lazyToast.ts:16-20`: `requestAppToaster()` sets `__krescoAppToasterRequested = true` and dispatches the same event.
- `frontend/lib/lazyToast.ts:23-24`: `isAppToasterRequested()` already exposes the missed-event check needed for safe event-only loading.

Concrete fix:
- In `AppToaster`, import `isAppToasterRequested` alongside `APP_TOASTER_REQUEST_EVENT`.
- Keep the event listener, but replace the unconditional `load()` call with `if (isAppToasterRequested()) load()`.
- This is safe because `showToast()` calls `requestAppToaster()` before awaiting the `sonner` module, so a toast requested before the component effect attaches is captured by the window flag and loaded on mount.
- If eager readiness is still desired, schedule `load()` through `requestIdleCallback` with a timeout instead of running it immediately after hydration.

## Leads - precise remaining questions or `None`

None

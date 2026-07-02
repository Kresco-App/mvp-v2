# Frontend Performance
## Summary
- Installed versions from disk: Next.js 16.2.6, React 19.2.6, SWR 2.4.1, Framer Motion 12.35.1.
- Working tree WIP confirmed: `frontend/app/page.tsx` modified, `frontend/components/landing/` untracked.
- `frontend/lib/swrCache.ts` is used to skip duplicate successful SWR preloads; no direct defect found there.
- Main risks are root-route bundle composition, WIP landing scroll motion, direct exam iframe loading, and global Sonner eager loading.

## Findings
### HIGH [WIP-PROVISIONAL] - Root route front-loads the auth stack while showing the landing page
Evidence:
- `frontend/app/page.tsx:4`: `import { AuthPageView } from '@/components/auth/AuthPageView'`
- `frontend/app/page.tsx:7`: `import { useAuthPageController } from '@/lib/authPageController'`
- `frontend/app/page.tsx:10`: `const controller = useAuthPageController()`
- `frontend/app/page.tsx:22`: `{authVisible ? (`
- `frontend/app/page.tsx:31`: `<AuthPageView {...controller} />`
- `frontend/app/page.tsx:34`: `<KrescoLandingExperience`
- `frontend/components/auth/AuthPageView.tsx:3`: `import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, Loader2, Mail, Smartphone } from 'lucide-react'`
- `frontend/lib/authPageController.ts:5`: `import { showToastError, showToastSuccess } from '@/lib/lazyToast'`
- `frontend/lib/authPageController.ts:6`: `import { patchJson, postJson } from '@/lib/apiClient'`
- `frontend/lib/authPageController.ts:9`: `import { useAuthStore } from '@/lib/store'`

The public `/` route is a client component that imports and initializes the auth controller before `authVisible` is true, so the landing page pays for auth form code, store subscriptions, API helpers, toast helpers, and route/search-param hooks on initial load.

Concrete fix: split the auth flow into a lazy client island, for example `const AuthIsland = dynamic(() => import('@/components/auth/AuthIsland'), { ssr: false })`, and move `useAuthPageController()` plus `AuthPageView` inside that island. Keep the landing shell independent so `/` initially loads only the landing and guest redirect logic, or route auth to `/login` and `/signup`.

### MEDIUM [WIP-PROVISIONAL] - Landing page uses scroll-linked Framer Motion and filter reveals on the initial route
Evidence:
- `frontend/components/landing/KrescoLandingExperience.tsx:18`: `import { motion, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from 'framer-motion'`
- `frontend/components/landing/KrescoLandingExperience.tsx:142`: `filter: shouldReduceMotion ? 'none' : 'blur(6px)',`
- `frontend/components/landing/KrescoLandingExperience.tsx:158`: `const { scrollYProgress } = useScroll()`
- `frontend/components/landing/KrescoLandingExperience.tsx:159`: `const progressScale = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.18 })`
- `frontend/components/landing/KrescoLandingExperience.tsx:160`: `const heroY = useTransform(scrollYProgress, [0, 0.26], shouldReduceMotion ? [0, 0] : [0, -42])`
- `frontend/components/landing/KrescoLandingExperience.tsx:161`: `const heroOpacity = useTransform(scrollYProgress, [0, 0.22], shouldReduceMotion ? [1, 1] : [1, 0.74])`
- `frontend/components/landing/KrescoLandingExperience.tsx:323`: `whileInView="show"`

This makes the WIP root landing route load Framer Motion and subscribe to page scroll for the progress bar and hero parallax. The same component also uses blur/clip-path reveal work across sections, which adds main-thread and paint work to the first public page.

Concrete fix: keep the first viewport static or CSS-only, replace the scroll progress with a lightweight CSS transform driven by a small passive scroll handler after idle, and avoid blur/clip-path reveals on large containers. If Framer Motion remains necessary, dynamically load animated below-the-fold sections after the hero is interactive.

### MEDIUM - Exam workspace loads third-party video iframes immediately
Evidence:
- `frontend/app/(dashboard)/exam-bank/[examId]/page.tsx:249`: `primaryContent={<ExamProblemVideoFrame problem={activeProblem} />}`
- `frontend/app/(dashboard)/exam-bank/[examId]/page.tsx:332`: `if (videoSource?.youtubeId) return <VideoPlayerFrame videoId={videoSource.youtubeId} />`
- `frontend/components/figma/workspace.tsx:88`: `const iframeSrc = videoId`
- `frontend/components/figma/workspace.tsx:96`: `src={iframeSrc}`
- `frontend/app/(dashboard)/exam-bank/[examId]/page.tsx:336`: `<iframe`
- `frontend/app/(dashboard)/exam-bank/[examId]/page.tsx:338`: `src={videoSource.url}`

The topic workspace uses dedicated lazy video players, but the exam workspace path renders YouTube or other correction iframes directly in primary content. That starts third-party iframe work as soon as the problem workspace renders.

Concrete fix: reuse the lazy `YouTubeVideoPlayer`/viewport-gated pattern for exam YouTube corrections, or render a `srcDoc` thumbnail/play shell and set `src` only on user intent. For non-YouTube correction URLs, add the same click-to-load wrapper or at minimum `loading="lazy"` when the frame is not the active above-fold correction.

### LOW - Global toaster imports Sonner on every route after hydration
Evidence:
- `frontend/app/layout.tsx:267`: `<AppToaster />`
- `frontend/components/AppToaster.tsx:26`: `void import('sonner').then((mod) => {`
- `frontend/components/AppToaster.tsx:31`: `window.addEventListener(APP_TOASTER_REQUEST_EVENT, load)`
- `frontend/components/AppToaster.tsx:32`: `load()`
- `frontend/lib/lazyToast.ts:18`: `window.dispatchEvent(new Event(APP_TOASTER_REQUEST_EVENT))`

`lazyToast.ts` already dispatches an event when a toast is requested, but `AppToaster` calls `load()` unconditionally on mount. That creates a post-hydration Sonner chunk request on routes that may never show a toast.

Concrete fix: remove the unconditional `load()` call and load only when `APP_TOASTER_REQUEST_EVENT` fires, with an initial `isAppToasterRequested()` check for missed early requests. If eager availability is required, schedule it through `requestIdleCallback` instead of immediately after hydration.

## Leads
1. `frontend/lib/apiDataCache.ts:118` - Verify in a browser performance profile whether `hydrateApiDataSessionCacheEntry(key)` synchronous `sessionStorage` reads and JSON parsing block first render on data-heavy routes when entries approach `API_DATA_SESSION_CACHE_MAX_ENTRY_BYTES` from `frontend/lib/apiDataCache.ts:7`.
2. `frontend/components/landing/KrescoLandingExperience.tsx:18` - After the WIP landing stabilizes, run a route bundle analysis for `/` and verify the exact Framer Motion and auth island contribution before and after the dynamic split proposed above.
3. `frontend/components/figma/workspace.tsx:96` - Verify product behavior for exam correction videos: whether they must autoplay/load immediately on workspace open, or whether a click-to-load `srcDoc` poster is acceptable for smoother navigation.

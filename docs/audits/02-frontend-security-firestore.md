# Frontend Security and Firestore
## Summary
- Audited the code on disk after `git status`; WIP paths are `frontend/app/page.tsx` and `frontend/components/landing/`, and no finding below touches them.
- Frontend versions verified from disk: Next `^16.2.6`, React `^19.2.6`.
- No active `dangerouslySetInnerHTML` usage was found; reviewed chat and feedback bodies render as React text.
- Highest risk is that Firestore realtime access rules are not versioned/deployed by this repo, while clients subscribe directly to backend-written channel event collections.
- CSP exists in `frontend/proxy.ts`, but not in `next.config.mjs`; current inline-style debt conflicts with the strict production `style-src-attr` policy.

## Findings
1. HIGH - Firestore realtime rules are missing from the versioned deploy config, so client read/write isolation for realtime topics cannot be verified from the repo.

   Evidence:
   - `firebase.json:2` shows the Firebase config root is Hosting-only: `"hosting": [`
   - `firebase.json:104` closes the file with no `firestore` rules block: `}`
   - `frontend/lib/realtime.ts:247` subscribes clients directly under the shared realtime collection: `firestoreSdk.collection(firestore, 'realtimeChannels', firestoreChannelDocumentId(channelName), 'events'),`
   - `backend/app/services/firestore_realtime.py:52` writes backend events to the same path family: `client.collection("realtimeChannels")`
   - `rg --files` found `firebase.json` only; no `firestore.rules` file is present in the repository.

   Concrete fix: add a checked-in `firestore.rules` file and a `firebase.json` `"firestore": { "rules": "firestore.rules" }` deployment block. Deny all client writes to `/realtimeChannels/{channel}/events/{event}` and allow reads only when Firebase Auth claims or server-maintained membership docs prove access to that exact encoded channel, including `kresco:user:{id}:notifications`, `kresco:professor:{id}:inbox`, `kresco:offering:{id}:notifications`, and `kresco:live:{id}`. Add emulator tests that prove users cannot read another user's/professor's/offering's channel and cannot write backend-only event documents.

2. MEDIUM - CSP enforcement is split between `next.config.mjs` and `proxy.ts`, and the production `style-src-attr 'none'` policy conflicts with existing inline style attributes.

   Evidence:
   - `frontend/next.config.mjs:66` starts `buildSecurityHeaders()` with generic security headers only: `return [`
   - `frontend/next.config.mjs:108` applies those headers globally without a CSP header from `next.config.mjs`: `return [{ source: '/(.*)', headers: buildSecurityHeaders() }]`
   - `frontend/proxy.ts:277` sets production style attributes to none: `const styleAttrSource = allowDevOverlayStyles ? "'unsafe-inline'" : "'none'"`
   - `frontend/proxy.ts:291` emits that CSP directive: `` `style-src-attr ${styleAttrSource}` ``
   - `frontend/proxy.ts:436` excludes `/media` and every dotted path from proxy CSP coverage: `source: '/((?!api|media|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',`
   - `frontend/app/admin/reviews/video-feedback/page.tsx:279` still uses an inline style attribute: `<span className="h-full bg-[#10b981]" style={{ width: positiveWidth }} />`

   Concrete fix: centralize CSP construction so all HTML document responses get the same policy, or add a tested CSP header path in `next.config.mjs` for document responses not handled by `proxy.ts`. Keep `style-src-attr 'none'` in production, but remove inline style attributes and CSSOM style writes from app code; for dynamic bars, use semantic elements such as `meter`/SVG attributes or bounded class variants instead of React `style={{ ... }}`. Keep `npm run audit:csp-styles` in CI as the budget gate; it currently fails with inline-style debt.

3. LOW - Course formulas pass authored LaTeX through a direct HTML sink instead of the repo's sanitizer boundary.

   Evidence:
   - `frontend/components/animated/shared/Latex.tsx:28` writes generated HTML into the DOM: `containerRef.current.innerHTML = result.html;`
   - `frontend/components/animated/shared/Latex.tsx:46` generates that HTML from caller-provided formula text: `html: katex.renderToString(formula, {`
   - `frontend/components/topic-workspace/CourseContentRenderer.tsx:245` renders course content formulas through that component: `<Latex formula={block.latex} />`
   - `frontend/components/topic-workspace/CourseContentRenderer.tsx:634` also renders equation-set content through it: `<Latex formula={equation.latex} block className="text-[18px] font-black text-[#18181b]" />`

   Concrete fix: make the trust boundary explicit. Prefer `katex.render(formula, element, { throwOnError: true, displayMode, trust: false, strict: 'error' })` or sanitize `renderToString` output with the existing DOMPurify wrapper before assignment. Add focused tests with hostile formula payloads such as JavaScript links and KaTeX HTML-extension commands so professor-authored course content cannot introduce executable markup if KaTeX behavior or options change.

4. LOW - Resource/PDF previews grant unnecessary iframe sandbox capabilities to URLs that are only protocol-sanitized.

   Evidence:
   - `frontend/lib/topicWorkspaceResources.ts:55` accepts a preview/open/download URL from the backend response or stored resource URL: `return sanitizeNavigationUrl(actionSpecific || response.url || response.href || response.location || resource.url)`
   - `frontend/lib/urlSafety.ts:24` allows relative URLs: `if (options.allowRelative !== false && isSafeRelativeUrl(trimmed)) {`
   - `frontend/lib/urlSafety.ts:31` allows absolute `http:` and `https:` URLs: `return rememberSanitizedNavigationUrl(cacheKey, allowedProtocols.has(url.protocol) ? url.toString() : '')`
   - `frontend/components/topic-workspace/TopicWorkspaceResourcePanel.tsx:142` loads the URL into an iframe: `src={previewUrl}`
   - `frontend/components/topic-workspace/TopicWorkspaceResourcePanel.tsx:145` grants script, form, popup, and download privileges: `sandbox="allow-scripts allow-forms allow-popups allow-downloads"`

   Concrete fix: reduce the preview sandbox to the minimum needed for PDFs, ideally no scripts/forms/popups and only `allow-downloads` if product-required. If previews can target arbitrary HTML origins, render PDFs/images through a controlled viewer or backend-validated media endpoint instead, and enforce MIME/type and host/path restrictions before returning `preview_url`.

## Leads
1. `firebase.json` and the missing `firestore.rules`: verify the active Firestore rules currently deployed in `kresco-staging` and `kresco-prod`, then compare them against the backend-written `realtimeChannels/{encodedChannel}/events/{event}` schema to confirm clients cannot read other topics or write backend-only paths.
2. `frontend/lib/realtime.ts`: verify whether Firebase Auth tokens include the Kresco numeric user id, professor id, and offering/live-session membership data required to authorize channel names in Firestore rules; if not, define the server-side custom claims or membership documents that rules will use.
3. `frontend/components/topic-workspace/TopicWorkspaceResourcePanel.tsx`: verify that `/courses/resources/{id}/open` and `/resources/{id}/open` never return arbitrary HTML preview URLs; if they can, the iframe sandbox should be tightened before enabling preview for those resources.

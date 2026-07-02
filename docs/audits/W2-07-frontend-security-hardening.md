# Frontend Security Hardening Follow-up
## Summary
- Ran `git status --short` first. Current WIP is `M frontend/app/page.tsx`, `?? docs/audits/`, and `?? frontend/components/landing/`.
- No finding below relies on `frontend/app/page.tsx` or `frontend/components/landing/`, so no finding is marked `[WIP-PROVISIONAL]`. The new report itself is under the already-untracked `docs/audits/` audit artifact tree.
- Resource open endpoints currently return metadata, not preview URLs, but the frontend helper is already typed to trust future `preview_url`/`open_url` fields and otherwise falls back to `resource.url`.
- KaTeX hostile probes with the current options rendered `\href{javascript:...}` and HTML-extension commands as KaTeX error text, not active links or elements. The remaining issue is hardening: the boundary is implicit, directly assigned through `innerHTML`, and not covered by hostile formula tests.
- CSP ownership is currently in `frontend/proxy.ts`; `frontend/next.config.mjs` applies non-CSP security headers. The existing `audit:csp-styles` gate fails on current style debt and has parser blind spots that prevent it from fully validating the current CSP/style boundary.

## Findings - severity, exact file:line, quoted evidence, concrete fix
1. MEDIUM - Resource previews load protocol-only sanitized URLs in an iframe sandbox that allows scripts, forms, popups, and downloads.

   Evidence:
   - `frontend/lib/topicWorkspaceResources.ts:55`: `return sanitizeNavigationUrl(actionSpecific || response.url || response.href || response.location || resource.url)`
   - `frontend/lib/urlSafety.ts:1`: `const SAFE_NAVIGATION_PROTOCOLS = new Set(['http:', 'https:'])`
   - `frontend/lib/urlSafety.ts:24`: `if (options.allowRelative !== false && isSafeRelativeUrl(trimmed)) {`
   - `frontend/components/topic-workspace/TopicWorkspaceResourcePanel.tsx:142`: `src={previewUrl}`
   - `frontend/components/topic-workspace/TopicWorkspaceResourcePanel.tsx:145`: `sandbox="allow-scripts allow-forms allow-popups allow-downloads"`
   - `backend/app/schemas/interactions.py:180`: `class ResourceOpenOut(BaseModel):`
   - `backend/app/schemas/interactions.py:184`: `resource_type: str`
   - `backend/app/schemas/interactions.py:190`: `opened_at: datetime`

   Concrete fix: keep the backend open response metadata-only unless it also returns a validated preview contract. For preview, require an allowlisted media type and origin/path, preferably a backend-controlled PDF/image endpoint. Tighten the iframe sandbox to the minimum needed for passive previews, such as no tokens or only `allow-downloads` if required; do not grant `allow-scripts`, `allow-forms`, or `allow-popups` to `resource.url` or generic provider URLs.

2. LOW - KaTeX rendering is not currently an exploitable XSS path from the probes run, but the trust boundary is implicit and the renderer still writes generated HTML directly into the DOM.

   Evidence:
   - `frontend/components/animated/shared/Latex.tsx:28`: `containerRef.current.innerHTML = result.html;`
   - `frontend/components/animated/shared/Latex.tsx:46`: `html: katex.renderToString(formula, {`
   - `frontend/components/animated/shared/Latex.tsx:47`: `throwOnError: true,`
   - `frontend/components/animated/shared/Latex.tsx:48`: `displayMode: block,`
   - `frontend/components/topic-workspace/CourseContentRenderer.tsx:245`: `<Latex formula={block.latex} />`
   - `frontend/components/topic-workspace/CourseContentRenderer.tsx:634`: `<Latex formula={equation.latex} block className="text-[18px] font-black text-[#18181b]" />`
   - `frontend/components/topic-workspace/CourseContentRenderer.tsx:708`: `` ? <Latex formula={part.value} key={`${part.kind}-${index}`} className="align-baseline" /> ``
   - `frontend/components/animated/shared/Latex.tsx:71`: `Object.assign(errorBox.style, {`

   Concrete fix: make the KaTeX boundary explicit with `trust: false` and `strict: 'error'` in the options, or sanitize the `renderToString` output with the repo sanitizer before assigning it. Add focused tests for hostile formulas (`\href`, `\htmlClass`, `\htmlData`, `\htmlStyle`, javascript/data URLs) so future KaTeX option or version changes cannot silently widen the boundary. Replace the error fallback's CSSOM inline styles with classes so formula errors do not add CSP style debt.

3. MEDIUM - The CSP style audit script cannot validate the current proxy CSP directives and misses some CSSOM style writes, while tracked inline-style debt still exceeds the zero budget.

   Evidence:
   - `frontend/proxy.ts:277`: `const styleAttrSource = allowDevOverlayStyles ? "'unsafe-inline'" : "'none'"`
   - `frontend/proxy.ts:291`: `` `style-src-attr ${styleAttrSource}`, ``
   - `frontend/next.config.mjs:108`: `return [{ source: '/(.*)', headers: buildSecurityHeaders() }]`
   - `frontend/scripts/audit-csp-styles.mjs:103`: `for (const match of proxy.matchAll(/"([^"]+)"/g)) {`
   - `frontend/scripts/audit-csp-styles.mjs:153`: `const cssomMatches = countMatches(content, /\.\s*style\s*\.|\bcssText\b|\bsetAttribute\s*\(\s*['"]style['"]/g)`
   - `frontend/scripts/audit-csp-styles.mjs:301`: `` console.error(`CSP style debt budget exceeded for ${key}: ${result.totals[key]} > ${max}. Lower debt or explicitly lower the budget after cleanup.`) ``
   - `frontend/components/SegmentedTabs.tsx:58`: `const previousTransition = pillNode.style.transition`
   - `frontend/components/zed/PdfViewerCore.tsx:824`: `style={{ width: pageSize.width ? `${pageSize.width}px` : undefined, minHeight: pageSize.height ? undefined : 540 }}`
   - `frontend/components/animated/shared/Latex.tsx:71`: `Object.assign(errorBox.style, {`
   - `frontend/package.json:21`: `"audit:csp-styles": "node scripts/audit-csp-styles.mjs",`
   - `frontend/package.json:22`: `"ci": "npm run lint && npm run audit:csp-styles && npm run validate:production-env:fixture && npm run typecheck && npm run test:coverage && npm run test:e2e && npm run test:e2e:integration"`

   Concrete fix: move CSP construction into a shared module consumed by `proxy.ts`, tests, and `audit-csp-styles.mjs`, or parse `proxy.ts` with an AST so template literals are included. Extend CSSOM detection to catch `Object.assign(element.style, ...)` and other style-object writes, then add script-level tests proving template-literal CSP directives and CSSOM patterns are counted. Keep `next.config.mjs` free of a weaker global CSP, but make the audit gate validate the actual owner and then burn down tracked `style={{ ... }}` / CSSOM debt to meet the zero budgets.

## Leads - precise remaining questions or `None`
- `frontend/proxy.ts:436`: verify whether any HTML document route can contain a dot in the pathname. The matcher excludes `.*\\..*`; if an extensionful app route can serve HTML outside `_next`, `/media`, or static assets, that document may bypass the proxy-owned CSP.
- Resource previews: decide whether `Resource.url` is allowed to point at arbitrary external HTML. If yes, disable iframe preview for that class of resource; if no, enforce PDF/image MIME and host/path restrictions before the frontend receives the URL.

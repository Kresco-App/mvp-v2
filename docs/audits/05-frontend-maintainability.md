# Frontend Maintainability

## Summary - max 5 lines
- `git status --short` showed WIP: `M frontend/app/page.tsx` and `?? frontend/components/landing/`; WIP findings are marked `[WIP-PROVISIONAL]`.
- Disk versions verified in `frontend/package.json`: Next `^16.2.6`, React `^19.2.6`.
- Main risks are oversized client surfaces, global CSS utility overrides, a feature-scoped global storage patch, and retained dead legacy UI.
- Source, tests, and config were audited read-only; only this report file was written.

## Findings
1. HIGH - `frontend/app/admin/users/page.tsx:145` - Admin users is a 3022-line client container owning data fetch, mutations, view routing, UI, and view-model helpers.

   Evidence:
   > `export default function AdminUsersPage({`
   > `const [data, setData] = useState<AdminUsersAccess>(EMPTY_ADMIN_USERS_ACCESS)`
   > `const [selectedUserId, setSelectedUserId] = useState('')`
   > `const [manualAccessDraft, setManualAccessDraft] = useState<StudentAccessDraft>(emptyStudentAccessDraft)`

   The same file also renders overview, students, and staff branches from one return path at `frontend/app/admin/users/page.tsx:568`, `frontend/app/admin/users/page.tsx:599`, and `frontend/app/admin/users/page.tsx:635`, then keeps pure mutation/view-model helpers through `frontend/app/admin/users/page.tsx:3022`.

   Concrete fix: reduce this route to composition plus one data hook. Move fetch/mutation state into `useAdminUsersAccess`, split `StudentAccountsTable`, `StudentRecordWorkspace`, `StudentAccessPanel`, and `PermissionsPanel` into `frontend/components/admin/users/`, and move pure row mutation/signal helpers to `frontend/lib/adminUsersViewModel.ts`.

2. HIGH - `frontend/app/globals.css:777` - Global CSS redefines standard Tailwind utility classes with `!important`, so class names no longer mean what they say.

   Evidence:
   > `/* Light-mode Tailwind overrides */`
   > `.bg-slate-950 { background-color: #f4f4f6 !important; }`
   > `.bg-slate-900 { background-color: #ffffff !important; }`
   > `.bg-slate-950 .text-white,`
   > `.bg-slate-900 .text-white,`
   > `  color: #18181b;`

   Concrete fix: stop overriding Tailwind primitives globally. Scope this block behind a legacy wrapper class while migrating affected screens, or replace the old dark-theme class usage at call sites with explicit Kresco/admin primitives and delete the override block.

3. HIGH - `frontend/components/zed/PdfViewerCore.tsx:356` - `PdfViewerCore` is a 1324-line component that mixes document storage, PDF.js rendering, annotation persistence, pointer tools, and UI.

   Evidence:
   > `function openDocumentDb(): Promise<IDBDatabase> {`
   > `function readAnnotations(documentId: string): PdfAnnotation[] {`
   > `export default function PdfViewerCore({ activeTool, onDocumentChange, onAnnotationStatsChange }: Props) {`
   > `const [documents, setDocuments] = useState<LocalDocument[]>([])`
   > `function handlePagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {`
   > `function AnnotationLayer({`

   Concrete fix: split by ownership: `pdfDocumentStore.ts` for IndexedDB document CRUD, `pdfAnnotations.ts` for annotation serialization/geometry/hit-testing, `usePdfRenderer.ts` for PDF.js lifecycle, and small view components for toolbar, canvas, annotation layer, and text editor. Keep `PdfViewerCore` as orchestration only.

4. HIGH - `frontend/components/zed/zedStorage.ts:62` - A Zed-specific storage helper patches the global `Storage` prototype, leaking feature logic into every `localStorage` write.

   Evidence:
   > `function patchZedStorageMutators() {`
   > `const storagePrototype = window.Storage?.prototype`
   > `storagePrototype.setItem = function setItem(this: Storage, key: string, value: string) {`
   > `storagePrototype.removeItem = function removeItem(this: Storage, key: string) {`
   > `storagePrototype.clear = function clear(this: Storage) {`

   Concrete fix: remove prototype patching. Either accept cache invalidation only through the exported Zed storage functions, or promote this into a shared, explicitly initialized storage-cache utility with tests that cover its global behavior.

5. MEDIUM - `frontend/app/admin/users/page.tsx:1258` - Dead legacy student workspace code is still retained in the production page.

   Evidence:
   > `// Legacy combined workspace retained for rollback while the route split settles.`
   > `// eslint-disable-next-line @typescript-eslint/no-unused-vars`
   > `function StudentCrudWorkspace({`

   Search verification: `rg --line-number "StudentCrudWorkspace|handleStudentEditorModeChange|handleSelectedStudentIdChange" frontend/app/admin/users/page.tsx frontend/tests` returned only definitions at lines `415`, `431`, and `1260`.

   Concrete fix: delete `StudentCrudWorkspace`, `handleStudentEditorModeChange`, and `handleSelectedStudentIdChange` after confirming rollback is no longer needed. If rollback is still required, move it to a separate file with an explicit feature flag instead of suppressing unused code in the route.

6. MEDIUM - `frontend/components/zed/ScientificCalculator.tsx:267` - The calculator is another oversized Zed bundle, mixing floating-window behavior, scientific input, limits, graph UI, and graph analysis helpers.

   Evidence:
   > `export default function ScientificCalculator({`
   > `{mode === 'scientific' && (`
   > `{mode === 'limits' && <LimitMode />}`
   > `{mode === 'graph' && <GraphMode />}`
   > `function GraphMode() {`
   > `function buildGraph(functions: GraphFunction[], windowState: { xMin: number; xMax: number; yMin: number; yMax: number }) {`

   Concrete fix: split `ScientificMode`, `LimitMode`, and `GraphMode` into separate files, extract shared token/cursor editing into `useCalculatorTokenInput`, and move graph sampling/root/intersection helpers into a pure `zedGraphMath.ts` module with focused tests.

7. LOW [WIP-PROVISIONAL] - `frontend/components/landing/KrescoLandingExperience.tsx:33` - The untracked landing component combines all marketing copy, motion variants, visual composition, and page sections in one 554-line client component.

   Evidence:
   > `const strengths: Feature[] = [`
   > `const methodSteps = [`
   > `function makeReveal(shouldReduceMotion: boolean): Variants {`
   > `export default function KrescoLandingExperience({ onLogin, onSignup }: LandingProps) {`

   Concrete fix: before promoting this WIP, move static section content to a small data module and split hero, method, tools, offer, FAQ, and CTA sections into focused components so copy edits do not require navigating the full interactive page.

## Leads
1. `frontend/app/admin/users/page.tsx` - Verify whether the rollback comment at lines `1258-1260` is still operationally required; if not, delete the unused legacy workspace and run the focused admin users page tests.
2. `frontend/app/globals.css` - Verify which active pages still depend on the global light-mode Tailwind override block at lines `777-883`; scope the block only to those pages before deleting it.
3. `frontend/components/zed/PdfViewerCore.tsx` - Verify the intended persistence boundary for PDF annotations: keep annotations in localStorage via Zed storage, or move them into the IndexedDB document record before splitting the component.

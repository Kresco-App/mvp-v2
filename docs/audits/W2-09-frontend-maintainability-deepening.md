# Frontend Maintainability Deepening Follow-up

## Summary

- `git status --short` showed WIP in `frontend/app/page.tsx`, untracked `docs/audits/`, and untracked `frontend/components/landing/`; this follow-up has no findings in modified or untracked source files, so no finding needs `[WIP-PROVISIONAL]`.
- `StudentCrudWorkspace` is code-dead on disk: current student routes render `StudentAccountsTable` or `StudentRecordWorkspace`, while the legacy rollback workspace and its two handlers are only definitions.
- The Tailwind light-mode override block is still an active compatibility layer. Direct deletion is not safe: exact overridden utility tokens appear in 99 non-`globals.css` frontend files, including active auth, pricing, dashboard exam/topic, activity, simulator, video, and Zed surfaces.
- `PdfViewerCore` persistence boundary is verified: PDF document blobs live in IndexedDB, while annotations live separately in `zedStorage`/`localStorage` under `kresco:zed:annotations:v1:<documentId>`.
- Obvious low-risk orchestrator fix: delete the dead admin users rollback block and its queue-only helpers. PDF splitting is low-risk only if it preserves the existing document-vs-annotation persistence boundary.

## Findings - severity, exact file:line, quoted evidence, concrete fix

1. MEDIUM - `frontend/app/admin/users/page.tsx:413` - The legacy student rollback workspace is unreachable and can be removed with its queue-only helpers.

   Quoted evidence:
   > `frontend/app/admin/users/page.tsx:413:   // Legacy combined workspace handler retained while student routes finish migrating.`
   > `frontend/app/admin/users/page.tsx:415:   function handleStudentEditorModeChange(mode: StudentEditorMode) {`
   > `frontend/app/admin/users/page.tsx:431:   function handleSelectedStudentIdChange(userId: string) {`
   > `frontend/app/admin/users/page.tsx:599:       {view === 'students' && (`
   > `frontend/app/admin/users/page.tsx:601:           <StudentAccountsTable`
   > `frontend/app/admin/users/page.tsx:609:           <StudentRecordWorkspace`
   > `frontend/app/admin/users/page.tsx:1258: // Legacy combined workspace retained for rollback while the route split settles.`
   > `frontend/app/admin/users/page.tsx:1260: function StudentCrudWorkspace({`

   Repo-wide code search excluding `docs/audits`, `node_modules`, and `.next` found only these definitions for `StudentCrudWorkspace`, `handleStudentEditorModeChange`, and `handleSelectedStudentIdChange`. A narrower symbol search also showed `StudentQueueFilter`, `studentQueueFilters`, `studentMatchesQueueFilter`, `StudentMiniStat`, and `StudentListItem` are only used by the dead `StudentCrudWorkspace` block.

   Concrete fix: delete `StudentCrudWorkspace`, `handleStudentEditorModeChange`, `handleSelectedStudentIdChange`, `StudentQueueFilter`, `studentQueueFilters`, `studentMatchesQueueFilter`, `StudentMiniStat`, and `StudentListItem` in one cleanup. Then run `npm run typecheck`, `npm run lint`, and the focused `adminUsersPage` test file if the orchestrator wants a targeted behavior check.

2. HIGH - `frontend/app/globals.css:780` - The global Tailwind light-mode overrides cannot be deleted directly because active frontend surfaces still depend on the rewritten class meanings.

   Quoted evidence:
   > `frontend/app/globals.css:779: /* Backgrounds */`
   > `frontend/app/globals.css:780: .bg-slate-950 { background-color: #f4f4f6 !important; }`
   > `frontend/app/globals.css:781: .bg-slate-900 { background-color: #ffffff !important; }`
   > `frontend/app/globals.css:796: .border-slate-800,`
   > `frontend/app/globals.css:803: .bg-slate-950.text-white,`
   > `frontend/app/globals.css:823:   color: #18181b;`
   > `frontend/app/globals.css:834: .hover\:bg-slate-950:hover { background-color: #f4f4f6 !important; }`
   > `frontend/app/globals.css:850: .bg-green-900\/20 { background-color: rgba(22,163,74,0.06) !important; }`
   > `frontend/app/globals.css:875: .bg-kresco\/10 { background-color: #edf1ff !important; }`

   Active dependency examples:
   > `frontend/components/AuthGuard.tsx:56:     <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">`
   > `frontend/app/pricing/page.tsx:175:       <main className="min-h-screen bg-slate-950 p-6">`
   > `frontend/app/(dashboard)/exam/[subjectId]/page.tsx:386:     <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-950 text-white">`
   > `frontend/components/activities/InteractiveActivityRenderer.tsx:18: const WaveSimulator = dynamic(() => import('@/components/simulators/WaveSimulator'), { ssr: false })`
   > `frontend/components/activities/InteractiveActivityRenderer.tsx:114:       <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-6">`
   > `frontend/components/simulators/PrismSimulator.tsx:303:     <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-4 sm:p-6 shadow-lg">`

   Exact-token map for utilities rewritten by the block found matches in 99 non-`globals.css` frontend files: `components/animated` 69 files, `components/activities` 10, `components/simulators` 4, `components/zed` 4, `app/(dashboard)` 3, plus `AuthGuard`, `pricing`, `VideoPlayer`, `YouTubeVideoPlayer`, `SectionQuiz`, `payments`, `not-found`, and `app/zed`.

   Concrete fix: do not delete the override block globally. First scope it behind a compatibility wrapper, for example `.tailwind-light-compat .bg-slate-950 { ... }`, and add that wrapper only around legacy dark-token surfaces. Migrate active buckets to explicit Kresco/admin light tokens in this order: dashboard exam/topic shells, auth/pricing/payment states, activities/simulators/animated source ports, then Zed/video components. Delete the compatibility block only after the exact-token map returns zero unscoped matches.

3. LOW - `frontend/components/zed/PdfViewerCore.tsx:46` - The PDF split boundary is verified, but the current component couples two persistence layers that must not be accidentally merged during refactor.

   Quoted evidence:
   > `frontend/components/zed/PdfViewerCore.tsx:46: const DB_NAME = 'kresco_zed_workspace'`
   > `frontend/components/zed/PdfViewerCore.tsx:48: const DOC_STORE = 'documents'`
   > `frontend/components/zed/PdfViewerCore.tsx:52: const ANNOTATION_STORAGE_PREFIX = 'kresco:zed:annotations:v1'`
   > `frontend/components/zed/PdfViewerCore.tsx:125:     const request = indexedDB.open(DB_NAME, DB_VERSION)`
   > `frontend/components/zed/PdfViewerCore.tsx:160:     const transaction = db.transaction(DOC_STORE, 'readwrite')`
   > `frontend/components/zed/PdfViewerCore.tsx:204: function annotationStorageKey(documentId: string) {`
   > `frontend/components/zed/PdfViewerCore.tsx:209:   const raw = zedStorageGetItem(annotationStorageKey(documentId))`
   > `frontend/components/zed/PdfViewerCore.tsx:220:   if (annotations.length === 0) zedStorageRemoveItemDeferred(annotationStorageKey(documentId))`
   > `frontend/components/zed/PdfViewerCore.tsx:221:   else zedStorageSetItemDeferred(annotationStorageKey(documentId), JSON.stringify(annotations))`
   > `frontend/components/zed/PdfViewerCore.tsx:561:       zedStorageRemoveItem(annotationStorageKey(id))`
   > `frontend/components/zed/PdfViewerCore.tsx:941:           <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-6 text-slate-500">Files, notes, and annotations stay on this device for now.</p>`

   Concrete fix: split mechanically along the existing persistence boundary: `pdfDocumentStore.ts` for IndexedDB document CRUD, `pdfAnnotationStore.ts` for `annotationStorageKey`/read/write/remove via `zedStorage`, `usePdfRenderer.ts` for PDF.js lifecycle, and view components for toolbar, page canvas, annotation layer, and text editor. Keep `removeDocument` deleting the annotation key for the removed document, and add focused tests around annotation read/write/remove before changing storage format.

## Leads - precise remaining questions or `None`

None.

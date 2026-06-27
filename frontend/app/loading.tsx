import { SkeletonBlock } from '@/components/figma/skeletons'

export default function AppLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-6">
      <div className="w-full max-w-[420px]">
        <SkeletonBlock className="mx-auto h-12 w-12 rounded-2xl" />
        <SkeletonBlock className="mx-auto mt-5 h-5 w-48 rounded-[8px]" />
        <SkeletonBlock className="mx-auto mt-3 h-4 w-72 max-w-full rounded-[6px]" />
      </div>
    </main>
  )
}

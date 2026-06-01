import type { TabContent } from '@/lib/topicWorkspaceViewModel'

export function resolvedTabContentId(tab: Pick<TabContent, 'id'>) {
  return tab.id > 0 ? tab.id : null
}

export function EmptyTabPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="grid min-h-[156px] max-w-[760px] place-items-center rounded-[16px] border border-dashed border-[#d4d4d8] bg-[#f7f8fb] px-6 py-8 text-center">
      <div>
        <p className="m-0 text-[16px] font-black text-[#3f3f46]">{title}</p>
        <p className="m-0 mt-2 text-[13px] font-semibold leading-6 text-[#71717b]">{message}</p>
      </div>
    </div>
  )
}

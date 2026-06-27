export function PermanentSidebarPanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="grid w-full gap-1 leading-[1.1]">
      <strong className="text-[16px] font-bold tracking-[0.24px] text-[#3f3f46]">{title}</strong>
      <span className="text-[14px] font-semibold tracking-[0.21px] text-[#71717b]">{subtitle}</span>
    </div>
  )
}

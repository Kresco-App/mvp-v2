import { Bell, NotebookTabs, User } from 'lucide-react'
import KrescoWordmark from '@/components/KrescoWordmark'
import { figmaNavItems } from './data'
import type { FigmaNavKey } from './types'

export function FigmaNavbar({ active = 'home' }: { active?: FigmaNavKey }) {
  return (
    <nav className="flex h-16 w-full max-w-[1918px] items-center justify-center border-b border-[#f4f4f5] bg-white px-8 shadow-[0_0_7.5px_rgba(24,24,27,0.1)]">
      <div className="flex h-full w-full max-w-[1440px] items-center gap-6 overflow-hidden">
        <div className="flex h-full w-[82px] shrink-0 items-center overflow-hidden">
          <KrescoWordmark />
        </div>

        <div className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden">
          {figmaNavItems.map(({ key, label, icon: Icon }) => {
            const isActive = active === key
            return (
              <span className="flex h-full shrink-0 items-center justify-center gap-2 px-4" key={key}>
                <Icon size={19} strokeWidth={2.2} className={isActive ? 'text-[#3a2fd3]' : 'text-[#52525c]'} />
                <span className={`whitespace-nowrap text-center text-[16px] font-bold leading-[1.2] tracking-[0.16px] ${isActive ? 'text-[#3a2fd3]' : 'text-[#52525c]'}`}>{label}</span>
              </span>
            )
          })}
          <span className={`absolute bottom-0 h-0.5 bg-[#3a2fd3] ${navDividerClass(active)}`} />
        </div>

        <div className="flex h-full min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden">
          <span className="grid h-11 w-11 place-items-center rounded-[14px] text-[#52525c]">
            <NotebookTabs size={19} strokeWidth={2.2} />
          </span>
          <span className="grid h-11 w-11 place-items-center rounded-[14px] text-[#52525c]">
            <Bell size={19} strokeWidth={2.2} />
          </span>
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-[14px] bg-[#e4e4e7] text-[#3a2fd3]">
            <User size={19} strokeWidth={2.2} />
          </span>
        </div>
      </div>
    </nav>
  )
}

function navDividerClass(active: FigmaNavKey) {
  const map: Record<FigmaNavKey, string> = {
    home: 'left-0 w-[104px]',
    courses: 'left-[104px] w-[121px]',
    calendar: 'left-[225px] w-[127px]',
    leaderboard: 'left-[352px] w-[154px]',
    live: 'left-[506px] w-[90px]',
  }

  return map[active]
}

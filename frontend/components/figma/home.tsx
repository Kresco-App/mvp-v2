import Link from 'next/link'
import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dna,
  Flame,
  FlaskConical,
  Globe2,
  Microscope,
  Trophy,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { FigmaContinueTopicSkeleton, FigmaSubjectShortcutSkeleton } from './skeletons'

export type FigmaStat = {
  label: string
  value: number | string
}

export type FigmaStudyDay = {
  day: string
  date: number | string
  active?: boolean
}

export type FigmaDailyQuest = {
  id: number | string
  quest_type?: string
  title: string
  target: number
  progress: number
  xp_reward?: number
  completed?: boolean
}

export type FigmaHomeSubject = {
  id: number | string
  title: string
  description?: string
  progress_pct?: number
  learner_count?: string
  href?: string
}

export type FigmaHomeTopic = {
  id: number | string
  subject_title: string
  title: string
  description?: string
  progress_pct?: number
  item_count?: number
  completed_count?: number
  href?: string
}

export function FigmaHomeMain({
  firstName,
  subjects,
  continueTopics,
  loading,
}: {
  firstName: string
  subjects: FigmaHomeSubject[]
  continueTopics: FigmaHomeTopic[]
  loading?: boolean
}) {
  return (
    <div className="w-full pt-[32px]">
      <section className="mb-[58px]">
        <div className="mb-[32px]">
          <h1 className="m-0 text-[24px] font-bold leading-[1.4] tracking-[0.24px] text-[#3f3f46]">Hello {firstName}!</h1>
          <p className="m-0 text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#9f9fa9]">
            Wanna complete where we left off last time?
          </p>
        </div>

        {loading ? (
          <div className="grid max-w-[984px] gap-[24px] min-[960px]:grid-cols-[repeat(2,480px)]">
            {Array.from({ length: 2 }).map((_, index) => (
              <FigmaContinueTopicSkeleton key={index} index={index} />
            ))}
          </div>
        ) : (
          <div className="grid max-w-[984px] gap-[24px] min-[960px]:grid-cols-[repeat(2,480px)]">
            {continueTopics.slice(0, 2).map((topic, index) => (
              <FigmaContinueTopicCard key={topic.id} topic={topic} index={index} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-[22px]">
          <h2 className="m-0 text-[21px] font-bold leading-none tracking-normal text-[#3f3f46]">Subjects</h2>
          <p className="m-0 mt-[8px] text-[14px] font-bold leading-none tracking-normal text-[#a1a1aa]">Select what you want to study</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-[repeat(5,176px)] gap-[20px] max-[1180px]:grid-cols-[repeat(auto-fit,176px)]">
            {Array.from({ length: 5 }).map((_, index) => (
              <FigmaSubjectShortcutSkeleton key={index} index={index} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(5,176px)] gap-[20px] max-[1180px]:grid-cols-[repeat(auto-fit,176px)]">
            {subjects.map((subject, index) => (
              <FigmaSubjectShortcutCard key={subject.id} subject={subject} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function FigmaHomeProgressCard({
  topics,
  done,
  xp,
}: {
  topics: number
  done: number
  xp: number
}) {
  return (
    <FigmaDashboardCard
      icon={Trophy}
      iconTone="blue"
      title="Progress"
      subtitle="Current Bac foundation"
    >
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Topics', value: topics },
          { label: 'Done', value: done },
          { label: 'XP', value: xp },
        ].map((item) => (
          <FigmaMetricTile item={item} key={item.label} />
        ))}
      </div>
    </FigmaDashboardCard>
  )
}

function FigmaContinueTopicCard({ topic, index }: { topic: FigmaHomeTopic; index: number }) {
  const href = topic.href ?? `/topics/${topic.id}`
  const progress = clampPercent(topic.progress_pct ?? (index === 0 ? 12 : 46))
  const progressTone = index % 2 === 0 ? '#5b60f9' : '#f5900b'
  const isMathCard = index % 2 === 0

  return (
    <Link href={href} className="group block w-full max-w-[480px] no-underline">
      <article className="kresco-enter relative flex h-[110px] w-full max-w-[480px] items-end justify-end gap-[32px] overflow-hidden rounded-[16px] border-[2px] border-[#e4e4e7] bg-white pl-[16px] pt-[16px] shadow-[0_4px_0_rgba(24,24,27,0.12)] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-[#d7d7dc] group-hover:shadow-[0_7px_0_rgba(69,61,238,0.14),0_16px_30px_rgba(24,24,27,0.08)]" style={{ animationDelay: `${index * 60}ms` }}>
        <div className="min-w-0 flex-1 self-stretch pr-[18px]">
          <h3 className="m-0 line-clamp-1 text-[16px] font-bold leading-[1.1] tracking-[0.24px] text-[#3f3f46]">{topic.title}</h3>
          <p className="m-0 mt-[4px] line-clamp-2 max-w-[300px] text-[14px] font-semibold leading-[1.1] tracking-[0.21px] text-[#71717b]">
            {topic.description || topic.subject_title}
          </p>
          <div className="absolute left-[16px] top-[82px] h-[10px] w-[300px] overflow-hidden rounded-[4.286px] bg-[#f4f4f5]">
            <span
              className="kresco-progress-fill block h-full rounded-[4.286px] shadow-[inset_0_2.857px_2.857px_rgba(255,255,255,0.4),inset_0_-2.857px_2.857px_rgba(0,0,0,0.08)]"
              style={{ backgroundColor: progressTone, width: `${Math.max(14, progress)}%` }}
            />
          </div>
        </div>

        <div className="relative h-[96px] w-[132px] shrink-0 overflow-hidden transition-transform duration-300 group-hover:scale-[1.025]">
          <div className={`absolute inset-0 ${isMathCard ? 'bg-[#eef1ff]' : 'bg-[#e6f9ef]'}`} />
          {isMathCard ? (
            <div className="absolute bottom-[-4px] left-[9px] right-[-8px] top-[7px]">
              <img alt="" className="absolute inset-0 block h-full w-full max-w-none" src="/figma-assets/home-continue-book.svg" />
            </div>
          ) : (
            <div className="absolute bottom-[-2px] right-[8px] grid h-[84px] w-[84px] place-items-center rounded-full bg-[#40cf5b] text-[#2387d9]">
              <Globe2 size={54} strokeWidth={2.4} />
            </div>
          )}
        </div>
      </article>
    </Link>
  )
}

function FigmaSubjectShortcutCard({ subject, index }: { subject: FigmaHomeSubject; index: number }) {
  const Icon = subjectIcon(subject.title, index)
  const href = subject.href ?? `/home/${subject.id}`

  return (
    <Link href={href} className="group block no-underline">
      <article className="kresco-enter grid h-[194px] w-[176px] place-items-center content-center gap-[24px] rounded-[14px] border-[2px] border-[#e4e4e7] bg-white px-[14px] pb-[28px] pt-[35px] text-center shadow-[0_5px_0_rgba(24,24,27,0.12)] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-[#d7d7dc] group-hover:shadow-[0_8px_0_rgba(69,61,238,0.12),0_16px_28px_rgba(24,24,27,0.07)]" style={{ animationDelay: `${index * 45}ms` }}>
        <div className="relative grid h-[68px] w-[78px] place-items-center">
          <SubjectIconScene icon={Icon} index={index} />
        </div>
        <div className="min-w-0">
          <h3 className="m-0 line-clamp-2 text-[17px] font-bold leading-[1.05] tracking-normal text-[#3f3f46]">{subject.title}</h3>
        </div>
      </article>
    </Link>
  )
}

function SubjectIconScene({ icon: Icon, index }: { icon: LucideIcon; index: number }) {
  const scenes = [
    'bg-[#eff3ff] text-[#5568ff]',
    'bg-[#f5edff] text-[#8254dd]',
    'bg-[#fff4d9] text-[#b48700]',
    'bg-[#f2edff] text-[#7b3de0]',
    'bg-[#fff1c8] text-[#d5a415]',
  ]

  return (
    <div className={`relative grid h-[66px] w-[66px] place-items-center rounded-[18px] transition-transform duration-300 group-hover:scale-105 ${scenes[index % scenes.length]}`}>
      <Icon size={43} strokeWidth={2.25} className="relative z-10" />
    </div>
  )
}

function subjectIcon(title: string, index: number): LucideIcon {
  const normalized = title.toLowerCase()
  if (normalized.includes('math')) return Calculator
  if (normalized.includes('phys')) return Microscope
  if (normalized.includes('philo')) return Brain
  if (normalized.includes('chem') || normalized.includes('chim')) return FlaskConical
  if (normalized.includes('bio') || normalized.includes('svt')) return Dna
  if (normalized.includes('english')) return BookOpen
  if (normalized.includes('geo')) return Globe2
  return [Calculator, Atom, Brain, Dna, BookOpen][index % 5]
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function FigmaStudyWeekCard({
  days = defaultStudyDays,
}: {
  days?: FigmaStudyDay[]
}) {
  return (
    <FigmaDashboardCard
      icon={CalendarDays}
      iconTone="yellow"
      title="Study Week"
      subtitle="Local schedule shell"
    >
      <div className="grid grid-cols-5 gap-3">
        {days.map((day) => (
          <div
            className={`grid h-24 place-items-center content-center gap-2 rounded-2xl text-center ${
              day.active ? 'bg-[#453dee] text-white' : 'bg-[#f7f7f9] text-[#767987]'
            }`}
            key={`${day.day}-${day.date}`}
          >
            <strong className="block text-[23px] font-bold leading-none tracking-normal">{day.date}</strong>
            <span className="block text-[23px] font-bold leading-none tracking-normal">{day.day}</span>
          </div>
        ))}
      </div>
    </FigmaDashboardCard>
  )
}

export function FigmaDailyFocusCard() {
  return (
    <FigmaDashboardCard
      icon={Flame}
      iconTone="pink"
      title="Daily Focus"
      subtitle="Suggested local flow"
    >
      <div className="grid gap-[18px]">
        {[
          { label: 'Open one lesson', Icon: Clock3 },
          { label: 'Submit one quiz', Icon: CheckCircle2 },
          { label: 'Save one note', Icon: Zap },
        ].map(({ label, Icon }) => (
          <div className="flex h-[66px] items-center gap-[18px] rounded-[22px] bg-[#f7f7f9] px-5 text-[#453dee]" key={label}>
            <Icon size={22} strokeWidth={2.6} />
            <strong className="text-[21px] font-bold leading-none tracking-normal text-[#51515c]">{label}</strong>
          </div>
        ))}
      </div>
    </FigmaDashboardCard>
  )
}

export function FigmaDailyQuestsCard({
  quests,
}: {
  quests: FigmaDailyQuest[]
}) {
  const safeQuests = quests.length > 0 ? quests : fallbackQuests

  return (
    <section className="w-full rounded-[24px] border-[3px] border-[#e4e4e7] bg-white px-[24px] py-[24px] text-[#3d3d46] shadow-none">
      <div className="mb-11 grid gap-1">
        <strong className="block text-[25px] font-bold leading-[1.05] tracking-normal text-[#34343d]">Daily Quests</strong>
        <span className="block text-[19px] font-bold leading-[1.15] tracking-normal text-[#6f7280]">Start learning now!</span>
      </div>

      <div className="grid gap-7">
        {safeQuests.map((quest, index) => {
          const tone = questTone(quest.quest_type, index)
          const Icon = questIcon(quest.quest_type)
          const pct = Math.max(0, Math.min(100, Math.round((quest.progress / Math.max(quest.target, 1)) * 100)))

          return (
            <div className="grid grid-cols-[49px_1fr] items-center gap-[23px]" style={{ color: tone }} key={quest.id}>
              <span className="grid h-[49px] w-[49px] place-items-center rounded-full border-[3px] border-current">
                <Icon size={24} strokeWidth={2.8} />
              </span>
              <div className="min-w-0">
                <strong className="mb-4 block text-[24px] font-bold leading-[1.05] tracking-normal text-[#41424c]">{quest.title}</strong>
                <span className="block h-[21px] overflow-hidden rounded-[7px] bg-[#f4f4f5]">
                  <i className="block h-full rounded-[5px] bg-current shadow-[inset_0_-4px_6px_rgba(0,0,0,0.08)]" style={{ width: `${pct}%` }} />
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function FigmaDashboardCard({
  icon: Icon,
  iconTone,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  iconTone: 'blue' | 'yellow' | 'pink'
  title: string
  subtitle: string
  children: ReactNode
}) {
  const toneClass = {
    blue: 'bg-[#eef1ff] text-[#453dee]',
    yellow: 'bg-[#fff7df] text-[#ff8a00]',
    pink: 'bg-[#fff0f6] text-[#ff4646]',
  }[iconTone]

  return (
    <section className="w-full rounded-[24px] border-[3px] border-[#e4e4e7] bg-white px-[31px] py-7 text-[#3d3d46] shadow-none">
      <div className="mb-8 grid grid-cols-[66px_1fr] items-center gap-[18px]">
        <span className={`grid h-[66px] w-[66px] place-items-center rounded-[22px] ${toneClass}`}>
          <Icon size={29} strokeWidth={2.5} />
        </span>
        <div className="grid gap-1">
          <strong className="block text-[25px] font-bold leading-[1.05] tracking-normal text-[#34343d]">{title}</strong>
          <span className="block text-[19px] font-bold leading-[1.15] tracking-normal text-[#6f7280]">{subtitle}</span>
        </div>
      </div>
      {children}
    </section>
  )
}

function FigmaMetricTile({ item }: { item: FigmaStat }) {
  return (
    <div className="grid min-h-[103px] place-items-center content-center gap-[7px] rounded-[22px] bg-[#f7f7f9] text-center">
      <strong className="text-[27px] font-bold leading-none tracking-normal text-[#34343d]">{item.value}</strong>
      <span className="text-[17px] font-bold leading-none tracking-normal text-[#9a9ca8]">{item.label}</span>
    </div>
  )
}

function questIcon(type?: string) {
  if (type?.includes('quiz') || type?.includes('exercise')) return Trophy
  if (type?.includes('time') || type?.includes('study')) return Clock3
  if (type?.includes('lesson')) return Zap
  return BookOpen
}

function questTone(type: string | undefined, index: number) {
  if (type?.includes('lesson')) return '#ff8a00'
  if (type?.includes('quiz') || type?.includes('exercise')) return '#5c5bff'
  if (type?.includes('time') || type?.includes('study')) return '#2e86ff'
  return ['#ff8a00', '#5c5bff', '#2e86ff'][index % 3]
}

const defaultStudyDays: FigmaStudyDay[] = [
  { date: 10, day: 'Mon' },
  { date: 11, day: 'Tue' },
  { date: 12, day: 'Wed', active: true },
  { date: 13, day: 'Thu' },
  { date: 14, day: 'Fri' },
]

const fallbackQuests: FigmaDailyQuest[] = [
  { id: 'lesson', quest_type: 'lesson', title: 'Complete 1 Mathematics Lesson', progress: 3, target: 4 },
  { id: 'quiz', quest_type: 'quiz', title: 'Score 14/20 or higher in 2 exercises', progress: 1, target: 5 },
  { id: 'study', quest_type: 'study_time', title: 'Spend 15min In studying Physics', progress: 2, target: 6 },
]

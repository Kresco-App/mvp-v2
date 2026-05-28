import ProfessorAuthGate from './ProfessorAuthGate'
import ProfessorTopNav from './ProfessorTopNav'

export default function ProfessorShell({ children }: { children: React.ReactNode }) {
  return (
    <ProfessorAuthGate>
      <div className="min-h-screen bg-[#fbfbfc]">
        <ProfessorTopNav />
        {children}
      </div>
    </ProfessorAuthGate>
  )
}

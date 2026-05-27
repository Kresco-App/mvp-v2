import { Check, CircleDot, RotateCcw } from 'lucide-react'

export function Feedback({ correct, text, neutral = false }: { correct: boolean; text: string; neutral?: boolean }) {
  if (neutral) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f7f8fb] px-4 py-3 text-[#71717b]">
        <span className="text-[13px] font-black">{text}</span>
        <CircleDot size={17} />
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-between gap-3 rounded-[12px] px-4 py-3 ${correct ? 'bg-[#f0fdf4] text-[#15803d]' : 'bg-[#fff7df] text-[#b76b00]'}`}>
      <span className="text-[13px] font-black">{text}</span>
      {correct ? <Check size={17} /> : <RotateCcw size={17} />}
    </div>
  )
}

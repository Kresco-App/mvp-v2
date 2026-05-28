'use client'

import { motion } from 'framer-motion'
import { ListChecks } from 'lucide-react'
import Image from 'next/image'
import { quizPrimitiveTypeIcons } from './QuizPrimitiveIcons'
import { QuestionRenderer } from './QuizPrimitiveRenderers'
import type { QuizPrimitiveQuestion } from '@/lib/quizPrimitiveViewModel'

export function QuizQuestionShell({ question }: { question: QuizPrimitiveQuestion }) {
  const Icon = quizPrimitiveTypeIcons[question.type] ?? ListChecks

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className="grid gap-5"
    >
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 flex-none place-items-center rounded-[14px] bg-[#453dee] text-white">
          <Icon size={22} strokeWidth={2.7} />
        </div>
        <div className="min-w-0">
          <h3 className="m-0 text-[24px] font-black leading-tight text-[#3f3f46]">{question.title}</h3>
          <p className="m-0 mt-2 text-[16px] font-bold leading-snug text-[#52525c]">{question.prompt}</p>
          {question.hook && (
            <p className="m-0 mt-3 inline-flex rounded-full bg-[#fff7df] px-3 py-1 text-[12px] font-black text-[#9a5c00]">
              {question.hook}
            </p>
          )}
        </div>
      </div>

      {'media' in question && question.media && question.type !== 'image_hotspot' && (
        <div className="relative h-[210px] w-full overflow-hidden rounded-[14px] border border-[#e4e4e7]">
          <Image
            src={question.media.src}
            alt={question.media.alt}
            fill
            sizes="(max-width: 760px) 100vw, 720px"
            className="object-cover"
          />
        </div>
      )}

      <QuestionRenderer question={question} />
    </motion.div>
  )
}

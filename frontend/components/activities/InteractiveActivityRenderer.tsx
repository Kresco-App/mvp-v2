'use client'

import dynamic from 'next/dynamic'
import TrueFalse from './TrueFalse'
import Matching from './Matching'
import FillInBlank from './FillInBlank'
import Ordering from './Ordering'
import DragAndDrop from './DragAndDrop'
import OndeCaracteristiques from './ondes/OndeCaracteristiques'
import OndePropagation from './ondes/OndePropagation'
import OndeTrueFalse from './ondes/OndeTrueFalse'
import EnsemblesLab from './math/EnsemblesLab'
import LimitesContinuiteLab from './math/LimitesContinuiteLab'
import { CheckCircle2, FlaskConical } from 'lucide-react'

const WaveSimulator = dynamic(() => import('@/components/simulators/WaveSimulator'), { ssr: false })
const PrismSimulator = dynamic(() => import('@/components/simulators/PrismSimulator'), { ssr: false })
const DiffractionSimulator = dynamic(() => import('@/components/simulators/DiffractionSimulator'), { ssr: false })
const DescartesBasicsSimulator = dynamic(() => import('@/components/simulators/DescartesBasicsSimulator'), { ssr: false })

interface Props {
  activityType?: string
  activityData?: any
  onComplete?: (correct: boolean) => void
  showSimulatorCompleteButton?: boolean
}

function SimulatorBlock({
  simulatorType,
  title,
  description,
  onComplete,
  showCompleteButton,
}: {
  simulatorType: string
  title?: string
  description?: string
  onComplete?: (correct: boolean) => void
  showCompleteButton?: boolean
}) {
  return (
    <div className="w-full">
      <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center">
            <FlaskConical size={18} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">{title ?? 'Simulateur interactif'}</h3>
            {description && <p className="text-slate-400 text-sm mt-0.5">{description}</p>}
          </div>
        </div>

        {simulatorType === 'wave' && <WaveSimulator />}
        {simulatorType === 'prism' && <PrismSimulator />}
        {simulatorType === 'diffraction' && <DiffractionSimulator />}
        {simulatorType === 'descartes' && <DescartesBasicsSimulator />}
        {!['wave', 'prism', 'diffraction', 'descartes'].includes(simulatorType) && (
          <p className="text-slate-400">Simulateur inconnu : {simulatorType}</p>
        )}

        {showCompleteButton && (
          <button
            onClick={() => onComplete?.(true)}
            className="mt-6 inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            <CheckCircle2 size={15} />
            Marquer comme terminee
          </button>
        )}
      </div>
    </div>
  )
}

export default function InteractiveActivityRenderer({
  activityType,
  activityData,
  onComplete,
  showSimulatorCompleteButton = false,
}: Props) {
  if (!activityType) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-400">Aucune activite disponible.</p>
      </div>
    )
  }

  switch (activityType) {
    case 'true_false':
      return (
        <div className="max-w-lg mx-auto">
          <TrueFalse
            statement={activityData?.statement}
            isTrue={activityData?.correct}
            explanation={activityData?.explanation}
            onComplete={onComplete}
          />
        </div>
      )

    case 'matching':
      return (
        <div className="max-w-lg mx-auto">
          <Matching
            question={activityData?.question || 'Associez les elements correspondants'}
            pairs={activityData?.pairs || []}
            onComplete={onComplete}
          />
        </div>
      )

    case 'fill_in_blank':
      return (
        <div className="max-w-lg mx-auto">
          <FillInBlank
            sentence={activityData?.sentence}
            answer={activityData?.answer}
            hint={activityData?.hint}
            onComplete={onComplete}
          />
        </div>
      )

    case 'ordering':
      return (
        <div className="max-w-lg mx-auto">
          <Ordering
            question={activityData?.question || 'Remettez les elements dans le bon ordre'}
            items={activityData?.items || []}
            correctOrder={activityData?.correctOrder || []}
            onComplete={onComplete}
          />
        </div>
      )

    case 'drag_and_drop':
      return (
        <div className="max-w-lg mx-auto">
          <DragAndDrop
            question={activityData?.question || 'Glissez les elements dans les zones correspondantes'}
            items={activityData?.items || []}
            zones={activityData?.zones || []}
            onComplete={onComplete}
          />
        </div>
      )

    case 'simulator':
      return (
        <SimulatorBlock
          simulatorType={activityData?.simulator_type}
          title={activityData?.title}
          description={activityData?.description}
          onComplete={onComplete}
          showCompleteButton={showSimulatorCompleteButton}
        />
      )

    case 'wave_simulator':
    case 'descartes_basics_simulator':
      return (
        <SimulatorBlock
          simulatorType="descartes"
          title={activityData?.title || 'Bases de Descartes'}
          description={activityData?.description}
          onComplete={onComplete}
          showCompleteButton={showSimulatorCompleteButton}
        />
      )

    case 'prism_simulator':
      return (
        <SimulatorBlock
          simulatorType="prism"
          title={activityData?.title || 'Prisme et dispersion'}
          description={activityData?.description}
          onComplete={onComplete}
          showCompleteButton={showSimulatorCompleteButton}
        />
      )

    case 'diffraction_simulator':
      return (
        <SimulatorBlock
          simulatorType="diffraction"
          title={activityData?.title || 'Diffraction de la lumiere'}
          description={activityData?.description}
          onComplete={onComplete}
          showCompleteButton={showSimulatorCompleteButton}
        />
      )

    case 'OndeCaracteristiques':
    case 'onde_caracteristiques':
      return <OndeCaracteristiques {...activityData} onComplete={onComplete} />

    case 'OndePropagation':
    case 'onde_propagation':
      return <OndePropagation {...activityData} onComplete={onComplete} />

    case 'OndeTrueFalse':
    case 'onde_true_false':
      return <OndeTrueFalse {...activityData} onComplete={onComplete} />

    case 'math_ensembles_lab':
      return <EnsemblesLab {...activityData} onComplete={onComplete} />

    case 'math_limites_continuite_lab':
      return <LimitesContinuiteLab {...activityData} onComplete={onComplete} />

    default:
      return (
        <div className="flex items-center justify-center py-16">
          <p className="text-slate-400">Type d&apos;activite non supporte : {activityType}</p>
        </div>
      )
  }
}

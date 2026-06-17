'use client'

import dynamic from 'next/dynamic'
import { Component, Suspense, lazy, type ReactNode } from 'react'
import { CheckCircle2, FlaskConical } from 'lucide-react'

const TrueFalse = lazy(() => import('./TrueFalse'))
const Matching = lazy(() => import('./Matching'))
const FillInBlank = lazy(() => import('./FillInBlank'))
const Ordering = lazy(() => import('./Ordering'))
const DragAndDrop = lazy(() => import('./DragAndDrop'))
const OndeCaracteristiques = dynamic(() => import('./ondes/OndeCaracteristiques'), { ssr: false })
const OndePropagation = dynamic(() => import('./ondes/OndePropagation'), { ssr: false })
const OndeTrueFalse = dynamic(() => import('./ondes/OndeTrueFalse'), { ssr: false })
const EnsemblesLab = dynamic(() => import('./math/EnsemblesLab'), { ssr: false })
const LimitesContinuiteLab = dynamic(() => import('./math/LimitesContinuiteLab'), { ssr: false })

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

type ActivityErrorBoundaryProps = {
  children: ReactNode
  activityLabel: string
}

type ActivityErrorBoundaryState = {
  error: Error | null
}

class ActivityErrorBoundary extends Component<ActivityErrorBoundaryProps, ActivityErrorBoundaryState> {
  state: ActivityErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
          <p className="font-semibold text-rose-100">Impossible de charger l&apos;activite.</p>
          <p className="mt-1 text-rose-200/80">
            {this.props.activityLabel} a rencontre une erreur de chargement.
          </p>
        </div>
      )
    }

    return this.props.children
  }
}

function ActivityLoadingState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-8 text-sm text-slate-400">
      Chargement de {label.toLowerCase()}...
    </div>
  )
}

function renderLazyActivity(
  node: ReactNode,
  fallbackLabel: string,
  key: string,
) {
  return (
    <ActivityErrorBoundary activityLabel={fallbackLabel} key={key}>
      <Suspense fallback={<ActivityLoadingState label={fallbackLabel} />}>
        {node}
      </Suspense>
    </ActivityErrorBoundary>
  )
}

function activityInstanceKey(activityType: string, activityData: any) {
  const explicitId = activityData?.id ?? activityData?.activity_id ?? activityData?.slug
  if (explicitId != null && String(explicitId).trim() !== '') {
    return `${activityType}:${String(explicitId)}`
  }

  try {
    return `${activityType}:${JSON.stringify(activityData ?? {})}`
  } catch {
    return activityType
  }
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
          <button type="button"
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

  const lazyActivityKey = activityInstanceKey(activityType, activityData)

  switch (activityType) {
    case 'true_false':
      return renderLazyActivity(
        <div className="max-w-lg mx-auto">
          <TrueFalse
            statement={activityData?.statement}
            isTrue={activityData?.correct}
            explanation={activityData?.explanation}
            onComplete={onComplete}
          />
        </div>
        ,
        'Vrai/Faux',
        lazyActivityKey,
      )

    case 'matching':
      return renderLazyActivity(
        <div className="max-w-lg mx-auto">
          <Matching
            question={activityData?.question || 'Associez les elements correspondants'}
            pairs={activityData?.pairs || []}
            onComplete={onComplete}
          />
        </div>
        ,
        'Association',
        lazyActivityKey,
      )

    case 'fill_in_blank':
      return renderLazyActivity(
        <div className="max-w-lg mx-auto">
          <FillInBlank
            sentence={activityData?.sentence}
            answer={activityData?.answer}
            hint={activityData?.hint}
            onComplete={onComplete}
          />
        </div>
        ,
        'Texte a trous',
        lazyActivityKey,
      )

    case 'ordering':
      return renderLazyActivity(
        <div className="max-w-lg mx-auto">
          <Ordering
            question={activityData?.question || 'Remettez les elements dans le bon ordre'}
            items={activityData?.items || []}
            correctOrder={activityData?.correctOrder || []}
            onComplete={onComplete}
          />
        </div>
        ,
        'Ordre logique',
        lazyActivityKey,
      )

    case 'drag_and_drop':
      return renderLazyActivity(
        <div className="max-w-lg mx-auto">
          <DragAndDrop
            question={activityData?.question || 'Glissez les elements dans les zones correspondantes'}
            items={activityData?.items || []}
            zones={activityData?.zones || []}
            onComplete={onComplete}
          />
        </div>
        ,
        'Glisser-deposer',
        lazyActivityKey,
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

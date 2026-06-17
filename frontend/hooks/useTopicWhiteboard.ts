'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types'
import { apiDataErrorMessage, apiErrorStatus } from '@/lib/apiData'
import { getJson, putJson } from '@/lib/apiClient'

export type CanvasTargetType = 'topic_item' | 'exercise' | 'exam_problem'
export type CanvasScene = {
  type?: string
  version?: number
  source?: string
  elements?: unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
  [key: string]: unknown
}

export type CanvasSyncStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'offline' | 'error' | 'conflict'

type CanvasDocument = {
  id: number | null
  target_type: CanvasTargetType
  target_id: number
  subject_id?: number | null
  topic_id?: number | null
  topic_item_id?: number | null
  scene_json: CanvasScene
  scene_version: number
  created_at?: string | null
  updated_at?: string | null
}

type LocalCanvasDraft = {
  scene: CanvasScene
  baseVersion: number
  dirty: boolean
  updatedAt: number
}

const AUTOSAVE_DELAY_MS = 1600
const EMPTY_CANVAS_SCENE: CanvasScene = {
  type: 'excalidraw',
  version: 1,
  source: 'kresco',
  elements: [],
  appState: {
    viewBackgroundColor: '#ffffff',
  },
  files: {},
}

export function useTopicWhiteboard({
  targetType,
  targetId,
}: {
  targetType: CanvasTargetType
  targetId: number
}) {
  const draftKey = useMemo(() => `kresco:whiteboard:${targetType}:${targetId}`, [targetId, targetType])
  const [scene, setScene] = useState<CanvasScene>(EMPTY_CANVAS_SCENE)
  const [sceneVersion, setSceneVersion] = useState(0)
  const [syncStatus, setSyncStatus] = useState<CanvasSyncStatus>('loading')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [sceneLoadKey, setSceneLoadKey] = useState(0)
  const sceneRef = useRef(scene)
  const sceneVersionRef = useRef(sceneVersion)
  const isDirtyRef = useRef(false)
  const savingRef = useRef(false)
  const loadedRef = useRef(false)
  const initialSerializedScene = serializeScene(scene)
  const lastSerializedSceneRef = useRef(initialSerializedScene)
  const currentSerializedSceneRef = useRef(initialSerializedScene)

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    sceneVersionRef.current = sceneVersion
  }, [sceneVersion])

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    const controller = new AbortController()
    loadedRef.current = false
    setSyncStatus('loading')
    setErrorMessage('')

    getJson<CanvasDocument>('/interactions/canvas', {
      params: {
        target_type: targetType,
        target_id: targetId,
      },
      signal: controller.signal,
    })
      .then((document) => {
        if (controller.signal.aborted) return
        const localDraft = readLocalCanvasDraft(draftKey)
        const serverUpdatedAt = timestampMs(document.updated_at)
        const shouldUseLocalDraft = Boolean(localDraft?.dirty && localDraft.updatedAt >= serverUpdatedAt)
        const nextScene = normalizeCanvasScene(shouldUseLocalDraft && localDraft ? localDraft.scene : document.scene_json)
        const nextVersion = shouldUseLocalDraft && localDraft ? localDraft.baseVersion : document.scene_version

        lastSerializedSceneRef.current = serializeScene(nextScene)
        currentSerializedSceneRef.current = lastSerializedSceneRef.current
        sceneRef.current = nextScene
        sceneVersionRef.current = nextVersion
        isDirtyRef.current = shouldUseLocalDraft
        loadedRef.current = true
        setScene(nextScene)
        setSceneVersion(nextVersion)
        setLastSyncedAt(document.updated_at ?? null)
        setIsDirty(shouldUseLocalDraft)
        setSyncStatus(shouldUseLocalDraft ? 'offline' : 'saved')
        setSceneLoadKey((value) => value + 1)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        const localDraft = readLocalCanvasDraft(draftKey)
        if (localDraft) {
          const nextScene = normalizeCanvasScene(localDraft.scene)
          lastSerializedSceneRef.current = serializeScene(nextScene)
          currentSerializedSceneRef.current = lastSerializedSceneRef.current
          sceneRef.current = nextScene
          sceneVersionRef.current = localDraft.baseVersion
          isDirtyRef.current = localDraft.dirty
          loadedRef.current = true
          setScene(nextScene)
          setSceneVersion(localDraft.baseVersion)
          setIsDirty(localDraft.dirty)
          setSyncStatus('offline')
          setErrorMessage(apiDataErrorMessage(error, 'Loaded your local whiteboard draft.'))
          setSceneLoadKey((value) => value + 1)
          return
        }
        loadedRef.current = true
        setSyncStatus('error')
        setErrorMessage(apiDataErrorMessage(error, 'Could not load whiteboard.'))
      })

    return () => {
      controller.abort()
    }
  }, [draftKey, targetId, targetType])

  const saveCanvas = useCallback(async (options: { notify?: boolean } = {}) => {
    if (!loadedRef.current || savingRef.current || !isDirtyRef.current) return
    const currentScene = sceneRef.current
    if (sceneContainsDataUrl(currentScene)) {
      setSyncStatus('error')
      setErrorMessage('Images need media storage before they can be saved on this whiteboard.')
      if (options.notify) toast.error('Images need media storage before saving.')
      return
    }

    savingRef.current = true
    setSyncStatus('saving')
    setErrorMessage('')
    try {
      const document = await putJson<CanvasDocument>('/interactions/canvas', {
        target_type: targetType,
        target_id: targetId,
        scene_json: currentScene,
        base_version: sceneVersionRef.current,
      })
      const nextScene = normalizeCanvasScene(document.scene_json)
      const serialized = serializeScene(nextScene)
      lastSerializedSceneRef.current = serialized
      currentSerializedSceneRef.current = serialized
      sceneRef.current = nextScene
      sceneVersionRef.current = document.scene_version
      isDirtyRef.current = false
      setScene(nextScene)
      setSceneVersion(document.scene_version)
      setLastSyncedAt(document.updated_at ?? null)
      setIsDirty(false)
      setSyncStatus('saved')
      writeLocalCanvasDraft(draftKey, {
        scene: nextScene,
        baseVersion: document.scene_version,
        dirty: false,
        updatedAt: Date.now(),
      })
      if (options.notify) toast.success('Whiteboard saved.')
    } catch (error) {
      const status = apiErrorStatus(error)
      const nextStatus: CanvasSyncStatus = status === 409 ? 'conflict' : 'error'
      setSyncStatus(nextStatus)
      setErrorMessage(apiDataErrorMessage(error, status === 409 ? 'This whiteboard changed elsewhere.' : 'Could not sync whiteboard.'))
      if (options.notify) toast.error(apiDataErrorMessage(error, 'Could not sync whiteboard.'))
    } finally {
      savingRef.current = false
    }
  }, [draftKey, targetId, targetType])

  useEffect(() => {
    if (!isDirty || syncStatus === 'saving' || syncStatus === 'loading') return
    const timeout = window.setTimeout(() => {
      void saveCanvas()
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [isDirty, saveCanvas, scene, syncStatus])

  const handleSceneChange = useCallback((elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
    if (!loadedRef.current) return
    const nextScene = normalizeCanvasScene({
      type: 'excalidraw',
      version: 1,
      source: 'kresco',
      elements: jsonClone(elements) as unknown[],
      appState: persistedAppState(appState),
      files: jsonClone(files) as Record<string, unknown>,
    })
    const serialized = serializeScene(nextScene)
    if (serialized === currentSerializedSceneRef.current) return

    currentSerializedSceneRef.current = serialized
    sceneRef.current = nextScene
    isDirtyRef.current = true
    setScene(nextScene)
    setIsDirty(true)
    setSyncStatus(sceneContainsDataUrl(nextScene) ? 'error' : 'dirty')
    setErrorMessage(sceneContainsDataUrl(nextScene) ? 'Images need media storage before they can be saved on this whiteboard.' : '')
    writeLocalCanvasDraft(draftKey, {
      scene: nextScene,
      baseVersion: sceneVersionRef.current,
      dirty: true,
      updatedAt: Date.now(),
    })
  }, [draftKey])

  const reloadFromServer = useCallback(() => {
    window.location.reload()
  }, [])

  return {
    scene,
    sceneVersion,
    sceneLoadKey,
    syncStatus,
    lastSyncedAt,
    errorMessage,
    isDirty,
    handleSceneChange,
    saveCanvas,
    reloadFromServer,
  }
}

export function normalizeCanvasScene(value: CanvasScene | null | undefined): CanvasScene {
  if (!value || typeof value !== 'object') return { ...EMPTY_CANVAS_SCENE }
  return {
    type: typeof value.type === 'string' ? value.type : 'excalidraw',
    version: typeof value.version === 'number' ? value.version : 1,
    source: typeof value.source === 'string' ? value.source : 'kresco',
    elements: Array.isArray(value.elements) ? value.elements : [],
    appState: value.appState && typeof value.appState === 'object' && !Array.isArray(value.appState)
      ? value.appState as Record<string, unknown>
      : EMPTY_CANVAS_SCENE.appState,
    files: value.files && typeof value.files === 'object' && !Array.isArray(value.files)
      ? value.files as Record<string, unknown>
      : {},
  }
}

export function canvasSceneToInitialData(scene: CanvasScene): ExcalidrawInitialDataState {
  const normalized = normalizeCanvasScene(scene)
  return {
    elements: normalized.elements ?? [],
    appState: {
      viewBackgroundColor: '#ffffff',
      ...(normalized.appState ?? {}),
    },
    files: normalized.files ?? {},
  } as ExcalidrawInitialDataState
}

function persistedAppState(appState: Record<string, unknown>) {
  return jsonClone({
    viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff',
    currentItemStrokeColor: appState.currentItemStrokeColor,
    currentItemBackgroundColor: appState.currentItemBackgroundColor,
    currentItemFillStyle: appState.currentItemFillStyle,
    currentItemStrokeWidth: appState.currentItemStrokeWidth,
    currentItemStrokeStyle: appState.currentItemStrokeStyle,
    currentItemRoughness: appState.currentItemRoughness,
    currentItemOpacity: appState.currentItemOpacity,
    currentItemFontFamily: appState.currentItemFontFamily,
    currentItemFontSize: appState.currentItemFontSize,
    currentItemTextAlign: appState.currentItemTextAlign,
    gridSize: appState.gridSize,
    gridModeEnabled: appState.gridModeEnabled,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
    name: appState.name,
  }) as Record<string, unknown>
}

function readLocalCanvasDraft(key: string): LocalCanvasDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const rawValue = window.localStorage.getItem(key)
    if (!rawValue) return null
    const parsed = JSON.parse(rawValue) as Partial<LocalCanvasDraft>
    if (!parsed.scene || typeof parsed.scene !== 'object') return null
    return {
      scene: normalizeCanvasScene(parsed.scene as CanvasScene),
      baseVersion: typeof parsed.baseVersion === 'number' ? parsed.baseVersion : 0,
      dirty: Boolean(parsed.dirty),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

function writeLocalCanvasDraft(key: string, draft: LocalCanvasDraft) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // localStorage is a best-effort safety buffer; backend sync remains the source of truth.
  }
}

function serializeScene(scene: CanvasScene) {
  try {
    return JSON.stringify(scene)
  } catch {
    return ''
  }
}

function jsonClone(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    return value
  }
}

function timestampMs(value?: string | null) {
  if (!value) return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function sceneContainsDataUrl(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().toLowerCase().startsWith('data:')
  if (Array.isArray(value)) return value.some(sceneContainsDataUrl)
  if (value && typeof value === 'object') return Object.values(value).some(sceneContainsDataUrl)
  return false
}

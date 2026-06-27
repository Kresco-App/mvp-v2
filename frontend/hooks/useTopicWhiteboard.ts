'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types'
import { apiDataErrorMessage, apiErrorStatus } from '@/lib/apiData'
import { getJson, putJson } from '@/lib/apiClient'
import { showToastError, showToastSuccess } from '@/lib/lazyToast'
import { readTopicInteractionCache, writeTopicInteractionCache } from '@/lib/topicInteractionCache'

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

type LoadedCanvasState = {
  scene: CanvasScene
  sceneVersion: number
  lastSyncedAt: string | null
  isDirty: boolean
  syncStatus: CanvasSyncStatus
  serializedScene: string
}

const AUTOSAVE_DELAY_MS = 1600
const LOCAL_DRAFT_WRITE_DELAY_MS = 400
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
const EMPTY_CANVAS_SCENE_SERIALIZED = serializeScene(EMPTY_CANVAS_SCENE)

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
  const lastSerializedSceneRef = useRef(EMPTY_CANVAS_SCENE_SERIALIZED)
  const currentSerializedSceneRef = useRef(EMPTY_CANVAS_SCENE_SERIALIZED)
  const pendingLocalDraftRef = useRef<LocalCanvasDraft | null>(null)
  const localDraftWriteTimeoutRef = useRef<number | null>(null)

  const applyLoadedCanvasState = useCallback((loadedState: LoadedCanvasState) => {
    lastSerializedSceneRef.current = loadedState.serializedScene
    currentSerializedSceneRef.current = loadedState.serializedScene
    sceneRef.current = loadedState.scene
    sceneVersionRef.current = loadedState.sceneVersion
    isDirtyRef.current = loadedState.isDirty
    loadedRef.current = true
    setScene(loadedState.scene)
    setSceneVersion(loadedState.sceneVersion)
    setLastSyncedAt(loadedState.lastSyncedAt)
    setIsDirty(loadedState.isDirty)
    setSyncStatus(loadedState.syncStatus)
    setSceneLoadKey((value) => value + 1)
  }, [])

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    sceneVersionRef.current = sceneVersion
  }, [sceneVersion])

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  const flushPendingLocalDraft = useCallback(() => {
    if (localDraftWriteTimeoutRef.current !== null) {
      window.clearTimeout(localDraftWriteTimeoutRef.current)
      localDraftWriteTimeoutRef.current = null
    }

    const pendingDraft = pendingLocalDraftRef.current
    if (!pendingDraft) return

    pendingLocalDraftRef.current = null
    writeLocalCanvasDraft(draftKey, pendingDraft)
  }, [draftKey])

  const writeLocalDraftNow = useCallback((draft: LocalCanvasDraft) => {
    if (localDraftWriteTimeoutRef.current !== null) {
      window.clearTimeout(localDraftWriteTimeoutRef.current)
      localDraftWriteTimeoutRef.current = null
    }

    pendingLocalDraftRef.current = null
    writeLocalCanvasDraft(draftKey, draft)
  }, [draftKey])

  const scheduleLocalDraftWrite = useCallback((draft: LocalCanvasDraft) => {
    pendingLocalDraftRef.current = draft
    if (localDraftWriteTimeoutRef.current !== null) return

    localDraftWriteTimeoutRef.current = window.setTimeout(() => {
      localDraftWriteTimeoutRef.current = null
      const pendingDraft = pendingLocalDraftRef.current
      if (!pendingDraft) return

      pendingLocalDraftRef.current = null
      writeLocalCanvasDraft(draftKey, pendingDraft)
    }, LOCAL_DRAFT_WRITE_DELAY_MS)
  }, [draftKey])

  useEffect(() => {
    return () => {
      flushPendingLocalDraft()
    }
  }, [flushPendingLocalDraft])

  useEffect(() => {
    window.addEventListener('pagehide', flushPendingLocalDraft)
    return () => window.removeEventListener('pagehide', flushPendingLocalDraft)
  }, [flushPendingLocalDraft])

  useEffect(() => {
    const controller = new AbortController()
    const cacheKey = canvasDocumentCacheKey(targetType, targetId)
    const cachedDocument = readTopicInteractionCache<CanvasDocument>(cacheKey)
    const localDraftAtLoad = readLocalCanvasDraft(draftKey)
    let hydratedSerializedScene: string | null = null

    loadedRef.current = false
    setErrorMessage('')

    if (cachedDocument.hit || localDraftAtLoad) {
      const loadedState = resolveLoadedCanvasState(
        cachedDocument.hit ? cachedDocument.data : null,
        localDraftAtLoad,
      )
      hydratedSerializedScene = loadedState.serializedScene
      applyLoadedCanvasState(loadedState)
    } else {
      setSyncStatus('loading')
    }

    getJson<CanvasDocument>('/interactions/canvas', {
      params: {
        target_type: targetType,
        target_id: targetId,
      },
      signal: controller.signal,
    })
      .then((document) => {
        if (controller.signal.aborted) return
        writeTopicInteractionCache(cacheKey, document)

        const userEditedHydratedScene = Boolean(
          hydratedSerializedScene
          && isDirtyRef.current
          && currentSerializedSceneRef.current !== hydratedSerializedScene
        )
        if (userEditedHydratedScene) return

        applyLoadedCanvasState(resolveLoadedCanvasState(document, readLocalCanvasDraft(draftKey)))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        const localDraft = readLocalCanvasDraft(draftKey)
        if (localDraft) {
          applyLoadedCanvasState(resolveLoadedCanvasState(null, localDraft))
          setErrorMessage(apiDataErrorMessage(error, 'Loaded your local whiteboard draft.'))
          return
        }
        if (loadedRef.current) {
          setSyncStatus('offline')
          setErrorMessage(apiDataErrorMessage(error, 'Showing cached whiteboard.'))
          return
        }
        loadedRef.current = true
        setSyncStatus('error')
        setErrorMessage(apiDataErrorMessage(error, 'Could not load whiteboard.'))
      })

    return () => {
      controller.abort()
    }
  }, [applyLoadedCanvasState, draftKey, targetId, targetType])

  const saveCanvas = useCallback(async (options: { notify?: boolean } = {}) => {
    if (!loadedRef.current || savingRef.current || !isDirtyRef.current) return
    const currentScene = sceneRef.current
    if (sceneContainsDataUrl(currentScene)) {
      setSyncStatus('error')
      setErrorMessage('Images need media storage before they can be saved on this whiteboard.')
      if (options.notify) showToastError('Images need media storage before saving.')
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
      writeLocalDraftNow({
        scene: nextScene,
        baseVersion: document.scene_version,
        dirty: false,
        updatedAt: Date.now(),
      })
      if (options.notify) showToastSuccess('Whiteboard saved.')
    } catch (error) {
      const status = apiErrorStatus(error)
      const nextStatus: CanvasSyncStatus = status === 409 ? 'conflict' : 'error'
      setSyncStatus(nextStatus)
      setErrorMessage(apiDataErrorMessage(error, status === 409 ? 'This whiteboard changed elsewhere.' : 'Could not sync whiteboard.'))
      if (options.notify) showToastError(apiDataErrorMessage(error, 'Could not sync whiteboard.'))
    } finally {
      savingRef.current = false
    }
  }, [targetId, targetType, writeLocalDraftNow])

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
    scheduleLocalDraftWrite({
      scene: nextScene,
      baseVersion: sceneVersionRef.current,
      dirty: true,
      updatedAt: Date.now(),
    })
  }, [scheduleLocalDraftWrite])

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

function resolveLoadedCanvasState(document: CanvasDocument | null, localDraft: LocalCanvasDraft | null): LoadedCanvasState {
  const serverUpdatedAt = document ? timestampMs(document.updated_at) : 0
  const shouldUseLocalDraft = Boolean(
    localDraft
    && (!document || (localDraft.dirty && localDraft.updatedAt >= serverUpdatedAt))
  )
  const nextScene = normalizeCanvasScene(
    shouldUseLocalDraft && localDraft ? localDraft.scene : document?.scene_json,
  )
  const sceneVersion = shouldUseLocalDraft && localDraft
    ? localDraft.baseVersion
    : document?.scene_version ?? 0
  const isDirty = Boolean(shouldUseLocalDraft && localDraft?.dirty)
  const syncStatus: CanvasSyncStatus = isDirty ? 'offline' : 'saved'

  return {
    scene: nextScene,
    sceneVersion,
    lastSyncedAt: document?.updated_at ?? null,
    isDirty,
    syncStatus,
    serializedScene: serializeScene(nextScene),
  }
}

function canvasDocumentCacheKey(targetType: CanvasTargetType, targetId: number) {
  return `topic-whiteboard:${targetType}:${targetId}`
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

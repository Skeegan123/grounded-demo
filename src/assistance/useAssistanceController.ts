import { useCallback, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { createWorkspaceStore } from '../workspace/workspaceStore'
import type {
  AssistanceCompletedResult,
  AssistanceRequestView,
  createAssistance,
} from './assistance'
import { asPointSetRequest, asTextRequest } from './assistancePresentation'

export function useAssistanceController({
  assistance,
  workspaceStore,
}: {
  assistance: ReturnType<typeof createAssistance>
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}) {
  const [pending, setPending] = useState<AssistanceRequestView[]>([])
  const [completed, setCompleted] = useState<AssistanceCompletedResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [responsePending, setResponsePending] = useState(false)
  const [responseError, setResponseError] = useState('')
  const [responseMessage, setResponseMessage] = useState('')
  const clearDraft = useStore(workspaceStore, (state) => state.clearDraft)
  const declineReason = useStore(workspaceStore, (state) => state.declineReason)
  const note = useStore(workspaceStore, (state) => state.note)
  const points = useStore(workspaceStore, (state) => state.points)
  const text = useStore(workspaceStore, (state) => state.text)
  const current = pending[0]

  const refresh = useCallback(async () => {
    const [nextPending, nextCompleted] = await Promise.all([
      assistance.listPending(),
      assistance.listCompleted(),
    ])
    setPending(nextPending)
    setCompleted(nextCompleted)
  }, [assistance])

  useEffect(() => {
    let active = true
    let loadRevision = 0
    const load = async () => {
      const revision = ++loadRevision
      try {
        const [nextPending, nextCompleted] = await Promise.all([
          assistance.listPending(),
          assistance.listCompleted(),
        ])
        if (active && revision === loadRevision) {
          setPending(nextPending)
          setCompleted(nextCompleted)
          setLoadError('')
        }
      } catch (error: unknown) {
        if (active && revision === loadRevision) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'The Demo Session could not be loaded.',
          )
        }
      } finally {
        if (active && revision === loadRevision) setLoading(false)
      }
    }
    void load()
    const unsubscribe = assistance.subscribe(() => void load())
    return () => {
      active = false
      unsubscribe()
    }
  }, [assistance])

  useEffect(() => () => assistance.close(), [assistance])

  const saveProfessionalResponse = async (save: () => Promise<void>) => {
    if (responsePending) return
    setResponsePending(true)
    setResponseError('')
    setResponseMessage('')
    try {
      await save()
      clearDraft()
      setResponseMessage(
        'Professional Response saved. The External Agent can retrieve it now.',
      )
      try {
        await refresh()
      } catch (error: unknown) {
        setLoadError(
          `${error instanceof Error ? error.message : 'The Demo Session could not be refreshed.'} The Professional Response is saved. Reload the page to continue.`,
        )
      }
    } catch (error: unknown) {
      setResponseError(
        `${error instanceof Error ? error.message : 'The Professional Response could not be saved.'} Check the response and try again.`,
      )
    } finally {
      setResponsePending(false)
    }
  }

  const submitPointSet = async () => {
    const request = asPointSetRequest(current)
    if (!request) return
    await saveProfessionalResponse(async () => {
      await assistance.submitPointSetResponse({
        requestId: request.id,
        points,
        ...(note.trim() ? { note } : {}),
      })
    })
  }

  const submitText = async () => {
    const request = asTextRequest(current)
    if (!request) return
    if (!text.trim()) {
      setResponseError('Enter a text Professional Response before submitting.')
      setResponseMessage('')
      return
    }
    await saveProfessionalResponse(async () => {
      await assistance.submitTextResponse({
        requestId: request.id,
        text,
        ...(note.trim() ? { note } : {}),
      })
    })
  }

  const declineCurrent = async () => {
    if (!current) return
    await saveProfessionalResponse(async () => {
      await assistance.decline({
        requestId: current.id,
        ...(declineReason.trim() ? { reason: declineReason } : {}),
      })
    })
  }

  return {
    clearResponseError: () => setResponseError(''),
    completed,
    current,
    declineCurrent,
    loadError,
    loading,
    pending,
    responseError,
    responseMessage,
    responsePending,
    submitPointSet,
    submitText,
  }
}

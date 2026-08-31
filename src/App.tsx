import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import type {
  AssistanceRequestView,
  createAssistance,
} from './assistance/assistance'
import { demoProject, findPage } from './demoProject/demoProject'
import { registerAssistanceTools } from './webmcp/registerAssistanceTools'
import type { ModelContextAdapter } from './webmcp/modelContext'
import type { createWorkspaceStore } from './workspace/workspaceStore'
import './App.css'

interface AppProps {
  assistance: ReturnType<typeof createAssistance>
  modelContext?: ModelContextAdapter
  sessionId: string
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}

type RegistrationState = 'ready' | 'unsupported' | 'error' | 'registering'

function App({ assistance, modelContext, sessionId, workspaceStore }: AppProps) {
  const [pending, setPending] = useState<AssistanceRequestView[]>([])
  const [registration, setRegistration] = useState<RegistrationState>(() =>
    modelContext ? 'registering' : 'unsupported',
  )
  const [registrationError, setRegistrationError] = useState('')
  const points = useStore(workspaceStore, (state) => state.points)
  const note = useStore(workspaceStore, (state) => state.note)
  const addPoint = useStore(workspaceStore, (state) => state.addPoint)
  const clearDraft = useStore(workspaceStore, (state) => state.clearDraft)
  const setNote = useStore(workspaceStore, (state) => state.setNote)
  const undoPoint = useStore(workspaceStore, (state) => state.undoPoint)

  const refresh = useCallback(async () => {
    setPending(await assistance.listPending())
  }, [assistance])

  useEffect(() => {
    let active = true
    const load = async () => {
      const requests = await assistance.listPending()
      if (active) setPending(requests)
    }
    void load()
    const unsubscribe = assistance.subscribe(() => void load())
    return () => {
      active = false
      unsubscribe()
    }
  }, [assistance])

  useEffect(() => {
    if (!modelContext) return
    const controller = new AbortController()
    registerAssistanceTools(modelContext, assistance, controller.signal)
      .then(() => setRegistration('ready'))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRegistration('error')
        setRegistrationError(
          error instanceof Error ? error.message : 'Tool registration failed.',
        )
      })
    return () => controller.abort()
  }, [assistance, modelContext])

  useEffect(() => () => assistance.close(), [assistance])

  const current = pending[0]
  const targetDocument = current
    ? demoProject.documents.find(
        (document) => document.id === current.documentId,
      ) ?? demoProject.documents[0]
    : demoProject.documents[0]
  const targetPageId = current?.recommendedPageIds[0] ?? targetDocument.pages[0].id
  const targetPage =
    findPage(targetDocument.id, targetPageId) ?? targetDocument.pages[0]

  const placePoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    addPoint({
      pageId: targetPage.id,
      pageLabel: targetPage.label,
      pageNumber: targetPage.number,
      x,
      y,
    })
  }

  const submitPointSet = async () => {
    if (!current) return
    await assistance.answerPointSet({
      requestId: current.id,
      points,
      ...(note.trim() ? { note } : {}),
    })
    clearDraft()
    await refresh()
  }

  const statusCopy = {
    ready: 'WebMCP ready',
    unsupported: 'WebMCP unavailable',
    error: 'Registration failed',
    registering: 'Registering tools',
  }[registration]

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <a className="wordmark" href="/" aria-label="Grounded home">
            <span className="wordmark-mark" aria-hidden="true" />
            Grounded
          </a>
          <p>{demoProject.title}</p>
        </div>
        <div className="session-status">
          <span className={`status-dot status-${registration}`} aria-hidden="true" />
          <span>{statusCopy}</span>
          <code>{sessionId.slice(0, 8)}</code>
        </div>
      </header>

      {registration === 'error' && (
        <p className="error-banner" role="alert">{registrationError}</p>
      )}

      <div className="workspace-grid">
        <aside className="documents-pane" aria-labelledby="documents-title">
          <p className="pane-kicker">Demo Project</p>
          <h2 id="documents-title">Project Documents</h2>
          <nav aria-label="Project documents">
            {demoProject.documents.map((document) => (
              <button
                className={document.id === targetDocument.id ? 'document active' : 'document'}
                key={document.id}
                type="button"
              >
                <span>{document.title}</span>
                <small>{document.description}</small>
              </button>
            ))}
          </nav>
        </aside>

        <section className="document-pane" aria-labelledby="work-area-title">
          <div className="pane-heading">
            <div>
              <p className="pane-kicker">Document work area</p>
              <h1 id="work-area-title">{targetDocument.title}</h1>
            </div>
            <span className="sheet-chip">Sheet {targetPage.label}</span>
          </div>
          <div className="drawing-stage">
            <div
              aria-label={`Drawing page ${targetPage.label}`}
              className={current ? 'drawing-page marking' : 'drawing-page'}
              onClick={placePoint}
              role="button"
              tabIndex={current ? 0 : -1}
            >
              <div className="drawing-title-block"><strong>FIRST FLOOR PLAN</strong><span>A1.2</span></div>
              <div className="room room-one">WC<br /><small>Type C</small></div>
              <div className="room room-two">UTILITY<br /><small>Type C</small></div>
              <div className="room room-three">COATS<br /><small>Type C</small></div>
              {points.map((point, index) => (
                <span
                  className="point-mark"
                  key={`${point.x}-${point.y}-${index}`}
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                >
                  {index + 1}
                </span>
              ))}
            </div>
          </div>
        </section>

        <aside className="assistance-pane" aria-labelledby="assistance-title">
          <p className="pane-kicker">FIFO work rail</p>
          <h2 id="assistance-title">Current Assistance</h2>
          {current ? (
            <div className="request-card">
              <div className="request-meta"><span>Pending</span><code>{current.id}</code></div>
              <p className="question">{current.question}</p>
              <dl>
                <div><dt>Response</dt><dd>Point Set</dd></div>
                <div><dt>Page</dt><dd>{targetPage.label}</dd></div>
              </dl>
              <div className="point-controls">
                <div>
                  <strong>{points.length} {points.length === 1 ? 'point' : 'points'}</strong>
                  <span>Click the drawing to mark locations.</span>
                </div>
                <button disabled={points.length === 0} onClick={undoPoint} type="button">Undo</button>
              </div>
              <label htmlFor="point-set-note">Overall note <span>optional</span></label>
              <textarea
                id="point-set-note"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add context for the External Agent"
                value={note}
              />
              <button className="submit-button" onClick={() => void submitPointSet()} type="button">
                Submit Point Set
              </button>
              {pending.length > 1 && <p className="waiting">{pending.length - 1} waiting</p>}
            </div>
          ) : (
            <div className="empty-request">
              <span aria-hidden="true">✓</span>
              <p>No pending Assistance Requests</p>
              <small>An External Agent can queue the next judgment through WebMCP.</small>
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}

export default App

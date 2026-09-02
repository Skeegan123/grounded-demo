import type { RefObject } from 'react'
import type {
  DocumentPage,
  ProjectDocument,
} from '../demoProject/demoProject'
import type {
  AssistanceCompletedResult,
  AssistanceRequestView,
} from './assistance'

type AssistanceTab = 'current' | 'queue' | 'done'
type PointSetRequest = Extract<
  AssistanceRequestView,
  { responseType: 'point_set' }
>

interface SupportingDocumentView {
  document: ProjectDocument
  pages: DocumentPage[]
}

interface AssistancePanelProps {
  assistancePaneRef: RefObject<HTMLElement | null>
  assistanceTab: AssistanceTab
  canMark: boolean
  completed: AssistanceCompletedResult[]
  current?: AssistanceRequestView
  declineReason: string
  loadError: string
  loading: boolean
  note: string
  onDecline: () => void
  onOpenTargetPage: (pageId: string) => void
  onOpenSupportingReference: (
    documentId: string,
    documentVersionId: string,
    pageId: string,
  ) => void
  onSelectTab: (tab: AssistanceTab) => void
  onSetDeclineReason: (reason: string) => void
  onSetNote: (note: string) => void
  onSetText: (text: string) => void
  onSubmitPointSet: () => void
  onSubmitText: () => void
  onUndoPoint: () => void
  onTogglePointSet: (result: AssistanceCompletedResult) => void
  pending: AssistanceRequestView[]
  pointCount: number
  recommendedPages: DocumentPage[]
  responseError: string
  responseMessage: string
  responsePending: boolean
  supportingDocuments?: SupportingDocumentView[]
  targetDocument: ProjectDocument
  targetPage: DocumentPage
  text: string
  viewedPointSetId: string
}

export function AssistancePanel({
  assistancePaneRef,
  assistanceTab,
  canMark,
  completed,
  current,
  declineReason,
  loadError,
  loading,
  note,
  onDecline,
  onOpenTargetPage,
  onOpenSupportingReference,
  onSelectTab,
  onSetDeclineReason,
  onSetNote,
  onSetText,
  onSubmitPointSet,
  onSubmitText,
  onUndoPoint,
  onTogglePointSet,
  pending,
  pointCount,
  recommendedPages,
  responseError,
  responseMessage,
  responsePending,
  supportingDocuments,
  targetDocument,
  targetPage,
  text,
  viewedPointSetId,
}: AssistancePanelProps) {
  return (
    <aside
      className="assistance-pane"
      aria-labelledby="assistance-title"
      ref={assistancePaneRef}
      tabIndex={-1}
    >
      <div className="assistance-heading">
        <h2 id="assistance-title">Current Assistance</h2>
      </div>
      <div className="assistance-tabs" role="tablist" aria-label="Assistance Requests">
        {(
          [
            ['current', 'Current', current ? 1 : 0],
            ['queue', 'Queue', Math.max(0, pending.length - 1)],
            ['done', 'Done', completed.length],
          ] as const
        ).map(([tab, label, count]) => (
          <button
            aria-selected={assistanceTab === tab}
            key={tab}
            onClick={() => onSelectTab(tab)}
            role="tab"
            type="button"
          >
            {label} <span>{count}</span>
          </button>
        ))}
      </div>

      {responseError && (
        <p className="response-feedback error" role="alert">{responseError}</p>
      )}
      {responseMessage && (
        <p className="response-feedback success" role="status">
          {responseMessage}
        </p>
      )}

      {loading && (
        <div
          aria-label="Loading Demo Session"
          className="empty-request"
          role="status"
        >
          <p>Loading Demo Session</p>
          <small>Reading this tab's queued and completed work.</small>
        </div>
      )}
      {!loading && loadError && (
        <div className="rail-error" role="alert">
          <p>The Demo Session could not be loaded.</p>
          <small>{loadError}</small>
        </div>
      )}

      {!loading && !loadError && assistanceTab === 'current' && (current ? (
        <CurrentRequestCard
          canMark={canMark}
          current={current}
          declineReason={declineReason}
          note={note}
          onDecline={onDecline}
          onOpenTargetPage={onOpenTargetPage}
          onOpenSupportingReference={onOpenSupportingReference}
          onSetDeclineReason={onSetDeclineReason}
          onSetNote={onSetNote}
          onSetText={onSetText}
          onSubmitPointSet={onSubmitPointSet}
          onSubmitText={onSubmitText}
          onUndoPoint={onUndoPoint}
          pending={pending}
          pointCount={pointCount}
          recommendedPages={recommendedPages}
          responsePending={responsePending}
          supportingDocuments={supportingDocuments}
          targetDocument={targetDocument}
          targetPage={targetPage}
          text={text}
        />
      ) : (
        <div className="empty-request">
          <span aria-hidden="true">✓</span>
          <p>No pending Assistance Requests</p>
          <small>An External Agent can queue the next judgment through WebMCP.</small>
        </div>
      ))}

      {!loading && !loadError && assistanceTab === 'queue' && (
        <div className="request-list">
          {pending.slice(1).length > 0 ? pending.slice(1).map((request, index) => (
            <article className="history-card" key={request.id}>
              <div className="request-meta">
                <span>Locked · {index + 2} in line</span>
              </div>
              <p className="question">{request.question}</p>
              <small>{responseTypeName(request)} response</small>
            </article>
          )) : (
            <div className="empty-request">
              <p>No later requests in Queue</p>
              <small>Current must be completed before later work can be answered.</small>
            </div>
          )}
        </div>
      )}

      {!loading && !loadError && assistanceTab === 'done' && (
        <div className="request-list">
          {completed.length > 0 ? completed.map((result) => (
            <article className="history-card" key={result.id}>
              <div className="request-meta">
                <span>{result.state === 'answered' ? 'Answered' : 'Declined'}</span>
              </div>
              <p className="question">{result.question}</p>
              <CompletedResponse
                isViewingPointSet={viewedPointSetId === result.id}
                onTogglePointSet={() => onTogglePointSet(result)}
                result={result}
              />
            </article>
          )) : (
            <div className="empty-request">
              <p>No completed Assistance Requests</p>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

interface CurrentRequestCardProps {
  canMark: boolean
  current: AssistanceRequestView
  declineReason: string
  note: string
  onDecline: () => void
  onOpenTargetPage: AssistancePanelProps['onOpenTargetPage']
  onOpenSupportingReference: AssistancePanelProps['onOpenSupportingReference']
  onSetDeclineReason: (reason: string) => void
  onSetNote: (note: string) => void
  onSetText: (text: string) => void
  onSubmitPointSet: () => void
  onSubmitText: () => void
  onUndoPoint: () => void
  pending: AssistanceRequestView[]
  pointCount: number
  recommendedPages: DocumentPage[]
  responsePending: boolean
  supportingDocuments?: SupportingDocumentView[]
  targetDocument: ProjectDocument
  targetPage: DocumentPage
  text: string
}

function CurrentRequestCard(props: CurrentRequestCardProps) {
  const { current } = props
  return (
    <div className="request-card">
      <div className="request-meta">
        <span>Pending</span>
      </div>
      <p className="question">{current.question}</p>
      {current.responseType === 'point_set'
        ? <PointSetResponseForm {...props} current={current} />
        : <TextResponseForm {...props} />}

      <label htmlFor="response-note">
        Overall note <span>optional</span>
      </label>
      <textarea
        id="response-note"
        onChange={(event) => props.onSetNote(event.target.value)}
        placeholder="Add context for the External Agent"
        value={props.note}
      />
      <SubmitResponseButton {...props} />

      <div className="decline-controls">
        <label htmlFor="decline-reason">
          Decline reason <span>optional</span>
        </label>
        <textarea
          id="decline-reason"
          onChange={(event) => props.onSetDeclineReason(event.target.value)}
          placeholder="Explain why you cannot make this judgment"
          value={props.declineReason}
        />
        <button
          disabled={props.responsePending}
          onClick={props.onDecline}
          type="button"
        >
          Decline Request
        </button>
      </div>

      {props.pending.length > 1 && (
        <div className="waiting">
          <strong>{props.pending.length - 1} waiting</strong>
          <span>Next: {props.pending[1]!.question}</span>
        </div>
      )}
    </div>
  )
}

function PointSetResponseForm(
  props: CurrentRequestCardProps & { current: PointSetRequest },
) {
  const targetPages = props.recommendedPages.length > 0
    ? props.recommendedPages
    : [props.targetPage]

  return (
    <>
      <dl>
        <div>
          <dt>Response</dt>
          <dd>Point Set</dd>
        </div>
        <div>
          <dt>Document</dt>
          <dd>
            {props.targetDocument.title}
            <small>{props.targetDocument.versionId}</small>
          </dd>
        </div>
      </dl>
      <section className="workspace-destinations" aria-labelledby="workspace-destinations-title">
        <h3 id="workspace-destinations-title">Open in workspace</h3>
        <div className="destination-group">
          <p>
            {props.recommendedPages.length > 0 ? 'Recommended' : 'Target'}{' '}
            {targetPages.length === 1 ? 'page' : 'pages'}
          </p>
          <div className="destination-links">
            {targetPages.map((page) => (
              <button
                aria-label={`Open ${page.label}: ${page.title}`}
                key={page.id}
                onClick={() => props.onOpenTargetPage(page.id)}
                type="button"
              >
                <strong>{page.label}</strong>
                <span>{page.title}</span>
              </button>
            ))}
          </div>
        </div>
        {props.supportingDocuments && props.supportingDocuments.length > 0 && (
          <div className="destination-group">
            <p>Supporting documents</p>
            <ul className="supporting-documents">
              {props.supportingDocuments.map(({ document, pages }) => (
                <li key={`${document.id}:${document.versionId}`}>
                  <span>{document.title}</span>
                  <div className="destination-links supporting-page-links">
                    {pages.map((page) => (
                      <button
                        aria-label={`Open supporting page ${page.label}: ${page.title}`}
                        key={page.id}
                        onClick={() => props.onOpenSupportingReference(
                          document.id,
                          document.versionId,
                          page.id,
                        )}
                        type="button"
                      >
                        <strong>Page {page.label}</strong>
                        <span>{page.title}</span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <div className="point-controls">
        <div>
          <strong>
            {props.pointCount} {props.pointCount === 1 ? 'point' : 'points'}
          </strong>
          <span>
            {props.canMark
              ? 'Click the drawing to mark locations.'
              : `Open ${targetPages.map((page) => page.label).join(' or ')} to place points.`}
          </span>
        </div>
        <button
          disabled={props.pointCount === 0}
          onClick={props.onUndoPoint}
          type="button"
        >
          Undo
        </button>
      </div>
    </>
  )
}

function TextResponseForm(props: CurrentRequestCardProps) {
  return (
    <>
      <dl>
        <div>
          <dt>Response</dt>
          <dd>Text</dd>
        </div>
      </dl>
      <label htmlFor="text-response">Text response</label>
      <textarea
        id="text-response"
        onChange={(event) => props.onSetText(event.target.value)}
        placeholder="Enter the Professional Response"
        value={props.text}
      />
    </>
  )
}

function SubmitResponseButton(props: CurrentRequestCardProps) {
  const isPointSet = props.current.responseType === 'point_set'
  return (
    <button
      className="submit-button"
      disabled={props.responsePending}
      onClick={isPointSet ? props.onSubmitPointSet : props.onSubmitText}
      type="button"
    >
      {isPointSet ? 'Submit Point Set' : 'Submit Text Response'}
    </button>
  )
}

function CompletedResponse({
  isViewingPointSet,
  onTogglePointSet,
  result,
}: {
  isViewingPointSet: boolean
  onTogglePointSet: () => void
  result: AssistanceCompletedResult
}) {
  const response = result.professionalResponse
  if (response.type === 'point_set') {
    return (
      <>
        <p>{response.count} {response.count === 1 ? 'point' : 'points'}</p>
        <small>{response.document.id} · {response.document.versionId}</small>
        <button
          aria-pressed={isViewingPointSet}
          className="point-set-toggle"
          onClick={onTogglePointSet}
          type="button"
        >
          {isViewingPointSet ? 'Hide Point Set' : 'Show Point Set'}
        </button>
        {response.points.length > 0 && (
          <ol className="point-summary">
            {response.points.map((point) => (
              <li key={point.pointNumber} value={point.pointNumber}>
                {point.page.label} · {Math.round(point.x * 100)}%, {Math.round(point.y * 100)}%
              </li>
            ))}
          </ol>
        )}
        {response.note && <small>{response.note}</small>}
      </>
    )
  }
  if (response.type === 'text') {
    return (
      <>
        <p>{response.text}</p>
        {response.note && <small>{response.note}</small>}
      </>
    )
  }
  return <p>{response.reason ?? 'No reason given.'}</p>
}

function responseTypeName(request: AssistanceRequestView) {
  return request.responseType === 'point_set' ? 'Point Set' : 'Text'
}

export function AssistanceRequestStrip({
  current,
  onOpenAssistance,
  onTargetNavigation,
  onUndoPoint,
  pointCount,
  targetNavigationLabel,
}: {
  current: AssistanceRequestView
  onOpenAssistance: () => void
  onTargetNavigation: () => void
  onUndoPoint: () => void
  pointCount: number
  targetNavigationLabel?: string
}) {
  const isPointSet = current.responseType === 'point_set'
  return (
    <div className="request-strip" aria-label="Active Assistance Request">
      <div className="request-strip-status">
        <span>Pending</span>
        <strong>
          {isPointSet ? `Point Set, ${pointCount} marked` : 'Text response'}
        </strong>
      </div>
      <div className="request-strip-actions">
        {isPointSet && (
          <>
            <button
              disabled={pointCount === 0}
              onClick={onUndoPoint}
              type="button"
            >
              Undo
            </button>
            {targetNavigationLabel && (
              <button onClick={onTargetNavigation} type="button">
                {targetNavigationLabel}
              </button>
            )}
          </>
        )}
        <button onClick={onOpenAssistance} type="button">View request</button>
      </div>
    </div>
  )
}

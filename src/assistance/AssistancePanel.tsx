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
  onCollapse: () => void
  onDecline: () => void
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
  onTargetNavigation: () => void
  onUndoPoint: () => void
  onViewPointSet: (result: AssistanceCompletedResult) => void
  pending: AssistanceRequestView[]
  pointCount: number
  recommendedPageLabels: string
  responseError: string
  responseMessage: string
  responsePending: boolean
  supportingDocuments?: SupportingDocumentView[]
  targetDocument: ProjectDocument
  targetNavigationLabel: string
  targetPage: DocumentPage
  text: string
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
  onCollapse,
  onDecline,
  onOpenSupportingReference,
  onSelectTab,
  onSetDeclineReason,
  onSetNote,
  onSetText,
  onSubmitPointSet,
  onSubmitText,
  onTargetNavigation,
  onUndoPoint,
  onViewPointSet,
  pending,
  pointCount,
  recommendedPageLabels,
  responseError,
  responseMessage,
  responsePending,
  supportingDocuments,
  targetDocument,
  targetNavigationLabel,
  targetPage,
  text,
}: AssistancePanelProps) {
  return (
    <aside
      className="assistance-pane"
      aria-labelledby="assistance-title"
      ref={assistancePaneRef}
      tabIndex={-1}
    >
      <div className="assistance-heading">
        <div>
          <p className="pane-kicker">FIFO work rail</p>
          <h2 id="assistance-title">Current Assistance</h2>
        </div>
        <button
          aria-label="Collapse Assistance"
          className="collapse-assistance-button"
          onClick={onCollapse}
          type="button"
        >
          Collapse
        </button>
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
          onOpenSupportingReference={onOpenSupportingReference}
          onSetDeclineReason={onSetDeclineReason}
          onSetNote={onSetNote}
          onSetText={onSetText}
          onSubmitPointSet={onSubmitPointSet}
          onSubmitText={onSubmitText}
          onTargetNavigation={onTargetNavigation}
          onUndoPoint={onUndoPoint}
          pending={pending}
          pointCount={pointCount}
          recommendedPageLabels={recommendedPageLabels}
          responsePending={responsePending}
          supportingDocuments={supportingDocuments}
          targetDocument={targetDocument}
          targetNavigationLabel={targetNavigationLabel}
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
                <code>{request.id}</code>
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
                <code>{result.id}</code>
              </div>
              <p className="question">{result.question}</p>
              <CompletedResponse
                onViewPointSet={() => onViewPointSet(result)}
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
  onOpenSupportingReference: AssistancePanelProps['onOpenSupportingReference']
  onSetDeclineReason: (reason: string) => void
  onSetNote: (note: string) => void
  onSetText: (text: string) => void
  onSubmitPointSet: () => void
  onSubmitText: () => void
  onTargetNavigation: () => void
  onUndoPoint: () => void
  pending: AssistanceRequestView[]
  pointCount: number
  recommendedPageLabels: string
  responsePending: boolean
  supportingDocuments?: SupportingDocumentView[]
  targetDocument: ProjectDocument
  targetNavigationLabel: string
  targetPage: DocumentPage
  text: string
}

function CurrentRequestCard(props: CurrentRequestCardProps) {
  const { current } = props
  return (
    <div className="request-card">
      <div className="request-meta">
        <span>Pending</span>
        <code>{current.id}</code>
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
        <div>
          <dt>Recommended pages</dt>
          <dd>{props.recommendedPageLabels || 'None'}</dd>
        </div>
        {props.supportingDocuments && props.supportingDocuments.length > 0 && (
          <div>
            <dt>Supporting documents</dt>
            <dd>
              <ul className="supporting-documents">
                {props.supportingDocuments.map(({ document, pages }) => (
                  <li key={`${document.id}:${document.versionId}`}>
                    <span>{document.title}</span>
                    <small>
                      {document.versionId} · Pages{' '}
                      {pages.map((page) => page.label).join(', ')}
                    </small>
                    <span className="supporting-page-links">
                      {pages.map((page) => (
                        <button
                          key={page.id}
                          onClick={() => props.onOpenSupportingReference(
                            document.id,
                            document.versionId,
                            page.id,
                          )}
                          type="button"
                        >
                          Open page {page.label}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      <div className="point-controls">
        <div>
          <strong>
            {props.pointCount} {props.pointCount === 1 ? 'point' : 'points'}
          </strong>
          <span>
            {props.canMark
              ? 'Click the drawing to mark locations.'
              : `Open ${props.targetPage.label} to place points.`}
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
      <button
        className="response-page-button"
        onClick={props.onTargetNavigation}
        type="button"
      >
        {props.targetNavigationLabel}
      </button>
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
  onViewPointSet,
  result,
}: {
  onViewPointSet: () => void
  result: AssistanceCompletedResult
}) {
  const response = result.professionalResponse
  if (response.type === 'point_set') {
    return (
      <>
        <p>{response.count} {response.count === 1 ? 'point' : 'points'}</p>
        <small>{response.document.id} · {response.document.versionId}</small>
        <button
          className="response-page-button"
          onClick={onViewPointSet}
          type="button"
        >
          View Point Set on drawing
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
  targetNavigationLabel: string
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
            <button onClick={onTargetNavigation} type="button">
              {targetNavigationLabel}
            </button>
          </>
        )}
        <button onClick={onOpenAssistance} type="button">View request</button>
      </div>
    </div>
  )
}

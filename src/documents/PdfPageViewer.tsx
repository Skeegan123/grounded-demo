import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { MapPin, X } from 'lucide-react'
import type { DocumentPage, ProjectDocument } from '../demoProject/demoProject'
import type { StoredPoint } from '../demoSession/demoSession'
import type {
  ViewerNavigationRequest,
  VisibleDocumentView,
} from './DocumentNavigator'
import {
  centerPageOffset,
  clampDocumentZoom,
  clampPageOffset,
  fitPageInBounds,
  normalizeClientPoint,
  zoomPageAroundPoint,
  type NormalizedPoint,
  type PageFit,
  type PageOffset,
  type PageSize,
  type PageViewportInsets,
} from './pageGeometry'

export const PAN_MOVEMENT_THRESHOLD = 6
const WHEEL_ZOOM_SENSITIVITY = 0.002

export interface RenderPageRequest extends PageSize {
  canvas: HTMLCanvasElement
  pageNumber: number
  signal: AbortSignal
  url: string
}

export interface PrefetchPagesRequest {
  pageNumbers: number[]
  url: string
}

export interface PdfPageRenderer {
  renderPage: (request: RenderPageRequest) => Promise<void>
  prefetchPages: (request: PrefetchPagesRequest) => void
}

interface PdfPageViewerProps {
  canMark: boolean
  document: ProjectDocument
  fit?: PageFit
  navigationRequest?: ViewerNavigationRequest
  onHumanTakeover?: () => void
  onPlacePoint: (point: NormalizedPoint) => void
  onRemovePoint?: (globalIndex: number) => void
  onRenderError?: (requestId: number) => void
  onVisibleViewChange?: (view: VisibleDocumentView) => void
  onZoomChange?: (zoom: number) => void
  page: DocumentPage
  points: StoredPoint[]
  renderer: PdfPageRenderer
  viewportInsets?: PageViewportInsets
  zoom: number
}

interface RenderResult {
  error: string
  identity: string
  status: 'idle' | 'ready' | 'error'
}

interface DisplayedRender {
  identity: string
  pageIdentity: string
  slot: 0 | 1
}

interface ActivePointer extends PageOffset {
  startX: number
  startY: number
}

interface LayoutSnapshot {
  fit: PageFit
  pageIdentity: string
  pageSize: PageSize
  viewport: PageSize
  zoom: number
}

export function PdfPageViewer({
  canMark,
  document,
  fit = 'page',
  navigationRequest,
  onHumanTakeover,
  onPlacePoint,
  onRemovePoint,
  onRenderError,
  onVisibleViewChange,
  onZoomChange,
  page,
  points,
  renderer,
  viewportInsets = {},
  zoom,
}: PdfPageViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])
  const displayedRenderRef = useRef<DisplayedRender | undefined>(undefined)
  const pointersRef = useRef(new Map<number, ActivePointer>())
  const previousPinchRef = useRef<
    { center: PageOffset; distance: number } | undefined
  >(undefined)
  const movementRef = useRef(false)
  const ignoreNextClickRef = useRef(false)
  const pendingZoomAnchorRef = useRef<PageOffset | undefined>(undefined)
  const layoutRef = useRef<LayoutSnapshot | undefined>(undefined)
  const layoutNavigationRequestRef = useRef<number | undefined>(undefined)
  const offsetRef = useRef<PageOffset>({ x: 0, y: 0 })
  const zoomRef = useRef(zoom)
  const [availableSize, setAvailableSize] = useState<PageSize>({
    width: 0,
    height: 0,
  })
  const [offset, setOffsetState] = useState<PageOffset>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [renderResult, setRenderResult] = useState<RenderResult>({
    error: '',
    identity: '',
    status: 'idle',
  })
  const [displayedRender, setDisplayedRender] = useState<DisplayedRender>()
  const [pointControlsDismissed, setPointControlsDismissed] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState<{
    globalIndex: number
    renderIdentity: string
  }>()
  const clampingInsets = useMemo(() => ({
    bottom: viewportInsets.bottom,
    right: viewportInsets.right,
  }), [viewportInsets.bottom, viewportInsets.right])

  const setOffset = (nextOffset: PageOffset) => {
    offsetRef.current = nextOffset
    setOffsetState(nextOffset)
  }

  useLayoutEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const updateSize = (width: number, height: number) => {
      setAvailableSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      )
    }
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect
      if (bounds) updateSize(bounds.width, bounds.height)
    })
    updateSize(host.clientWidth, host.clientHeight)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const renderedSize = useMemo(
    () => fitPageInBounds(page, availableSize, zoom, fit),
    [availableSize, fit, page, zoom],
  )
  const pageIdentity = `${document.id}:${document.versionId}:${page.id}`
  const renderIdentity = `${pageIdentity}:${renderedSize.width}x${renderedSize.height}`
  const matchingNavigationRequest =
    navigationRequest?.documentId === document.id &&
    navigationRequest.documentVersionId === document.versionId &&
    navigationRequest.pageId === page.id &&
    navigationRequest.fit === fit &&
    navigationRequest.zoom === zoom
      ? navigationRequest
      : undefined
  const navigationRequestId = matchingNavigationRequest?.id

  useLayoutEffect(() => {
    if (renderedSize.width <= 0 || renderedSize.height <= 0) return

    const previous = layoutRef.current
    const nextLayout = {
      fit,
      pageIdentity,
      pageSize: renderedSize,
      viewport: availableSize,
      zoom,
    }
    let nextOffset: PageOffset
    if (
      navigationRequestId !== undefined &&
      layoutNavigationRequestRef.current !== navigationRequestId
    ) {
      nextOffset = centerPageOffset(renderedSize, availableSize)
      layoutNavigationRequestRef.current = navigationRequestId
    } else if (
      !previous ||
      previous.pageIdentity !== pageIdentity ||
      previous.fit !== fit
    ) {
      nextOffset = centerPageOffset(renderedSize, availableSize)
    } else if (previous.zoom !== zoom) {
      nextOffset = zoomPageAroundPoint({
        currentPage: previous.pageSize,
        insets: clampingInsets,
        nextPage: renderedSize,
        offset: offsetRef.current,
        pointer: pendingZoomAnchorRef.current ?? {
          x: availableSize.width / 2,
          y: availableSize.height / 2,
        },
        viewport: availableSize,
      })
    } else if (
      previous.viewport.width !== availableSize.width ||
      previous.viewport.height !== availableSize.height
    ) {
      nextOffset = centerPageOffset(renderedSize, availableSize)
    } else {
      nextOffset = clampPageOffset({
        insets: clampingInsets,
        page: renderedSize,
        viewport: availableSize,
        offset: offsetRef.current,
      })
    }

    pendingZoomAnchorRef.current = undefined
    layoutRef.current = nextLayout
    setOffset(nextOffset)
  }, [
    availableSize,
    fit,
    pageIdentity,
    navigationRequestId,
    renderedSize,
    clampingInsets,
    zoom,
  ])

  useEffect(() => {
    if (renderedSize.width <= 0 || renderedSize.height <= 0) return

    const controller = new AbortController()
    const displayed = displayedRenderRef.current
    if (displayed?.identity === renderIdentity) {
      setDisplayedRender(displayed)
      setRenderResult({ error: '', identity: renderIdentity, status: 'ready' })
      return
    }
    const slot: 0 | 1 = displayed?.slot === 0 ? 1 : 0
    const canvas = canvasRefs.current[slot]
    if (!canvas) return
    const startRender = () => {
      void renderer.renderPage({
        canvas,
        pageNumber: page.number,
        signal: controller.signal,
        url: document.file.url,
        ...renderedSize,
      }).then(() => {
        if (controller.signal.aborted) return
        const pageIndex = document.pages.findIndex(
          (candidate) => candidate.id === page.id,
        )
        renderer.prefetchPages({
          url: document.file.url,
          pageNumbers: [
            document.pages[pageIndex - 1]?.number,
            document.pages[pageIndex + 1]?.number,
          ].filter((pageNumber): pageNumber is number => pageNumber !== undefined),
        })
        const nextDisplayed = { identity: renderIdentity, pageIdentity, slot }
        displayedRenderRef.current = nextDisplayed
        setDisplayedRender(nextDisplayed)
        setRenderResult({ error: '', identity: renderIdentity, status: 'ready' })
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRenderResult({
          error: error instanceof Error
            ? error.message
            : 'The PDF page could not be rendered.',
          identity: renderIdentity,
          status: 'error',
        })
      })
    }
    const delay = displayed?.pageIdentity === pageIdentity ? 60 : 0
    const timeout = delay > 0 ? window.setTimeout(startRender, delay) : undefined
    if (timeout === undefined) startRender()

    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      controller.abort()
    }
  }, [
    document,
    page.id,
    page.number,
    pageIdentity,
    navigationRequestId,
    renderIdentity,
    renderedSize,
    renderer,
  ])

  const isCurrentRender =
    displayedRender?.identity === renderIdentity
  const isDisplayedPage = displayedRender?.pageIdentity === pageIdentity
  const isPendingRender =
    renderedSize.width > 0 &&
    renderedSize.height > 0 &&
    renderResult.identity !== renderIdentity

  useEffect(() => {
    if (!isCurrentRender) return
    onVisibleViewChange?.({
      documentId: document.id,
      documentVersionId: document.versionId,
      pageId: page.id,
      fit,
      requestId: navigationRequestId,
      zoom,
    })
  }, [
    document.id,
    document.versionId,
    fit,
    isCurrentRender,
    navigationRequestId,
    onVisibleViewChange,
    page.id,
    zoom,
  ])
  useEffect(() => {
    if (
      navigationRequestId === undefined ||
      renderResult.identity !== renderIdentity ||
      renderResult.status !== 'error'
    ) return
    onRenderError?.(navigationRequestId)
  }, [
    navigationRequestId,
    onRenderError,
    renderIdentity,
    renderResult,
  ])
  const selectedPointIndex = selectedPoint?.renderIdentity === renderIdentity
    ? selectedPoint.globalIndex
    : undefined

  const pagePoints = points
    .map((point, globalIndex) => ({
      ...point,
      globalIndex,
      pointNumber: point.pointNumber ?? globalIndex + 1,
    }))
    .filter((point) => point.pageId === page.id)

  const placeClientPoint = (clientX: number, clientY: number) => {
    if (!canMark || !isCurrentRender) return
    const bounds = frameRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return
    if (
      clientX < bounds.left || clientX > bounds.right ||
      clientY < bounds.top || clientY > bounds.bottom
    ) return
    onPlacePoint(normalizeClientPoint({ clientX, clientY, bounds }))
  }

  const placePointFromClick = (event: MouseEvent<HTMLDivElement>) => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false
      return
    }
    if (!canMark || !isCurrentRender) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    onPlacePoint(normalizeClientPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      bounds,
    }))
  }

  const updateZoom = useCallback((nextZoom: number, anchor?: PageOffset) => {
    const clampedZoom = clampDocumentZoom(nextZoom)
    if (!onZoomChange || clampedZoom === zoomRef.current) return
    onHumanTakeover?.()
    zoomRef.current = clampedZoom
    pendingZoomAnchorRef.current = anchor
    onZoomChange(clampedZoom)
  }, [onHumanTakeover, onZoomChange])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? Math.max(availableSize.width, availableSize.height)
          : 1
      const bounds = host.getBoundingClientRect()
      updateZoom(
        zoomRef.current * Math.exp(
          -event.deltaY * scale * WHEEL_ZOOM_SENSITIVITY,
        ),
        {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        },
      )
    }
    host.addEventListener('wheel', handleWheel, { passive: false })
    return () => host.removeEventListener('wheel', handleWheel)
  }, [
    availableSize,
    updateZoom,
  ])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (!isPointMarker(event.target)) {
      setSelectedPoint(undefined)
      if (event.pointerType === 'touch') setPointControlsDismissed(true)
      if (isPointMarker(globalThis.document.activeElement)) {
        (globalThis.document.activeElement as HTMLElement).blur()
      }
    }
    if (isInteractiveTarget(event.target)) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointer events have no active browser pointer to capture.
    }
    const hadPointers = pointersRef.current.size > 0
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    })
    if (!hadPointers) movementRef.current = false
    setIsPanning(true)
    if (pointersRef.current.size === 2) {
      onHumanTakeover?.()
      movementRef.current = true
      previousPinchRef.current = pointerGesture(pointersRef.current)
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = pointersRef.current.get(event.pointerId)
    if (!active) return

    const previousPosition = { x: active.x, y: active.y }
    active.x = event.clientX
    active.y = event.clientY
    const wasMoving = movementRef.current
    if (
      Math.hypot(active.x - active.startX, active.y - active.startY) >=
      PAN_MOVEMENT_THRESHOLD
    ) {
      if (!movementRef.current) onHumanTakeover?.()
      movementRef.current = true
    }

    if (pointersRef.current.size === 1) {
      if (!movementRef.current) return
      setOffset(clampPageOffset({
        insets: clampingInsets,
        page: renderedSize,
        viewport: availableSize,
        offset: {
          x: offsetRef.current.x + active.x - (wasMoving ? previousPosition.x : active.startX),
          y: offsetRef.current.y + active.y - (wasMoving ? previousPosition.y : active.startY),
        },
      }))
      return
    }

    if (pointersRef.current.size === 2) {
      const gesture = pointerGesture(pointersRef.current)
      const previousGesture = previousPinchRef.current ?? gesture
      setOffset(clampPageOffset({
        insets: clampingInsets,
        page: renderedSize,
        viewport: availableSize,
        offset: {
          x: offsetRef.current.x + gesture.center.x - previousGesture.center.x,
          y: offsetRef.current.y + gesture.center.y - previousGesture.center.y,
        },
      }))
      const hostBounds = event.currentTarget.getBoundingClientRect()
      updateZoom(zoomRef.current * gesture.distance / previousGesture.distance, {
        x: gesture.center.x - hostBounds.left,
        y: gesture.center.y - hostBounds.top,
      })
      previousPinchRef.current = gesture
    }
  }

  const finishPointer = (
    event: PointerEvent<HTMLDivElement>,
    shouldPlace: boolean,
  ) => {
    const wasOnlyPointer = pointersRef.current.size === 1
    const active = pointersRef.current.get(event.pointerId)
    pointersRef.current.delete(event.pointerId)
    previousPinchRef.current = pointersRef.current.size === 2
      ? pointerGesture(pointersRef.current)
      : undefined
    if (pointersRef.current.size === 0) setIsPanning(false)

    if (shouldPlace && wasOnlyPointer && active) {
      ignoreNextClickRef.current = true
    }
    if (shouldPlace && wasOnlyPointer && active && !movementRef.current) {
      placeClientPoint(event.clientX, event.clientY)
    }
  }

  return (
    <div
      className={`pdf-page-viewer${isPanning ? ' panning' : ''}`}
      onPointerCancel={(event) => finishPointer(event, false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointer(event, true)}
      ref={hostRef}
    >
      {renderedSize.width > 0 && renderedSize.height > 0 && (
        <div
          className="pdf-page-frame"
          ref={frameRef}
          style={{
            ...renderedSize,
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          }}
        >
          {([0, 1] as const).map((slot) => (
            <canvas
              aria-label={
                slot === (displayedRender?.slot ?? 0)
                  ? `Rendered PDF page ${page.label}`
                  : undefined
              }
              key={slot}
              ref={(canvas) => { canvasRefs.current[slot] = canvas }}
              style={{
                ...renderedSize,
                visibility:
                  isDisplayedPage && displayedRender?.slot === slot
                    ? 'visible'
                    : 'hidden',
              }}
            />
          ))}
          <div
            aria-label={`Drawing page ${page.label}`}
            className={canMark && isCurrentRender
              ? `point-set-overlay marking${pointControlsDismissed ? ' point-controls-dismissed' : ''}`
              : `point-set-overlay${pointControlsDismissed ? ' point-controls-dismissed' : ''}`}
            onClick={placePointFromClick}
            role={canMark && isCurrentRender ? 'button' : undefined}
          >
            {isDisplayedPage && pagePoints.map((point) => (
              <span
                className={`point-mark${selectedPointIndex === point.globalIndex ? ' selected' : ''}`}
                key={onRemovePoint
                  ? `draft-${point.globalIndex}`
                  : `submitted-${point.pointNumber}`}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') setPointControlsDismissed(false)
                }}
              >
                {onRemovePoint ? (
                  <>
                    <button
                      aria-label={`Point ${point.pointNumber}`}
                      className="point-pin"
                      onClick={(event) => {
                        event.stopPropagation()
                        setPointControlsDismissed(false)
                        setSelectedPoint({
                          globalIndex: point.globalIndex,
                          renderIdentity,
                        })
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        setPointControlsDismissed(false)
                      }}
                      type="button"
                    >
                      <MapPin
                        aria-hidden="true"
                        className="point-pin-icon"
                        fill="currentColor"
                        strokeWidth={1.75}
                      />
                      <span className="point-pin-label">{point.pointNumber}</span>
                    </button>
                    <button
                      aria-label={`Remove point ${point.pointNumber}`}
                      className="remove-point"
                      onClick={(event) => {
                        event.stopPropagation()
                        event.currentTarget.blur()
                        setSelectedPoint(undefined)
                        onRemovePoint(point.globalIndex)
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      type="button"
                    >
                      <X aria-hidden="true" strokeWidth={3} />
                    </button>
                  </>
                ) : (
                  <span
                    aria-label={`Submitted point ${point.pointNumber} at ${Math.round(point.x * 100)}% from left and ${Math.round(point.y * 100)}% from top`}
                    className="point-pin"
                    role="img"
                    tabIndex={0}
                  >
                    <MapPin
                      aria-hidden="true"
                      className="point-pin-icon"
                      fill="currentColor"
                      strokeWidth={1.75}
                    />
                    <span className="point-pin-label">{point.pointNumber}</span>
                  </span>
                )}
              </span>
            ))}
          </div>
          {isPendingRender && !isDisplayedPage && (
            <div className="pdf-render-cover">
              <p className="pdf-render-status" role="status">Rendering PDF page</p>
            </div>
          )}
        </div>
      )}
      {renderResult.identity === renderIdentity && renderResult.status === 'error' && (
        <div className="pdf-render-error" role="alert">
          <p>{renderResult.error}</p>
          <a
            href={`${document.file.url}#page=${page.number}`}
            rel="noreferrer"
            target="_blank"
          >
            Open authoritative PDF page
          </a>
        </div>
      )}
    </div>
  )
}

function pointerGesture(pointers: Map<number, ActivePointer>) {
  const [first, second] = [...pointers.values()]
  if (!first || !second) {
    return { center: { x: 0, y: 0 }, distance: 1 }
  }
  return {
    center: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
  }
}

function isInteractiveTarget(target: EventTarget) {
  return target instanceof Element && Boolean(
    target.closest('button, a, input, textarea, select, [contenteditable="true"]'),
  )
}

function isPointMarker(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.point-mark'))
}

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import type { DocumentPage, ProjectDocument } from '../demoProject/demoProject'
import type { StoredPoint } from '../demoSession/demoSession'
import {
  centerPageOffset,
  clampPageOffset,
  fitPageInBounds,
  MAX_DOCUMENT_ZOOM,
  MIN_DOCUMENT_ZOOM,
  normalizeClientPoint,
  zoomPageAroundPoint,
  type NormalizedPoint,
  type PageFit,
  type PageOffset,
  type PageSize,
} from './pageGeometry'

export const PAN_MOVEMENT_THRESHOLD = 6

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
  onPlacePoint: (point: NormalizedPoint) => void
  onZoomChange?: (zoom: number) => void
  page: DocumentPage
  points: StoredPoint[]
  renderer: PdfPageRenderer
  zoom: number
}

type RenderState = 'idle' | 'loading' | 'ready' | 'error'

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
  onPlacePoint,
  onZoomChange,
  page,
  points,
  renderer,
  zoom,
}: PdfPageViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointersRef = useRef(new Map<number, ActivePointer>())
  const previousPinchRef = useRef<
    { center: PageOffset; distance: number } | undefined
  >(undefined)
  const movementRef = useRef(false)
  const ignoreNextClickRef = useRef(false)
  const pendingZoomAnchorRef = useRef<PageOffset | undefined>(undefined)
  const layoutRef = useRef<LayoutSnapshot | undefined>(undefined)
  const offsetRef = useRef<PageOffset>({ x: 0, y: 0 })
  const [availableSize, setAvailableSize] = useState<PageSize>({
    width: 0,
    height: 0,
  })
  const [offset, setOffsetState] = useState<PageOffset>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [renderState, setRenderState] = useState<RenderState>('idle')
  const [renderError, setRenderError] = useState('')

  const setOffset = (nextOffset: PageOffset) => {
    offsetRef.current = nextOffset
    setOffsetState(nextOffset)
  }

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
      !previous ||
      previous.pageIdentity !== pageIdentity ||
      previous.fit !== fit
    ) {
      nextOffset = centerPageOffset(renderedSize, availableSize)
    } else if (previous.zoom !== zoom) {
      nextOffset = zoomPageAroundPoint({
        currentPage: previous.pageSize,
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
        page: renderedSize,
        viewport: availableSize,
        offset: offsetRef.current,
      })
    }

    pendingZoomAnchorRef.current = undefined
    layoutRef.current = nextLayout
    setOffset(nextOffset)
  }, [availableSize, fit, pageIdentity, renderedSize, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || renderedSize.width <= 0 || renderedSize.height <= 0) return

    const controller = new AbortController()
    setRenderState('loading')
    setRenderError('')
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
      setRenderState('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setRenderState('error')
      setRenderError(
        error instanceof Error ? error.message : 'The PDF page could not be rendered.',
      )
    })

    return () => controller.abort()
  }, [document, page.id, page.number, renderedSize, renderer])

  const pagePoints = points
    .map((point, index) => ({
      ...point,
      pointNumber: point.pointNumber ?? index + 1,
    }))
    .filter((point) => point.pageId === page.id)

  const placeClientPoint = (clientX: number, clientY: number) => {
    if (!canMark) return
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
    if (!canMark) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    onPlacePoint(normalizeClientPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      bounds,
    }))
  }

  const updateZoom = (nextZoom: number, anchor?: PageOffset) => {
    const clampedZoom = clampZoom(nextZoom)
    if (clampedZoom === zoom) return
    pendingZoomAnchorRef.current = anchor
    onZoomChange?.(clampedZoom)
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    updateZoom(zoom * Math.exp(-event.deltaY * 0.0015), {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    })
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointer events have no active browser pointer to capture.
    }
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    })
    movementRef.current = false
    setIsPanning(true)
    if (pointersRef.current.size === 2) {
      previousPinchRef.current = pointerGesture(pointersRef.current)
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = pointersRef.current.get(event.pointerId)
    if (!active) return

    const previousPosition = { x: active.x, y: active.y }
    active.x = event.clientX
    active.y = event.clientY
    if (
      Math.hypot(active.x - active.startX, active.y - active.startY) >=
      PAN_MOVEMENT_THRESHOLD
    ) {
      movementRef.current = true
    }

    if (pointersRef.current.size === 1) {
      setOffset(clampPageOffset({
        page: renderedSize,
        viewport: availableSize,
        offset: {
          x: offsetRef.current.x + active.x - previousPosition.x,
          y: offsetRef.current.y + active.y - previousPosition.y,
        },
      }))
      return
    }

    if (pointersRef.current.size === 2) {
      const gesture = pointerGesture(pointersRef.current)
      const previousGesture = previousPinchRef.current ?? gesture
      setOffset(clampPageOffset({
        page: renderedSize,
        viewport: availableSize,
        offset: {
          x: offsetRef.current.x + gesture.center.x - previousGesture.center.x,
          y: offsetRef.current.y + gesture.center.y - previousGesture.center.y,
        },
      }))
      const hostBounds = event.currentTarget.getBoundingClientRect()
      updateZoom(zoom * gesture.distance / previousGesture.distance, {
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
      onWheel={handleWheel}
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
          <canvas
            aria-label={`Rendered PDF page ${page.label}`}
            ref={canvasRef}
            style={renderedSize}
          />
          <div
            aria-label={`Drawing page ${page.label}`}
            className={canMark ? 'point-set-overlay marking' : 'point-set-overlay'}
            onClick={placePointFromClick}
            role={canMark ? 'button' : undefined}
          >
            {pagePoints.map((point) => (
              <span
                className="point-mark"
                key={`${point.x}-${point.y}-${point.pointNumber}`}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              >
                {point.pointNumber}
              </span>
            ))}
          </div>
          {renderState === 'loading' && (
            <p className="pdf-render-status" role="status">Rendering PDF page</p>
          )}
        </div>
      )}
      {renderState === 'error' && (
        <div className="pdf-render-error" role="alert">
          <p>{renderError}</p>
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

function clampZoom(zoom: number) {
  return Math.min(MAX_DOCUMENT_ZOOM, Math.max(MIN_DOCUMENT_ZOOM, zoom))
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

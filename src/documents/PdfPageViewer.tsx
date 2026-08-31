import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import type { DocumentPage, ProjectDocument } from '../demoProject/demoProject'
import type { StoredPoint } from '../demoSession/demoSession'
import { fitPageInBounds, normalizeClientPoint, type PageSize } from './pageGeometry'

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
  onPlacePoint: (point: { x: number; y: number }) => void
  page: DocumentPage
  points: StoredPoint[]
  renderer: PdfPageRenderer
  zoom: number
}

type RenderState = 'idle' | 'loading' | 'ready' | 'error'

export function PdfPageViewer({
  canMark,
  document,
  onPlacePoint,
  page,
  points,
  renderer,
  zoom,
}: PdfPageViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [availableSize, setAvailableSize] = useState<PageSize>({
    width: 0,
    height: 0,
  })
  const [renderState, setRenderState] = useState<RenderState>('idle')
  const [renderError, setRenderError] = useState('')

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
    () => fitPageInBounds(page, availableSize, zoom),
    [availableSize, page, zoom],
  )

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

  const pagePoints = points.filter((point) => point.pageId === page.id)
  const placePoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!canMark) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    onPlacePoint(normalizeClientPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      bounds,
    }))
  }

  return (
    <div className="pdf-page-viewer" ref={hostRef}>
      {renderedSize.width > 0 && renderedSize.height > 0 && (
        <div
          className="pdf-page-frame"
          data-page-rotation={page.rotation}
          style={renderedSize}
        >
          <canvas
            aria-label={`Rendered PDF page ${page.label}`}
            ref={canvasRef}
            style={renderedSize}
          />
          <div
            aria-label={`Drawing page ${page.label}`}
            className={canMark ? 'point-set-overlay marking' : 'point-set-overlay'}
            onClick={placePoint}
            role={canMark ? 'button' : undefined}
          >
            {pagePoints.map((point, index) => (
              <span
                className="point-mark"
                key={`${point.x}-${point.y}-${index}`}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              >
                {index + 1}
              </span>
            ))}
          </div>
          {renderState === 'loading' && (
            <p className="pdf-render-status" role="status">Rendering PDF page</p>
          )}
        </div>
      )}
      {renderState === 'error' && (
        <p className="pdf-render-error" role="alert">{renderError}</p>
      )}
    </div>
  )
}

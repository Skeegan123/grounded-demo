import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { StoredPoint } from '../demoSession/demoSession'
import type { DocumentPage, ProjectDocument } from '../demoProject/demoProject'
import {
  MAX_DOCUMENT_ZOOM,
  MIN_DOCUMENT_ZOOM,
  type NormalizedPoint,
  type PageFit,
  type PageViewportInsets,
} from './pageGeometry'
import { PdfPageViewer, type PdfPageRenderer } from './PdfPageViewer'
import {
  WorkbenchNavigation,
  type PagePickerItem,
} from './WorkbenchNavigation'

export interface DocumentWorkbenchProps {
  assistanceExpanded: boolean
  canMark: boolean
  currentDocument: ProjectDocument
  currentPage: DocumentPage
  documents: ProjectDocument[]
  fit: PageFit
  onFitChange: (fit: PageFit) => void
  onOpenAssistance: () => void
  onPlacePoint: (point: NormalizedPoint) => void
  onRemovePoint?: (globalIndex: number) => void
  onSelectDocument: (document: ProjectDocument) => void
  onSelectPage: (page: DocumentPage) => void
  onViewUndonePointPage: () => void
  onZoomChange: (zoom: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  pageItems: PagePickerItem[]
  pageRenderer: PdfPageRenderer
  points: StoredPoint[]
  requestStrip?: ReactNode
  undoNotice?: {
    pageLabel: string
  }
  zoom: number
}

export function DocumentWorkbench({
  assistanceExpanded,
  canMark,
  currentDocument,
  currentPage,
  documents,
  fit,
  onFitChange,
  onOpenAssistance,
  onPlacePoint,
  onRemovePoint,
  onSelectDocument,
  onSelectPage,
  onViewUndonePointPage,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  pageItems,
  pageRenderer,
  points,
  requestStrip,
  undoNotice,
  zoom,
}: DocumentWorkbenchProps) {
  const zoomControlsRef = useRef<HTMLDivElement>(null)
  const [viewerInsets, setViewerInsets] = useState<PageViewportInsets>({})

  useLayoutEffect(() => {
    const controls = zoomControlsRef.current
    if (!controls) return
    const updateInsets = () => setViewerInsets({
      bottom: controls.offsetHeight + 24,
      right: controls.offsetWidth + 24,
    })
    const observer = new ResizeObserver(updateInsets)
    updateInsets()
    observer.observe(controls)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="document-pane" aria-labelledby="work-area-title">
      <WorkbenchNavigation
        assistanceExpanded={assistanceExpanded}
        currentDocument={currentDocument}
        currentPage={currentPage}
        documents={documents}
        onOpenAssistance={onOpenAssistance}
        onSelectDocument={onSelectDocument}
        onSelectPage={onSelectPage}
        pageItems={pageItems}
      />
      {requestStrip}
      <div className="drawing-stage">
        <div
          className="zoom-controls"
          aria-label="Document zoom"
          ref={zoomControlsRef}
        >
          <button
            aria-label="Zoom out"
            disabled={zoom <= MIN_DOCUMENT_ZOOM}
            onClick={onZoomOut}
            type="button"
          >
            −
          </button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            disabled={zoom >= MAX_DOCUMENT_ZOOM}
            onClick={onZoomIn}
            type="button"
          >
            +
          </button>
          <button
            aria-label="Fit page"
            aria-pressed={fit === 'page'}
            className="fit-control"
            onClick={() => onFitChange('page')}
            type="button"
          >
            Page
          </button>
          <button
            aria-label="Fit width"
            aria-pressed={fit === 'width'}
            className="fit-control"
            onClick={() => onFitChange('width')}
            type="button"
          >
            Width
          </button>
        </div>
        <PdfPageViewer
          canMark={canMark}
          document={currentDocument}
          fit={fit}
          onPlacePoint={onPlacePoint}
          onRemovePoint={onRemovePoint}
          onZoomChange={onZoomChange}
          page={currentPage}
          points={points}
          renderer={pageRenderer}
          viewportInsets={viewerInsets}
          zoom={zoom}
        />
        {undoNotice && (
          <div className="undo-notice" role="status">
            <span>Removed the latest point from page {undoNotice.pageLabel}.</span>
            <button onClick={onViewUndonePointPage} type="button">
              View page {undoNotice.pageLabel}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

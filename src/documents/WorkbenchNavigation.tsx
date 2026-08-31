import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { DocumentPage, ProjectDocument } from '../demoProject/demoProject'

export interface PagePickerItem {
  page: DocumentPage
  adornment?: ReactNode
}

interface WorkbenchNavigationProps {
  currentDocument: ProjectDocument
  currentPage: DocumentPage
  documents: ProjectDocument[]
  onOpenAssistance: () => void
  onSelectDocument: (document: ProjectDocument) => void
  onSelectPage: (page: DocumentPage) => void
  pageItems: PagePickerItem[]
}

export function WorkbenchNavigation({
  currentDocument,
  currentPage,
  documents,
  onOpenAssistance,
  onSelectDocument,
  onSelectPage,
  pageItems,
}: WorkbenchNavigationProps) {
  const [openPanel, setOpenPanel] = useState<
    'documents' | 'pages' | 'more' | undefined
  >()
  const [documentSearch, setDocumentSearch] = useState('')
  const [pageSearch, setPageSearch] = useState('')
  const documentsPopupRef = useRef<HTMLDivElement>(null)
  const pagesPopupRef = useRef<HTMLDivElement>(null)
  const morePopupRef = useRef<HTMLDivElement>(null)
  const documentsButtonRef = useRef<HTMLButtonElement>(null)
  const pagesButtonRef = useRef<HTMLButtonElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const documentSearchRef = useRef<HTMLInputElement>(null)
  const pageSearchRef = useRef<HTMLInputElement>(null)

  const activePopupRef =
    openPanel === 'documents'
      ? documentsPopupRef
      : openPanel === 'pages'
        ? pagesPopupRef
        : openPanel === 'more'
          ? morePopupRef
          : undefined
  const activeButtonRef =
    openPanel === 'documents'
      ? documentsButtonRef
      : openPanel === 'pages'
        ? pagesButtonRef
        : openPanel === 'more'
          ? moreButtonRef
          : undefined

  useDismissPopup(openPanel, activePopupRef, activeButtonRef, () => {
    setOpenPanel(undefined)
  })

  useEffect(() => {
    if (openPanel === 'documents') documentSearchRef.current?.focus()
    if (openPanel === 'pages') pageSearchRef.current?.focus()
  }, [openPanel])

  const filteredDocuments = documents.filter((document) =>
    searchableDocumentText(document).includes(documentSearch.trim().toLowerCase()),
  )
  const filteredPages = pageItems.filter(({ page }) =>
    searchablePageText(page).includes(pageSearch.trim().toLowerCase()),
  )
  const currentPageIndex = pageItems.findIndex(
    ({ page }) => page.id === currentPage.id,
  )

  const togglePanel = (panel: NonNullable<typeof openPanel>) => {
    setOpenPanel((current) => (current === panel ? undefined : panel))
    if (panel === 'documents') setDocumentSearch('')
    if (panel === 'pages') setPageSearch('')
  }

  return (
    <div className="workbench-navigation">
      <div className="workbench-toolbar" aria-label="Document workbench">
        <button
          aria-expanded={openPanel === 'documents'}
          aria-haspopup="dialog"
          onClick={() => togglePanel('documents')}
          ref={documentsButtonRef}
          type="button"
        >
          Documents
        </button>
        <h1 id="work-area-title">{currentDocument.title}</h1>
        <div className="page-navigation" aria-label="Page navigation">
          <button
            disabled={currentPageIndex <= 0}
            onClick={() => onSelectPage(pageItems[currentPageIndex - 1]!.page)}
            type="button"
          >
            Previous
          </button>
          <button
            aria-label={`Current page: ${currentPage.sheetNumber ?? currentPage.label}, ${currentPage.title}`}
            aria-expanded={openPanel === 'pages'}
            aria-haspopup="dialog"
            className="current-page-button"
            onClick={() => togglePanel('pages')}
            ref={pagesButtonRef}
            type="button"
          >
            <span>{currentPage.sheetNumber ?? currentPage.label}</span>
            <small>{currentPage.title}</small>
          </button>
          <button
            disabled={
              currentPageIndex < 0 || currentPageIndex === pageItems.length - 1
            }
            onClick={() => onSelectPage(pageItems[currentPageIndex + 1]!.page)}
            type="button"
          >
            Next
          </button>
        </div>
        <button onClick={onOpenAssistance} type="button">
          Assistance
        </button>
        <button
          aria-expanded={openPanel === 'more'}
          aria-haspopup="dialog"
          onClick={() => togglePanel('more')}
          ref={moreButtonRef}
          type="button"
        >
          More
        </button>
      </div>

      {openPanel === 'documents' && (
        <div
          aria-label="Choose a document"
          className="workbench-popup documents-popup"
          ref={documentsPopupRef}
          role="dialog"
        >
          <label htmlFor="document-search">Search documents</label>
          <input
            id="document-search"
            onChange={(event) => setDocumentSearch(event.target.value)}
            placeholder="Title, description, kind, version, or file"
            ref={documentSearchRef}
            type="search"
            value={documentSearch}
          />
          <nav aria-label="Project documents">
            {filteredDocuments.map((document) => (
              <button
                aria-current={
                  document.id === currentDocument.id &&
                  document.versionId === currentDocument.versionId
                    ? 'page'
                    : undefined
                }
                className="document-option"
                key={`${document.id}:${document.versionId}`}
                onClick={() => {
                  onSelectDocument(document)
                  setOpenPanel(undefined)
                }}
                type="button"
              >
                <strong>{document.title}</strong>
                <span>{document.description}</span>
                <small>
                  {formatDocumentKind(document.kind)} · {document.versionId} ·{' '}
                  {document.file.name}
                </small>
              </button>
            ))}
          </nav>
          {filteredDocuments.length === 0 && (
            <p className="navigation-empty">No matching documents</p>
          )}
        </div>
      )}

      {openPanel === 'pages' && (
        <div
          aria-label="Choose a page"
          className="workbench-popup pages-popup"
          ref={pagesPopupRef}
          role="dialog"
        >
          <label htmlFor="page-search">Search pages</label>
          <input
            id="page-search"
            onChange={(event) => setPageSearch(event.target.value)}
            placeholder="Sheet number or title"
            ref={pageSearchRef}
            type="search"
            value={pageSearch}
          />
          <div aria-label="Document pages" className="page-options" role="listbox">
            {filteredPages.map(({ page, adornment }) => (
              <button
                aria-label={`${page.sheetNumber ?? page.label} ${page.title}`}
                aria-selected={page.id === currentPage.id}
                className="page-option"
                key={page.id}
                onClick={() => {
                  onSelectPage(page)
                  setOpenPanel(undefined)
                }}
                role="option"
                type="button"
              >
                <span>
                  <strong>{page.sheetNumber ?? page.label}</strong>
                  <small>{page.title}</small>
                </span>
                {adornment && <span className="page-option-adornment">{adornment}</span>}
              </button>
            ))}
          </div>
          {filteredPages.length === 0 && (
            <p className="navigation-empty">No matching pages</p>
          )}
        </div>
      )}

      {openPanel === 'more' && (
        <div
          aria-label="More document actions"
          className="workbench-popup more-popup"
          ref={morePopupRef}
          role="dialog"
        >
          <a
            href={`${currentDocument.file.url}#page=${currentPage.number}`}
            rel="noreferrer"
            target="_blank"
          >
            Open authoritative PDF
          </a>
          <div className="shortcut-reference">
            <strong>Keyboard shortcuts</strong>
            <dl>
              <div><dt>Previous / next page</dt><dd>Left / Right</dd></div>
              <div><dt>Zoom</dt><dd>+ / −</dd></div>
              <div><dt>Fit page</dt><dd>0</dd></div>
              <div><dt>Fit width</dt><dd>Shift+0</dd></div>
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}

function useDismissPopup(
  openPanel: string | undefined,
  popupRef: RefObject<HTMLElement | null> | undefined,
  buttonRef: RefObject<HTMLElement | null> | undefined,
  dismiss: () => void,
) {
  useEffect(() => {
    if (!openPanel) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !popupRef?.current?.contains(target) &&
        !buttonRef?.current?.contains(target)
      ) {
        dismiss()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      dismiss()
      buttonRef?.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [buttonRef, dismiss, openPanel, popupRef])
}

function searchableDocumentText(document: ProjectDocument) {
  return [
    document.title,
    document.description,
    document.kind,
    formatDocumentKind(document.kind),
    document.id,
    document.versionId,
    document.file.name,
  ]
    .join(' ')
    .toLowerCase()
}

function searchablePageText(page: DocumentPage) {
  return [page.label, page.sheetNumber, page.title, String(page.number)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function formatDocumentKind(kind: ProjectDocument['kind']) {
  return kind === 'contract_drawings' ? 'Contract drawings' : 'Submittal product data'
}

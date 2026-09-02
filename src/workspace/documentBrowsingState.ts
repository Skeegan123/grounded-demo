import { demoProject, findDocument } from '../demoProject/demoProject'
import {
  MAX_DOCUMENT_ZOOM,
  MIN_DOCUMENT_ZOOM,
} from '../documents/pageGeometry'

export type DocumentFitPreference = 'page' | 'width'

export interface DocumentLocation {
  documentId: string
  documentVersionId: string
  pageId: string
}

export type DocumentSelection = Omit<DocumentLocation, 'pageId'> & {
  pageId?: string
}

export interface DocumentBrowsingSnapshot {
  selectedLocation: DocumentLocation
  lastPageIdByDocument: Record<string, string>
  fitPreference: DocumentFitPreference
  zoom: number
}

export interface DocumentBrowsingState extends DocumentBrowsingSnapshot {
  assistanceCollapsed: boolean
}

const DOCUMENT_BROWSING_STORAGE_KEY_PREFIX = 'grounded.document-browsing:'

export function documentKey(documentId: string, documentVersionId: string) {
  return `${documentId}:${documentVersionId}`
}

export function createDefaultDocumentBrowsingState(): DocumentBrowsingState {
  const document = demoProject.documents[0]!
  const page = document.pages[0]!
  return {
    assistanceCollapsed: false,
    selectedLocation: {
      documentId: document.id,
      documentVersionId: document.versionId,
      pageId: page.id,
    },
    lastPageIdByDocument: {
      [documentKey(document.id, document.versionId)]: page.id,
    },
    fitPreference: 'page',
    zoom: 1,
  }
}

export function captureDocumentBrowsingSnapshot(
  state: DocumentBrowsingState,
): DocumentBrowsingSnapshot {
  return {
    selectedLocation: { ...state.selectedLocation },
    lastPageIdByDocument: { ...state.lastPageIdByDocument },
    fitPreference: state.fitPreference,
    zoom: state.zoom,
  }
}

export function loadDocumentBrowsingState(
  storage: Storage,
  sessionId: string,
): DocumentBrowsingState {
  const fallback = createDefaultDocumentBrowsingState()
  const stored = storage.getItem(storageKey(sessionId))
  if (!stored) return fallback

  try {
    const candidate = JSON.parse(stored) as Partial<DocumentBrowsingState> & {
      selectedDocumentId?: unknown
      selectedDocumentVersionId?: unknown
      selectedPageId?: unknown
    }
    const candidateLocation = candidate.selectedLocation ?? (
      typeof candidate.selectedDocumentId === 'string' &&
      typeof candidate.selectedDocumentVersionId === 'string' &&
      typeof candidate.selectedPageId === 'string'
        ? {
            documentId: candidate.selectedDocumentId,
            documentVersionId: candidate.selectedDocumentVersionId,
            pageId: candidate.selectedPageId,
          }
        : undefined
    )
    const selectedDocument =
      candidateLocation &&
      typeof candidateLocation.documentId === 'string' &&
      typeof candidateLocation.documentVersionId === 'string'
        ? findDocument(
            candidateLocation.documentId,
            candidateLocation.documentVersionId,
          )
        : undefined
    if (!selectedDocument) return fallback

    const lastPageIdByDocument: Record<string, string> = {}
    if (
      candidate.lastPageIdByDocument &&
      typeof candidate.lastPageIdByDocument === 'object'
    ) {
      for (const document of demoProject.documents) {
        const key = documentKey(document.id, document.versionId)
        const pageId = candidate.lastPageIdByDocument[key]
        if (document.pages.some((page) => page.id === pageId)) {
          lastPageIdByDocument[key] = pageId
        }
      }
    }

    const selectedDocumentKey = documentKey(
      selectedDocument.id,
      selectedDocument.versionId,
    )
    const selectedPageId = selectedDocument.pages.some(
      (page) => page.id === candidateLocation?.pageId,
    )
      ? candidateLocation!.pageId
      : lastPageIdByDocument[selectedDocumentKey] ??
        selectedDocument.pages[0]!.id
    lastPageIdByDocument[selectedDocumentKey] = selectedPageId

    return {
      assistanceCollapsed: candidate.assistanceCollapsed === true,
      selectedLocation: {
        documentId: selectedDocument.id,
        documentVersionId: selectedDocument.versionId,
        pageId: selectedPageId,
      },
      lastPageIdByDocument,
      fitPreference: candidate.fitPreference === 'width' ? 'width' : 'page',
      zoom:
        typeof candidate.zoom === 'number' &&
        Number.isFinite(candidate.zoom) &&
        candidate.zoom >= MIN_DOCUMENT_ZOOM &&
        candidate.zoom <= MAX_DOCUMENT_ZOOM
          ? candidate.zoom
          : 1,
    }
  } catch {
    return fallback
  }
}

export function saveDocumentBrowsingState(
  storage: Storage,
  sessionId: string,
  state: DocumentBrowsingState,
) {
  storage.setItem(storageKey(sessionId), JSON.stringify(state))
}

export function clearDocumentBrowsingState(
  storage: Storage,
  sessionId: string,
) {
  storage.removeItem(storageKey(sessionId))
}

function storageKey(sessionId: string) {
  return `${DOCUMENT_BROWSING_STORAGE_KEY_PREFIX}${sessionId}`
}

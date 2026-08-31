import { createStore } from 'zustand/vanilla'
import { demoProject } from '../demoProject/demoProject'
import type { StoredPoint } from '../demoSession/demoSession'
import {
  MAX_DOCUMENT_ZOOM,
  MIN_DOCUMENT_ZOOM,
} from '../documents/pageGeometry'
import {
  createDefaultDocumentBrowsingState,
  documentKey,
  type DocumentBrowsingState,
  type DocumentFitPreference,
} from './documentBrowsingState'

export interface WorkspaceState extends DocumentBrowsingState {
  assistanceTab: 'current' | 'queue' | 'done'
  declineReason: string
  points: StoredPoint[]
  note: string
  text: string
  addPoint: (point: StoredPoint) => void
  clearDraft: () => void
  removePoint: (index: number) => void
  selectDocument: (
    documentId: string,
    documentVersionId: string,
    pageId?: string,
  ) => void
  selectPage: (pageId: string) => void
  setAssistanceTab: (tab: 'current' | 'queue' | 'done') => void
  setAssistanceCollapsed: (collapsed: boolean) => void
  setDeclineReason: (reason: string) => void
  setFitPreference: (preference: DocumentFitPreference) => void
  setNote: (note: string) => void
  setText: (text: string) => void
  setZoom: (zoom: number) => void
  undoPoint: () => void
  zoomIn: () => void
  zoomOut: () => void
}

export function createWorkspaceStore(
  initialBrowsingState = createDefaultDocumentBrowsingState(),
) {
  return createStore<WorkspaceState>((set) => ({
    ...initialBrowsingState,
    assistanceTab: 'current',
    declineReason: '',
    points: [],
    note: '',
    text: '',
    addPoint: (point) =>
      set((state) => ({ points: [...state.points, point] })),
    clearDraft: () => set({ declineReason: '', points: [], note: '', text: '' }),
    removePoint: (index) =>
      set((state) => ({
        points: state.points.filter((_, pointIndex) => pointIndex !== index),
      })),
    selectDocument: (
      selectedDocumentId,
      selectedDocumentVersionId,
      requestedPageId,
    ) =>
      set((state) => {
        const document = demoProject.documents.find(
          (candidate) =>
            candidate.id === selectedDocumentId &&
            candidate.versionId === selectedDocumentVersionId,
        )
        if (!document) return state

        const key = documentKey(selectedDocumentId, selectedDocumentVersionId)
        const rememberedPageId = state.lastPageIdByDocument[key]
        const selectedPageId = document.pages.some(
          (page) => page.id === requestedPageId,
        )
          ? requestedPageId!
          : document.pages.some((page) => page.id === rememberedPageId)
            ? rememberedPageId
            : document.pages[0]!.id

        return {
          selectedDocumentId,
          selectedDocumentVersionId,
          selectedPageId,
          lastPageIdByDocument: {
            ...state.lastPageIdByDocument,
            [key]: selectedPageId,
          },
          fitPreference: 'page',
          zoom: 1,
        }
      }),
    selectPage: (selectedPageId) =>
      set((state) => ({
        selectedPageId,
        lastPageIdByDocument: {
          ...state.lastPageIdByDocument,
          [documentKey(
            state.selectedDocumentId,
            state.selectedDocumentVersionId,
          )]: selectedPageId,
        },
        fitPreference: 'page',
        zoom: 1,
      })),
    setAssistanceTab: (assistanceTab) => set({ assistanceTab }),
    setAssistanceCollapsed: (assistanceCollapsed) => set({ assistanceCollapsed }),
    setDeclineReason: (declineReason) => set({ declineReason }),
    setFitPreference: (fitPreference) => set({ fitPreference, zoom: 1 }),
    setNote: (note) => set({ note }),
    setText: (text) => set({ text }),
    setZoom: (zoom) => set({
      zoom: Math.min(MAX_DOCUMENT_ZOOM, Math.max(MIN_DOCUMENT_ZOOM, zoom)),
    }),
    undoPoint: () =>
      set((state) => ({ points: state.points.slice(0, -1) })),
    zoomIn: () =>
      set((state) => ({
        zoom: Math.min(
          MAX_DOCUMENT_ZOOM,
          Number((state.zoom + 0.1).toFixed(2)),
        ),
      })),
    zoomOut: () =>
      set((state) => ({
        zoom: Math.max(
          MIN_DOCUMENT_ZOOM,
          Number((state.zoom - 0.1).toFixed(2)),
        ),
      })),
  }))
}

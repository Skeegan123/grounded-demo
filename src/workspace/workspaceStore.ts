import { createStore } from 'zustand/vanilla'
import { demoProject } from '../demoProject/demoProject'
import type { StoredPoint } from '../demoSession/demoSession'

export interface WorkspaceState {
  points: StoredPoint[]
  note: string
  selectedDocumentId: string
  selectedDocumentVersionId: string
  selectedPageId: string
  zoom: number
  addPoint: (point: StoredPoint) => void
  clearDraft: () => void
  selectDocument: (
    documentId: string,
    documentVersionId: string,
    pageId: string,
  ) => void
  selectPage: (pageId: string) => void
  setNote: (note: string) => void
  undoPoint: () => void
  zoomIn: () => void
  zoomOut: () => void
}

export function createWorkspaceStore() {
  const initialDocument = demoProject.documents[0]!

  return createStore<WorkspaceState>((set) => ({
    points: [],
    note: '',
    selectedDocumentId: initialDocument.id,
    selectedDocumentVersionId: initialDocument.versionId,
    selectedPageId: initialDocument.pages[0]!.id,
    zoom: 1,
    addPoint: (point) =>
      set((state) => ({ points: [...state.points, point] })),
    clearDraft: () => set({ points: [], note: '' }),
    selectDocument: (
      selectedDocumentId,
      selectedDocumentVersionId,
      selectedPageId,
    ) => set({ selectedDocumentId, selectedDocumentVersionId, selectedPageId }),
    selectPage: (selectedPageId) => set({ selectedPageId }),
    setNote: (note) => set({ note }),
    undoPoint: () =>
      set((state) => ({ points: state.points.slice(0, -1) })),
    zoomIn: () =>
      set((state) => ({ zoom: Math.min(2, Number((state.zoom + 0.1).toFixed(1))) })),
    zoomOut: () =>
      set((state) => ({ zoom: Math.max(0.5, Number((state.zoom - 0.1).toFixed(1))) })),
  }))
}

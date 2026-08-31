import { createStore } from 'zustand/vanilla'
import type { StoredPoint } from '../demoSession/demoSession'

export interface WorkspaceState {
  points: StoredPoint[]
  note: string
  addPoint: (point: StoredPoint) => void
  clearDraft: () => void
  setNote: (note: string) => void
  undoPoint: () => void
}

export function createWorkspaceStore() {
  return createStore<WorkspaceState>((set) => ({
    points: [],
    note: '',
    addPoint: (point) =>
      set((state) => ({ points: [...state.points, point] })),
    clearDraft: () => set({ points: [], note: '' }),
    setNote: (note) => set({ note }),
    undoPoint: () =>
      set((state) => ({ points: state.points.slice(0, -1) })),
  }))
}

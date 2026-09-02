import type { ProjectDocument } from '../demoProject/demoProject'
import { documentKey } from '../workspace/documentBrowsingState'
import type { createWorkspaceStore } from '../workspace/workspaceStore'

export type DocumentNavigationTarget =
  | { type: 'document' }
  | { type: 'page'; pageId: string }

export interface NavigateDocumentInput {
  documentId: string
  target?: { type: 'page'; pageId: string }
}

export interface VisibleDocumentView {
  documentId: string
  documentVersionId: string
  pageId: string
  fit: 'page' | 'width'
  zoom: number
}

export interface AppliedDocumentNavigation {
  status: 'applied'
  document: {
    id: string
    versionId: string
  }
  page: {
    id: string
  }
  type: DocumentNavigationTarget['type']
  fit: 'page'
  zoom: number
}

export interface DocumentNavigator {
  navigate: (input: NavigateDocumentInput) => Promise<AppliedDocumentNavigation>
  reportVisibleView: (view: VisibleDocumentView) => void
}

interface CreateDocumentNavigatorOptions {
  documents: ProjectDocument[]
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}

interface PendingNavigation {
  document: ProjectDocument
  pageId: string
  type: DocumentNavigationTarget['type']
  resolve: (result: AppliedDocumentNavigation) => void
}

export function createDocumentNavigator({
  documents,
  workspaceStore,
}: CreateDocumentNavigatorOptions): DocumentNavigator {
  let visibleView: VisibleDocumentView | undefined
  const pending = new Set<PendingNavigation>()

  const appliedResult = (
    navigation: Omit<PendingNavigation, 'resolve'>,
    view: VisibleDocumentView,
  ): AppliedDocumentNavigation => ({
    status: 'applied',
    document: {
      id: navigation.document.id,
      versionId: navigation.document.versionId,
    },
    page: { id: navigation.pageId },
    type: navigation.type,
    fit: 'page',
    zoom: view.zoom,
  })

  const isApplied = (
    navigation: Omit<PendingNavigation, 'resolve'>,
    view: VisibleDocumentView | undefined,
  ) => {
    const state = workspaceStore.getState()
    return Boolean(
      view &&
      view.documentId === navigation.document.id &&
      view.documentVersionId === navigation.document.versionId &&
      view.pageId === navigation.pageId &&
      view.fit === 'page' &&
      view.zoom === 1 &&
      state.selectedLocation.documentId === navigation.document.id &&
      state.selectedLocation.documentVersionId === navigation.document.versionId &&
      state.selectedLocation.pageId === navigation.pageId &&
      state.fitPreference === 'page' &&
      state.zoom === 1
    )
  }

  return {
    async navigate(input) {
      const document = documents.find(
        (candidate) => candidate.id === input.documentId,
      )
      if (!document) {
        throw new Error(
          'The Project Document does not exist in this Project Workspace.',
        )
      }

      const target: DocumentNavigationTarget = input.target ?? {
        type: 'document',
      }
      const rememberedPageId = workspaceStore.getState().lastPageIdByDocument[
        documentKey(document.id, document.versionId)
      ]
      const pageId = target.type === 'page'
        ? target.pageId
        : document.pages.some((page) => page.id === rememberedPageId)
          ? rememberedPageId!
          : document.pages[0]!.id
      if (
        target.type === 'page' &&
        !document.pages.some((page) => page.id === pageId)
      ) {
        throw new Error('The page does not belong to the Project Document.')
      }

      const navigation = { document, pageId, type: target.type }
      if (isApplied(navigation, visibleView)) {
        return appliedResult(navigation, visibleView!)
      }

      const completion = new Promise<AppliedDocumentNavigation>((resolve) => {
        pending.add({ ...navigation, resolve })
      })
      workspaceStore.getState().selectDocument({
        documentId: document.id,
        documentVersionId: document.versionId,
        pageId,
      })
      return completion
    },

    reportVisibleView(view) {
      visibleView = view
      for (const navigation of pending) {
        if (!isApplied(navigation, view)) continue
        pending.delete(navigation)
        navigation.resolve(appliedResult(navigation, view))
      }
    },
  }
}

import type { ProjectDocument } from '../demoProject/demoProject'
import { documentKey } from '../workspace/documentBrowsingState'
import type { createWorkspaceStore } from '../workspace/workspaceStore'

const NAVIGATION_TIMEOUT_MS = 15_000

export type DocumentNavigationTarget =
  | { type: 'document' }
  | { type: 'page'; pageId: string }

export interface NavigateDocumentInput {
  documentId: string
  target?: { type: 'page'; pageId: string }
}

export interface DocumentNavigationExecutionContext {
  signal?: AbortSignal
}

export interface ViewerNavigationRequest {
  id: number
  documentId: string
  documentVersionId: string
  pageId: string
  fit: 'page'
  zoom: 1
}

export interface VisibleDocumentView {
  documentId: string
  documentVersionId: string
  pageId: string
  fit: 'page' | 'width'
  zoom: number
  requestId?: number
}

export interface AppliedDocumentNavigation {
  status: 'applied'
  document: { id: string; versionId: string }
  page: { id: string }
  type: DocumentNavigationTarget['type']
  fit: 'page'
  zoom: number
}

export interface SupersededDocumentNavigation {
  status: 'superseded'
  requestedDocument: { id: string }
  targetType: DocumentNavigationTarget['type']
}

export type DocumentNavigationResult =
  | AppliedDocumentNavigation
  | SupersededDocumentNavigation

export interface DocumentNavigator {
  cancelPending: () => void
  navigate: (
    input: NavigateDocumentInput,
    context?: DocumentNavigationExecutionContext,
  ) => Promise<DocumentNavigationResult>
  reportRenderError: (requestId: number) => void
  reportVisibleView: (view: VisibleDocumentView) => void
  takeHumanControl: () => void
}

interface CreateDocumentNavigatorOptions {
  documents: ProjectDocument[]
  requestViewerNavigation: (request: ViewerNavigationRequest | undefined) => void
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}

interface ResolvedNavigation {
  document: ProjectDocument
  pageId: string
  type: DocumentNavigationTarget['type']
}

interface PendingNavigation extends ResolvedNavigation {
  abort?: { listener: () => void; signal: AbortSignal }
  error?: Error
  phase: 'requested' | 'rollback'
  previousView?: VisibleDocumentView
  reject: (error: Error) => void
  resolve: (result: DocumentNavigationResult) => void
  timeout?: ReturnType<typeof setTimeout>
  viewerRequestId: number
}

export function createDocumentNavigator({
  documents,
  requestViewerNavigation,
  workspaceStore,
}: CreateDocumentNavigatorOptions): DocumentNavigator {
  let nextRequestId = 0
  let pending: PendingNavigation | undefined
  let visibleView: VisibleDocumentView | undefined

  const appliedResult = (
    navigation: ResolvedNavigation,
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

  const supersededResult = (
    navigation: ResolvedNavigation,
  ): SupersededDocumentNavigation => ({
    status: 'superseded',
    requestedDocument: { id: navigation.document.id },
    targetType: navigation.type,
  })

  const matches = (
    navigation: ResolvedNavigation,
    view: VisibleDocumentView | undefined,
  ) => Boolean(
    view &&
    view.documentId === navigation.document.id &&
    view.documentVersionId === navigation.document.versionId &&
    view.pageId === navigation.pageId &&
    view.fit === 'page' &&
    view.zoom === 1
  )

  const stateMatches = (navigation: ResolvedNavigation) => {
    const state = workspaceStore.getState()
    return (
      state.selectedLocation.documentId === navigation.document.id &&
      state.selectedLocation.documentVersionId === navigation.document.versionId &&
      state.selectedLocation.pageId === navigation.pageId &&
      state.fitPreference === 'page' &&
      state.zoom === 1
    )
  }

  const clearResources = (navigation: PendingNavigation) => {
    if (navigation.timeout !== undefined) clearTimeout(navigation.timeout)
    if (navigation.abort) {
      navigation.abort.signal.removeEventListener(
        'abort',
        navigation.abort.listener,
      )
    }
  }

  const finishWithError = (navigation: PendingNavigation, error: Error) => {
    if (pending !== navigation) return
    pending = undefined
    clearResources(navigation)
    requestViewerNavigation(undefined)
    navigation.reject(error)
  }

  const finishSuperseded = (navigation: PendingNavigation) => {
    if (pending !== navigation) return
    pending = undefined
    clearResources(navigation)
    requestViewerNavigation(undefined)
    if (navigation.phase === 'rollback') {
      navigation.reject(navigation.error!)
    } else {
      navigation.resolve(supersededResult(navigation))
    }
  }

  const requestView = (
    navigation: PendingNavigation,
    view: VisibleDocumentView,
  ) => {
    const request: ViewerNavigationRequest = {
      id: ++nextRequestId,
      documentId: view.documentId,
      documentVersionId: view.documentVersionId,
      pageId: view.pageId,
      fit: 'page',
      zoom: 1,
    }
    navigation.viewerRequestId = request.id
    requestViewerNavigation(request)
  }

  const beginRecovery = (navigation: PendingNavigation, error: Error) => {
    if (pending !== navigation || navigation.phase === 'rollback') return
    if (navigation.timeout !== undefined) {
      clearTimeout(navigation.timeout)
      navigation.timeout = undefined
    }
    navigation.error = error
    navigation.phase = 'rollback'
    visibleView = undefined

    const previous = navigation.previousView
    if (!previous) {
      finishWithError(navigation, error)
      return
    }
    const previousDocument = documents.find(
      (candidate) =>
        candidate.id === previous.documentId &&
        candidate.versionId === previous.documentVersionId,
    )
    if (!previousDocument) {
      finishWithError(navigation, error)
      return
    }

    workspaceStore.getState().selectDocument({
      documentId: previous.documentId,
      documentVersionId: previous.documentVersionId,
      pageId: previous.pageId,
    })
    requestView(navigation, previous)
  }

  const resolveInput = (input: NavigateDocumentInput): ResolvedNavigation => {
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
    return { document, pageId, type: target.type }
  }

  return {
    cancelPending() {
      if (pending) finishWithError(
        pending,
        new Error('Document navigation was cancelled.'),
      )
      visibleView = undefined
      requestViewerNavigation(undefined)
    },

    async navigate(input, context) {
      const navigation = resolveInput(input)
      if (matches(navigation, visibleView) && stateMatches(navigation)) {
        return appliedResult(navigation, visibleView!)
      }

      if (pending) finishSuperseded(pending)
      if (context?.signal?.aborted) {
        throw new Error('Document navigation was cancelled.')
      }

      const previousView = visibleView
      visibleView = undefined
      return new Promise<DocumentNavigationResult>((resolve, reject) => {
        const next: PendingNavigation = {
          ...navigation,
          phase: 'requested',
          previousView,
          reject,
          resolve,
          viewerRequestId: 0,
        }
        pending = next
        next.timeout = setTimeout(() => {
          beginRecovery(
            next,
            new Error(
              'Document navigation timed out before the destination became visible.',
            ),
          )
        }, NAVIGATION_TIMEOUT_MS)
        if (context?.signal) {
          const listener = () => {
            beginRecovery(next, new Error('Document navigation was cancelled.'))
          }
          next.abort = { listener, signal: context.signal }
          context.signal.addEventListener('abort', listener, { once: true })
        }

        workspaceStore.getState().selectDocument({
          documentId: navigation.document.id,
          documentVersionId: navigation.document.versionId,
          pageId: navigation.pageId,
        })
        requestView(next, {
          documentId: navigation.document.id,
          documentVersionId: navigation.document.versionId,
          pageId: navigation.pageId,
          fit: 'page',
          zoom: 1,
        })
      })
    },

    reportRenderError(requestId) {
      if (!pending || pending.viewerRequestId !== requestId) return
      if (pending.phase === 'rollback') {
        finishWithError(pending, pending.error!)
        return
      }
      beginRecovery(
        pending,
        new Error('The Project Document page could not be rendered.'),
      )
    },

    reportVisibleView(view) {
      visibleView = view
      const navigation = pending
      if (!navigation || view.requestId !== navigation.viewerRequestId) return
      if (navigation.phase === 'rollback') {
        finishWithError(navigation, navigation.error!)
        return
      }
      if (!matches(navigation, view) || !stateMatches(navigation)) return

      pending = undefined
      clearResources(navigation)
      requestViewerNavigation(undefined)
      navigation.resolve(appliedResult(navigation, view))
    },

    takeHumanControl() {
      if (pending) finishSuperseded(pending)
      visibleView = undefined
      requestViewerNavigation(undefined)
    },
  }
}

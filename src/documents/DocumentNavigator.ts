import type { ProjectDocument } from '../demoProject/demoProject'
import { documentKey } from '../workspace/documentBrowsingState'
import type { createWorkspaceStore } from '../workspace/workspaceStore'
import type { ResolvedCurrentDocumentBlock } from './documents'
import type { DocumentRegion } from './pageGeometry'

const NAVIGATION_TIMEOUT_MS = 15_000

export type DocumentNavigationTarget =
  | { type: 'document' }
  | { type: 'page'; pageId: string }
  | { type: 'block'; blockId: string }
  | { type: 'region'; pageId: string; region: DocumentRegion }

export interface NavigateDocumentInput {
  documentId: string
  target?:
    | { type: 'page'; pageId: string }
    | { type: 'block'; blockId: string }
    | { type: 'region'; pageId: string; region: DocumentRegion }
}

export interface DocumentNavigationExecutionContext {
  signal?: AbortSignal
}

interface ViewerNavigationRequestBase {
  id: number
  documentId: string
  documentVersionId: string
  pageId: string
}

export type ViewerNavigationRequest = ViewerNavigationRequestBase & (
  | { fit: 'page'; zoom: 1 }
  | { fit: 'region'; region: DocumentRegion }
)

export interface VisibleDocumentView {
  documentId: string
  documentVersionId: string
  pageId: string
  fit: 'page' | 'width' | 'region'
  region?: DocumentRegion
  zoom: number
  requestId?: number
}

export interface AppliedDocumentNavigation {
  status: 'applied'
  document: { id: string; versionId: string }
  page: { id: string }
  type: DocumentNavigationTarget['type']
  blockId?: string
  fit: 'page' | 'region'
  region?: DocumentRegion
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
  resolveCurrentBlock: (
    documentId: string,
    blockId: string,
  ) => ResolvedCurrentDocumentBlock
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}

interface ResolvedNavigation {
  document: ProjectDocument
  pageId: string
  blockId?: string
  region?: DocumentRegion
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
  viewerRequest?: ViewerNavigationRequest
  viewerRequestId: number
}

export function createDocumentNavigator({
  documents,
  requestViewerNavigation,
  resolveCurrentBlock,
  workspaceStore,
}: CreateDocumentNavigatorOptions): DocumentNavigator {
  let nextRequestId = 0
  let activeFocusRequest: ViewerNavigationRequest | undefined
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
    ...(navigation.blockId ? { blockId: navigation.blockId } : {}),
    fit: navigation.region ? 'region' : 'page',
    zoom: view.zoom,
    ...(navigation.region ? { region: navigation.region } : {}),
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
    view.fit === (navigation.region ? 'region' : 'page') &&
    (navigation.region
      ? regionsEqual(view.region, navigation.region)
      : view.zoom === 1)
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
    requestViewerNavigation(activeFocusRequest)
    navigation.reject(error)
  }

  const finishSuperseded = (navigation: PendingNavigation) => {
    if (pending !== navigation) return
    pending = undefined
    clearResources(navigation)
    activeFocusRequest = undefined
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
    const requestBase: ViewerNavigationRequestBase = {
      id: ++nextRequestId,
      documentId: view.documentId,
      documentVersionId: view.documentVersionId,
      pageId: view.pageId,
    }
    const request: ViewerNavigationRequest =
      view.fit === 'region' && view.region
        ? { ...requestBase, fit: 'region', region: view.region }
        : { ...requestBase, fit: 'page', zoom: 1 }
    navigation.viewerRequestId = request.id
    navigation.viewerRequest = request
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
    if (target.type === 'block') {
      const resolved = resolveCurrentBlock(document.id, target.blockId)
      validateRegion(resolved.block.region)
      return {
        document,
        pageId: resolved.page.id,
        blockId: target.blockId,
        region: resolved.block.region,
        type: target.type,
      }
    }
    const rememberedPageId = workspaceStore.getState().lastPageIdByDocument[
      documentKey(document.id, document.versionId)
    ]
    if (target.type === 'region') validateRegion(target.region)
    const pageId = target.type === 'page' || target.type === 'region'
      ? target.pageId
      : document.pages.some((page) => page.id === rememberedPageId)
        ? rememberedPageId!
        : document.pages[0]!.id
    if (
      (target.type === 'page' || target.type === 'region') &&
      !document.pages.some((page) => page.id === pageId)
    ) {
      throw new Error('The page does not belong to the Project Document.')
    }
    return {
      document,
      pageId,
      type: target.type,
      ...(target.type === 'region' ? { region: target.region } : {}),
    }
  }

  return {
    cancelPending() {
      if (pending) finishWithError(
        pending,
        new Error('Document navigation was cancelled.'),
      )
      visibleView = undefined
      activeFocusRequest = undefined
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
      activeFocusRequest = undefined
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
          fit: navigation.region ? 'region' : 'page',
          ...(navigation.region ? { region: navigation.region } : {}),
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
        activeFocusRequest = view.fit === 'region'
          ? navigation.viewerRequest
          : undefined
        finishWithError(navigation, navigation.error!)
        return
      }
      if (!matches(navigation, view) || !stateMatches(navigation)) return

      pending = undefined
      clearResources(navigation)
      activeFocusRequest = navigation.region
        ? navigation.viewerRequest
        : undefined
      requestViewerNavigation(activeFocusRequest)
      navigation.resolve(appliedResult(navigation, view))
    },

    takeHumanControl() {
      const focusedView = visibleView?.fit === 'region' ? visibleView : undefined
      if (pending) finishSuperseded(pending)
      if (focusedView) {
        workspaceStore.getState().setFitPreference('page')
        workspaceStore.getState().setZoom(focusedView.zoom)
      }
      visibleView = undefined
      activeFocusRequest = undefined
      requestViewerNavigation(undefined)
    },
  }
}

function regionsEqual(
  left: DocumentRegion | undefined,
  right: DocumentRegion | undefined,
) {
  return Boolean(
    left &&
    right &&
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height,
  )
}

function validateRegion(region: DocumentRegion) {
  const values = [region.left, region.top, region.width, region.height]
  if (
    values.some((value) => !Number.isFinite(value)) ||
    region.left < 0 ||
    region.left > 1 ||
    region.top < 0 ||
    region.top > 1 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.left + region.width > 1 ||
    region.top + region.height > 1
  ) {
    throw new Error(
      'The Document Region must be a finite, positive normalized rectangle contained within the page.',
    )
  }
}

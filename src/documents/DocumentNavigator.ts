import type { ProjectDocument } from '../demoProject/demoProject'
import {
  captureDocumentBrowsingSnapshot,
  documentKey,
  type DocumentBrowsingSnapshot,
  type DocumentFitPreference,
  type DocumentLocation,
  type DocumentSelection,
} from '../workspace/documentBrowsingState'
import type { createWorkspaceStore } from '../workspace/workspaceStore'
import type { ResolvedCurrentDocumentBlock } from './documents'
import type { DocumentRegion } from './pageGeometry'

const NAVIGATION_TIMEOUT_MS = 15_000

export type ExplicitDocumentDestination =
  | { type: 'page'; pageId: string }
  | { type: 'block'; blockId: string }
  | { type: 'region'; pageId: string; region: DocumentRegion }

export type DocumentDestination =
  | { type: 'document' }
  | ExplicitDocumentDestination

export interface NavigateDocumentInput {
  documentId: string
  target?: ExplicitDocumentDestination
}

export interface DocumentNavigationExecutionContext {
  signal?: AbortSignal
}

interface DocumentDestinationRequestBase extends DocumentLocation {
  id: number
}

export type DocumentDestinationRequest = DocumentDestinationRequestBase & (
  | { fit: DocumentFitPreference; zoom: number }
  | {
      fit: 'region'
      region: DocumentRegion
      showFocusOutline?: boolean
    }
)

export type VisibleDocumentDestination = DocumentLocation & {
  zoom: number
  requestId?: number
} & (
  | { fit: DocumentFitPreference; region?: never }
  | { fit: 'region'; region: DocumentRegion }
)

export interface AppliedDocumentNavigation {
  status: 'applied'
  document: { id: string; versionId: string }
  page: { id: string }
  type: DocumentDestination['type']
  blockId?: string
  fit: 'page' | 'region'
  region?: DocumentRegion
  zoom: number
}

export interface SupersededDocumentNavigation {
  status: 'superseded'
  requestedDocument: { id: string }
  targetType: DocumentDestination['type']
}

export type DocumentNavigationResult =
  | AppliedDocumentNavigation
  | SupersededDocumentNavigation

export interface DocumentNavigator {
  cancelPending: () => void
  dismissDocumentFocusOutline: () => void
  navigate: (
    input: NavigateDocumentInput,
    context?: DocumentNavigationExecutionContext,
  ) => Promise<DocumentNavigationResult>
  reportRenderError: (requestId: number) => void
  reportVisibleDestination: (view: VisibleDocumentDestination) => void
  seniorProjectManager: SeniorProjectManagerDocumentBrowsing
  takeSeniorProjectManagerControl: () => void
}

export interface SeniorProjectManagerDocumentBrowsing {
  selectDocument: (selection: DocumentSelection) => void
  selectPage: (pageId: string) => void
  setFitPreference: (fit: DocumentFitPreference) => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
}

interface CreateDocumentNavigatorOptions {
  documents: ProjectDocument[]
  requestDocumentDestination: (
    request: DocumentDestinationRequest | undefined,
  ) => void
  resolveCurrentBlock: (
    documentId: string,
    blockId: string,
  ) => ResolvedCurrentDocumentBlock
  workspaceStore: ReturnType<typeof createWorkspaceStore>
}

interface ResolvedDocumentDestination {
  document: ProjectDocument
  location: DocumentLocation
  blockId?: string
  region?: DocumentRegion
  type: DocumentDestination['type']
}

interface PendingExternalAgentNavigation extends ResolvedDocumentDestination {
  abort?: { listener: () => void; signal: AbortSignal }
  error?: Error
  focusOutlineDismissed: boolean
  phase: 'requested' | 'rollback'
  previousBrowsing: DocumentBrowsingSnapshot
  previousDocumentFocusOutlineVisible: boolean
  previousVisibleDestination?: VisibleDocumentDestination
  reject: (error: Error) => void
  resolve: (result: DocumentNavigationResult) => void
  timeout?: ReturnType<typeof setTimeout>
  destinationRequest?: DocumentDestinationRequest
  destinationRequestId: number
}

export function createDocumentNavigator({
  documents,
  requestDocumentDestination,
  resolveCurrentBlock,
  workspaceStore,
}: CreateDocumentNavigatorOptions): DocumentNavigator {
  let nextRequestId = 0
  let activeDocumentFocus: DocumentDestinationRequest | undefined
  let documentFocusOutlineVisible = false
  let pending: PendingExternalAgentNavigation | undefined
  let visibleDestination: VisibleDocumentDestination | undefined

  const appliedResult = (
    destination: ResolvedDocumentDestination,
    view: VisibleDocumentDestination,
  ): AppliedDocumentNavigation => ({
    status: 'applied',
    document: {
      id: destination.document.id,
      versionId: destination.document.versionId,
    },
    page: { id: destination.location.pageId },
    type: destination.type,
    ...(destination.blockId ? { blockId: destination.blockId } : {}),
    fit: destination.region ? 'region' : 'page',
    zoom: view.zoom,
    ...(destination.region ? { region: destination.region } : {}),
  })

  const supersededResult = (
    destination: ResolvedDocumentDestination,
  ): SupersededDocumentNavigation => ({
    status: 'superseded',
    requestedDocument: { id: destination.document.id },
    targetType: destination.type,
  })

  const matches = (
    destination: ResolvedDocumentDestination,
    view: VisibleDocumentDestination | undefined,
  ) => Boolean(
    view &&
    sameDocumentLocation(view, destination.location) &&
    view.fit === (destination.region ? 'region' : 'page') &&
    (destination.region
      ? regionsEqual(view.region, destination.region)
      : view.zoom === 1)
  )

  const stateMatches = (destination: ResolvedDocumentDestination) => {
    const state = workspaceStore.getState()
    return (
      sameDocumentLocation(state.selectedLocation, destination.location) &&
      state.fitPreference === 'page' &&
      state.zoom === 1
    )
  }

  const clearResources = (navigation: PendingExternalAgentNavigation) => {
    if (navigation.timeout !== undefined) clearTimeout(navigation.timeout)
    if (navigation.abort) {
      navigation.abort.signal.removeEventListener(
        'abort',
        navigation.abort.listener,
      )
    }
  }

  const finishWithError = (
    navigation: PendingExternalAgentNavigation,
    error: Error,
  ) => {
    if (pending !== navigation) return
    pending = undefined
    clearResources(navigation)
    documentFocusOutlineVisible =
      navigation.previousDocumentFocusOutlineVisible &&
      !navigation.focusOutlineDismissed
    requestDocumentDestination(activeDocumentFocus)
    navigation.reject(error)
  }

  const finishSuperseded = (navigation: PendingExternalAgentNavigation) => {
    if (pending !== navigation) return
    pending = undefined
    clearResources(navigation)
    activeDocumentFocus = undefined
    documentFocusOutlineVisible = false
    requestDocumentDestination(undefined)
    if (navigation.phase === 'rollback') {
      navigation.reject(navigation.error!)
    } else {
      navigation.resolve(supersededResult(navigation))
    }
  }

  const requestView = (
    navigation: PendingExternalAgentNavigation,
    view: VisibleDocumentDestination,
    showFocusOutline = true,
  ) => {
    const requestBase: DocumentDestinationRequestBase = {
      id: ++nextRequestId,
      documentId: view.documentId,
      documentVersionId: view.documentVersionId,
      pageId: view.pageId,
    }
    const request: DocumentDestinationRequest =
      view.fit === 'region'
        ? {
            ...requestBase,
            fit: 'region',
            region: view.region,
            showFocusOutline,
          }
        : { ...requestBase, fit: view.fit, zoom: view.zoom }
    navigation.destinationRequestId = request.id
    navigation.destinationRequest = request
    requestDocumentDestination(request)
  }

  const beginRecovery = (
    navigation: PendingExternalAgentNavigation,
    error: Error,
  ) => {
    if (pending !== navigation || navigation.phase === 'rollback') return
    if (navigation.timeout !== undefined) {
      clearTimeout(navigation.timeout)
      navigation.timeout = undefined
    }
    navigation.error = error
    navigation.phase = 'rollback'
    visibleDestination = undefined

    workspaceStore.getState().restoreDocumentBrowsing(
      navigation.previousBrowsing,
    )

    const previous = navigation.previousVisibleDestination
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

    requestView(
      navigation,
      previous,
      navigation.previousDocumentFocusOutlineVisible,
    )
  }

  const resolveInput = (
    input: NavigateDocumentInput,
    browsing: DocumentBrowsingSnapshot,
  ): ResolvedDocumentDestination => {
    const document = documents.find(
      (candidate) => candidate.id === input.documentId,
    )
    if (!document) {
      throw new Error(
        'The Project Document does not exist in this Project Workspace.',
      )
    }

    const destination: DocumentDestination = input.target ?? {
      type: 'document',
    }
    if (destination.type === 'block') {
      const resolved = resolveCurrentBlock(document.id, destination.blockId)
      validateRegion(resolved.block.region)
      return {
        document,
        location: documentLocation(document, resolved.page.id),
        blockId: destination.blockId,
        region: resolved.block.region,
        type: destination.type,
      }
    }
    const rememberedPageId = browsing.lastPageIdByDocument[
      documentKey(document.id, document.versionId)
    ]
    if (destination.type === 'region') validateRegion(destination.region)
    const pageId = destination.type === 'page' || destination.type === 'region'
      ? destination.pageId
      : document.pages.some((page) => page.id === rememberedPageId)
        ? rememberedPageId!
        : document.pages[0]!.id
    if (
      (destination.type === 'page' || destination.type === 'region') &&
      !document.pages.some((page) => page.id === pageId)
    ) {
      throw new Error('The page does not belong to the Project Document.')
    }
    return {
      document,
      location: documentLocation(document, pageId),
      type: destination.type,
      ...(destination.type === 'region' ? { region: destination.region } : {}),
    }
  }

  const takeSeniorProjectManagerControl = () => {
    const documentFocus = visibleDestination?.fit === 'region'
      ? visibleDestination
      : undefined
    if (pending) finishSuperseded(pending)
    if (documentFocus) {
      workspaceStore.getState().setFitPreference('page')
      workspaceStore.getState().setZoom(documentFocus.zoom)
    }
    visibleDestination = undefined
    activeDocumentFocus = undefined
    documentFocusOutlineVisible = false
    requestDocumentDestination(undefined)
  }

  const seniorProjectManager: SeniorProjectManagerDocumentBrowsing = {
    selectDocument(selection) {
      takeSeniorProjectManagerControl()
      workspaceStore.getState().selectDocument(selection)
    },
    selectPage(pageId) {
      takeSeniorProjectManagerControl()
      workspaceStore.getState().selectPage(pageId)
    },
    setFitPreference(fit) {
      takeSeniorProjectManagerControl()
      workspaceStore.getState().setFitPreference(fit)
    },
    setZoom(zoom) {
      takeSeniorProjectManagerControl()
      workspaceStore.getState().setZoom(zoom)
    },
    zoomIn() {
      takeSeniorProjectManagerControl()
      workspaceStore.getState().zoomIn()
    },
    zoomOut() {
      takeSeniorProjectManagerControl()
      workspaceStore.getState().zoomOut()
    },
  }

  return {
    cancelPending() {
      if (pending) finishWithError(
        pending,
        new Error('Document navigation was cancelled.'),
      )
      visibleDestination = undefined
      activeDocumentFocus = undefined
      documentFocusOutlineVisible = false
      requestDocumentDestination(undefined)
    },

    dismissDocumentFocusOutline() {
      documentFocusOutlineVisible = false
      if (pending) pending.focusOutlineDismissed = true
    },

    async navigate(input, context) {
      const previousBrowsing = pending?.previousBrowsing ??
        captureDocumentBrowsingSnapshot(workspaceStore.getState())
      const previousVisibleDestination =
        pending?.previousVisibleDestination ?? visibleDestination
      const previousDocumentFocusOutlineVisible =
        pending?.previousDocumentFocusOutlineVisible ??
        documentFocusOutlineVisible
      const destination = resolveInput(input, previousBrowsing)
      if (
        !pending &&
        matches(destination, visibleDestination) &&
        stateMatches(destination) &&
        (!destination.region || documentFocusOutlineVisible)
      ) {
        return appliedResult(destination, visibleDestination!)
      }

      if (pending) finishSuperseded(pending)
      if (context?.signal?.aborted) {
        throw new Error('Document navigation was cancelled.')
      }

      visibleDestination = undefined
      activeDocumentFocus = undefined
      documentFocusOutlineVisible = false
      return new Promise<DocumentNavigationResult>((resolve, reject) => {
        const next: PendingExternalAgentNavigation = {
          ...destination,
          destinationRequestId: 0,
          focusOutlineDismissed: false,
          phase: 'requested',
          previousBrowsing,
          previousDocumentFocusOutlineVisible,
          previousVisibleDestination,
          reject,
          resolve,
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
          documentId: destination.location.documentId,
          documentVersionId: destination.location.documentVersionId,
          pageId: destination.location.pageId,
        })
        requestView(
          next,
          destination.region
            ? {
                ...destination.location,
                fit: 'region',
                region: destination.region,
                zoom: 1,
              }
            : { ...destination.location, fit: 'page', zoom: 1 },
        )
      })
    },

    reportRenderError(requestId) {
      if (!pending || pending.destinationRequestId !== requestId) return
      if (pending.phase === 'rollback') {
        finishWithError(pending, pending.error!)
        return
      }
      beginRecovery(
        pending,
        new Error('The Project Document page could not be rendered.'),
      )
    },

    reportVisibleDestination(view) {
      if (
        view.requestId !== undefined &&
        view.requestId !== pending?.destinationRequestId &&
        view.requestId !== activeDocumentFocus?.id
      ) return
      visibleDestination = view
      const navigation = pending
      if (!navigation || view.requestId !== navigation.destinationRequestId) {
        return
      }
      if (navigation.phase === 'rollback') {
        activeDocumentFocus = view.fit === 'region'
          ? navigation.destinationRequest
          : undefined
        documentFocusOutlineVisible =
          navigation.previousDocumentFocusOutlineVisible &&
          !navigation.focusOutlineDismissed
        finishWithError(navigation, navigation.error!)
        return
      }
      if (!matches(navigation, view) || !stateMatches(navigation)) return

      pending = undefined
      clearResources(navigation)
      activeDocumentFocus = navigation.region
        ? navigation.destinationRequest
        : undefined
      documentFocusOutlineVisible = Boolean(navigation.region) &&
        !navigation.focusOutlineDismissed
      requestDocumentDestination(activeDocumentFocus)
      navigation.resolve(appliedResult(navigation, view))
    },

    seniorProjectManager,
    takeSeniorProjectManagerControl,
  }
}

function documentLocation(
  document: ProjectDocument,
  pageId: string,
): DocumentLocation {
  return {
    documentId: document.id,
    documentVersionId: document.versionId,
    pageId,
  }
}

function sameDocumentLocation(
  left: DocumentLocation,
  right: DocumentLocation,
) {
  return left.documentId === right.documentId &&
    left.documentVersionId === right.documentVersionId &&
    left.pageId === right.pageId
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

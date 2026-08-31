export interface PageSize {
  width: number
  height: number
}

export interface PageBounds extends PageSize {
  left: number
  top: number
}

export interface NormalizedPoint {
  x: number
  y: number
}

export interface PageOffset {
  x: number
  y: number
}

export interface PageViewportInsets {
  bottom?: number
  right?: number
}

export type PageFit = 'page' | 'width'

export const MIN_DOCUMENT_ZOOM = 0.25
export const MAX_DOCUMENT_ZOOM = 4

export function clampDocumentZoom(zoom: number) {
  return Math.min(MAX_DOCUMENT_ZOOM, Math.max(MIN_DOCUMENT_ZOOM, zoom))
}

function clampNormalized(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function fitPageInBounds(
  page: PageSize,
  bounds: PageSize,
  zoom: number,
  fit: PageFit = 'page',
): PageSize {
  if (page.width <= 0 || page.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return { width: 0, height: 0 }
  }

  const fitScale = fit === 'width'
    ? bounds.width / page.width
    : Math.min(bounds.width / page.width, bounds.height / page.height)
  return {
    width: page.width * fitScale * zoom,
    height: page.height * fitScale * zoom,
  }
}

export function centerPageOffset(
  page: PageSize,
  viewport: PageSize,
): PageOffset {
  return clampPageOffset({
    page,
    viewport,
    offset: {
      x: (viewport.width - page.width) / 2,
      y: (viewport.height - page.height) / 2,
    },
  })
}

export function clampPageOffset({
  insets = {},
  page,
  viewport,
  offset,
}: {
  insets?: PageViewportInsets
  page: PageSize
  viewport: PageSize
  offset: PageOffset
}): PageOffset {
  return {
    x: clampAxisOffset(page.width, viewport.width, offset.x, insets.right),
    y: clampAxisOffset(page.height, viewport.height, offset.y, insets.bottom),
  }
}

export function zoomPageAroundPoint({
  currentPage,
  insets,
  nextPage,
  offset,
  pointer,
  viewport,
}: {
  currentPage: PageSize
  insets?: PageViewportInsets
  nextPage: PageSize
  offset: PageOffset
  pointer: PageOffset
  viewport: PageSize
}): PageOffset {
  if (currentPage.width <= 0 || currentPage.height <= 0) {
    return centerPageOffset(nextPage, viewport)
  }

  const pagePoint = {
    x: (pointer.x - offset.x) / currentPage.width,
    y: (pointer.y - offset.y) / currentPage.height,
  }
  return clampPageOffset({
    insets,
    page: nextPage,
    viewport,
    offset: {
      x: pointer.x - pagePoint.x * nextPage.width,
      y: pointer.y - pagePoint.y * nextPage.height,
    },
  })
}

export function normalizeClientPoint({
  clientX,
  clientY,
  bounds,
}: {
  clientX: number
  clientY: number
  bounds: PageBounds
}): NormalizedPoint {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: clampNormalized((clientX - bounds.left) / bounds.width),
    y: clampNormalized((clientY - bounds.top) / bounds.height),
  }
}

function clampAxisOffset(
  pageLength: number,
  viewportLength: number,
  offset: number,
  endInset = 0,
) {
  if (pageLength <= viewportLength) return (viewportLength - pageLength) / 2
  return Math.min(0, Math.max(viewportLength - endInset - pageLength, offset))
}

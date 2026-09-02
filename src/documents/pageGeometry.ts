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

export interface DocumentRegion {
  left: number
  top: number
  width: number
  height: number
}

export interface RegionFocusGeometry {
  offset: PageOffset
  page: PageSize
  zoom: number
}

export type PageFit = 'page' | 'width'

export const MIN_DOCUMENT_ZOOM = 0.25
export const MAX_DOCUMENT_ZOOM = 4
export const DOCUMENT_FOCUS_EDGE_RESERVE = 0.1

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

export function fitRegionInBounds({
  insets = {},
  page,
  region,
  viewport,
}: {
  insets?: PageViewportInsets
  page: PageSize
  region: DocumentRegion
  viewport: PageSize
}): RegionFocusGeometry {
  const ordinaryPage = fitPageInBounds(page, viewport, 1, 'page')
  const ordinaryScale = page.width > 0 ? ordinaryPage.width / page.width : 0
  const usableWidth = Math.max(
    0,
    viewport.width - Math.max(0, insets.right ?? 0),
  )
  const usableHeight = Math.max(
    0,
    viewport.height - Math.max(0, insets.bottom ?? 0),
  )
  if (
    ordinaryScale <= 0 ||
    usableWidth <= 0 ||
    usableHeight <= 0 ||
    region.width <= 0 ||
    region.height <= 0
  ) {
    return { offset: { x: 0, y: 0 }, page: ordinaryPage, zoom: 1 }
  }

  const contentWidth = usableWidth * (1 - DOCUMENT_FOCUS_EDGE_RESERVE * 2)
  const contentHeight = usableHeight * (1 - DOCUMENT_FOCUS_EDGE_RESERVE * 2)
  const absoluteScale = Math.min(
    contentWidth / (page.width * region.width),
    contentHeight / (page.height * region.height),
  )
  const zoom = clampDocumentZoom(absoluteScale / ordinaryScale)
  const focusedPage = {
    width: page.width * ordinaryScale * zoom,
    height: page.height * ordinaryScale * zoom,
  }
  const padding = {
    x: usableWidth * DOCUMENT_FOCUS_EDGE_RESERVE,
    y: usableHeight * DOCUMENT_FOCUS_EDGE_RESERVE,
  }

  return {
    zoom,
    page: focusedPage,
    offset: {
      x: focusAxisOffset({
        contentEnd: usableWidth - padding.x,
        contentStart: padding.x,
        regionEnd: (region.left + region.width) * focusedPage.width,
        regionStart: region.left * focusedPage.width,
      }),
      y: focusAxisOffset({
        contentEnd: usableHeight - padding.y,
        contentStart: padding.y,
        regionEnd: (region.top + region.height) * focusedPage.height,
        regionStart: region.top * focusedPage.height,
      }),
    },
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

function focusAxisOffset({
  contentEnd,
  contentStart,
  regionEnd,
  regionStart,
}: {
  contentEnd: number
  contentStart: number
  regionEnd: number
  regionStart: number
}) {
  const centered = (contentStart + contentEnd - regionStart - regionEnd) / 2
  const minimum = contentEnd - regionEnd
  const maximum = contentStart - regionStart
  if (minimum > maximum) return centered
  return Math.min(maximum, Math.max(minimum, centered))
}

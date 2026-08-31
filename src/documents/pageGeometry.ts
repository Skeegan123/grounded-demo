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

function clampNormalized(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function fitPageInBounds(
  page: PageSize,
  bounds: PageSize,
  zoom: number,
): PageSize {
  if (page.width <= 0 || page.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return { width: 0, height: 0 }
  }

  const fitScale = Math.min(
    bounds.width / page.width,
    bounds.height / page.height,
  )
  return {
    width: page.width * fitScale * zoom,
    height: page.height * fitScale * zoom,
  }
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

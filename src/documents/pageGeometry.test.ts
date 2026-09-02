import { expect, test } from 'vitest'
import {
  DOCUMENT_FOCUS_EDGE_RESERVE,
  centerPageOffset,
  clampPageOffset,
  fitPageInBounds,
  fitRegionInBounds,
  normalizeClientPoint,
  zoomPageAroundPoint,
} from './pageGeometry'
import type { DocumentRegion, RegionFocusGeometry } from './pageGeometry'

test('normalized page points survive corners, scaling, and the fixture rotation geometry', () => {
  const fixturePage = {
    width: 1224,
    height: 792,
    rotation: 270,
  }
  const fitted = fitPageInBounds(fixturePage, {
    width: 612,
    height: 500,
  }, 1)

  expect(fitted).toEqual({ width: 612, height: 396 })
  expect(normalizeClientPoint({
    clientX: 10,
    clientY: 20,
    bounds: { left: 10, top: 20, width: 612, height: 396 },
  })).toEqual({ x: 0, y: 0 })
  expect(normalizeClientPoint({
    clientX: 622,
    clientY: 416,
    bounds: { left: 10, top: 20, width: 612, height: 396 },
  })).toEqual({ x: 1, y: 1 })

  const center = normalizeClientPoint({
    clientX: 316,
    clientY: 218,
    bounds: { left: 10, top: 20, width: 612, height: 396 },
  })
  expect(center).toEqual({ x: 0.5, y: 0.5 })
  expect(normalizeClientPoint({
    clientX: 469,
    clientY: 307,
    bounds: { left: 10, top: 10, width: 918, height: 594 },
  })).toEqual(center)
})

test('Fit page and Fit width return predictable drawing bounds', () => {
  const page = { width: 1200, height: 800 }
  const viewport = { width: 600, height: 300 }

  expect(fitPageInBounds(page, viewport, 1, 'page')).toEqual({
    width: 450,
    height: 300,
  })
  expect(fitPageInBounds(page, viewport, 1, 'width')).toEqual({
    width: 600,
    height: 400,
  })
  expect(fitPageInBounds(page, viewport, 4, 'page')).toEqual({
    width: 1800,
    height: 1200,
  })
})

test('page offsets expose every edge while centering smaller drawings', () => {
  const viewport = { width: 800, height: 600 }

  expect(centerPageOffset({ width: 400, height: 300 }, viewport)).toEqual({
    x: 200,
    y: 150,
  })
  expect(clampPageOffset({
    page: { width: 1600, height: 1200 },
    viewport,
    offset: { x: 200, y: 100 },
  })).toEqual({ x: 0, y: 0 })
  expect(clampPageOffset({
    page: { width: 1600, height: 1200 },
    viewport,
    offset: { x: -1200, y: -900 },
  })).toEqual({ x: -800, y: -600 })
})

test('pointer-centered zoom preserves the page coordinate under the pointer', () => {
  expect(zoomPageAroundPoint({
    currentPage: { width: 800, height: 400 },
    nextPage: { width: 1600, height: 800 },
    offset: { x: 0, y: 100 },
    pointer: { x: 200, y: 300 },
    viewport: { width: 800, height: 600 },
  })).toEqual({ x: -200, y: -100 })
})

test.each([
  {
    name: 'landscape region capped at 400 percent',
    page: { width: 1000, height: 500 },
    region: { left: 0.4, top: 0.4, width: 0.2, height: 0.2 },
    viewport: { width: 1000, height: 800 },
    expectedZoom: 4,
  },
  {
    name: 'portrait region contained by height',
    page: { width: 500, height: 1000 },
    region: { left: 0.4, top: 0.3, width: 0.2, height: 0.4 },
    viewport: { width: 800, height: 800 },
    expectedZoom: 2,
  },
  {
    name: 'complete page with exact reserve',
    page: { width: 1000, height: 1000 },
    region: { left: 0, top: 0, width: 1, height: 1 },
    viewport: { width: 1000, height: 1000 },
    expectedZoom: 0.8,
  },
])('$name', ({ expectedZoom, page, region, viewport }) => {
  const geometry = fitRegionInBounds({ page, region, viewport })
  const bounds = focusedRegionBounds(geometry, region)

  expect(geometry.zoom).toBeCloseTo(expectedZoom, 10)
  expectContainedWithReserve(bounds, viewport)
  expect(bounds.left + bounds.width / 2).toBeCloseTo(viewport.width / 2, 10)
  expect(bounds.top + bounds.height / 2).toBeCloseTo(viewport.height / 2, 10)
})

test.each([
  ['top-left', { left: 0, top: 0, width: 0.2, height: 0.2 }, { x: 100, y: 100 }],
  ['top-right', { left: 0.8, top: 0, width: 0.2, height: 0.2 }, { x: 100, y: 100 }],
  ['bottom-left', { left: 0, top: 0.8, width: 0.2, height: 0.2 }, { x: 100, y: 100 }],
  ['bottom-right', { left: 0.8, top: 0.8, width: 0.2, height: 0.2 }, { x: 100, y: 100 }],
] as const)('edge clamping keeps a %s region padded', (_name, region, padding) => {
  const viewport = { width: 1000, height: 1000 }
  const geometry = fitRegionInBounds({
    page: { width: 1000, height: 1000 },
    region,
    viewport,
  })

  expect(geometry.zoom).toBe(4)
  expectContainedWithReserve(focusedRegionBounds(geometry, region), viewport)
  if (region.left === 0) expect(geometry.offset.x).toBeCloseTo(padding.x, 10)
  if (region.top === 0) expect(geometry.offset.y).toBeCloseTo(padding.y, 10)
})

test('resizing recalculates zoom and offset from the same normalized region', () => {
  const region = { left: 0.55, top: 0.2, width: 0.3, height: 0.25 }
  const page = { width: 1200, height: 800 }
  const firstViewport = { width: 900, height: 600 }
  const resizedViewport = { width: 600, height: 900 }
  const first = fitRegionInBounds({ page, region, viewport: firstViewport })
  const resized = fitRegionInBounds({ page, region, viewport: resizedViewport })

  expect(first).not.toEqual(resized)
  expectContainedWithReserve(focusedRegionBounds(first, region), firstViewport)
  expectContainedWithReserve(
    focusedRegionBounds(resized, region),
    resizedViewport,
  )
})

function focusedRegionBounds(
  geometry: RegionFocusGeometry,
  region: DocumentRegion,
) {
  return {
    left: geometry.offset.x + geometry.page.width * region.left,
    top: geometry.offset.y + geometry.page.height * region.top,
    width: geometry.page.width * region.width,
    height: geometry.page.height * region.height,
  }
}

function expectContainedWithReserve(
  bounds: ReturnType<typeof focusedRegionBounds>,
  viewport: { width: number; height: number },
) {
  expect(bounds.left).toBeGreaterThanOrEqual(
    viewport.width * DOCUMENT_FOCUS_EDGE_RESERVE - 1e-9,
  )
  expect(bounds.top).toBeGreaterThanOrEqual(
    viewport.height * DOCUMENT_FOCUS_EDGE_RESERVE - 1e-9,
  )
  expect(bounds.left + bounds.width).toBeLessThanOrEqual(
    viewport.width * (1 - DOCUMENT_FOCUS_EDGE_RESERVE) + 1e-9,
  )
  expect(bounds.top + bounds.height).toBeLessThanOrEqual(
    viewport.height * (1 - DOCUMENT_FOCUS_EDGE_RESERVE) + 1e-9,
  )
}

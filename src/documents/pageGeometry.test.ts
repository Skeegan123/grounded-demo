import { expect, test } from 'vitest'
import {
  centerPageOffset,
  clampPageOffset,
  fitPageInBounds,
  normalizeClientPoint,
  zoomPageAroundPoint,
} from './pageGeometry'

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

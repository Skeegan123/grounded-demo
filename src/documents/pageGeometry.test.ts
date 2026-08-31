import { expect, test } from 'vitest'
import {
  fitPageInBounds,
  normalizeClientPoint,
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

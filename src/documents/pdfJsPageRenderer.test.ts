import { expect, test, vi } from 'vitest'
import { createPdfJsPageRenderer } from './pdfJsPageRenderer'

test('the PDF.js renderer preserves crop and rotation viewport geometry and cancels stale work', async () => {
  let rejectRender: (error: Error) => void = () => {}
  const cancel = vi.fn(() => rejectRender(new Error('Rendering cancelled.')))
  const render = vi.fn(() => ({
    cancel,
    promise: new Promise<void>((_resolve, reject) => {
      rejectRender = reject
    }),
  }))
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: 1224 * scale,
    height: 792 * scale,
    rotation: 270,
    viewBox: [24, 36, 816, 1260],
  }))
  const getPage = vi.fn(async () => ({ getViewport, render }))
  const renderer = createPdfJsPageRenderer({
    loadDocument: async () => ({ getPage }),
    outputScale: () => 2,
  })
  const canvas = document.createElement('canvas')
  const context = {} as CanvasRenderingContext2D
  vi.spyOn(canvas, 'getContext').mockReturnValue(context)
  const controller = new AbortController()

  const rendering = renderer.renderPage({
    canvas,
    height: 396,
    pageNumber: 6,
    signal: controller.signal,
    url: '/demo-project/virginia-farmhouse-drawing-set.pdf',
    width: 612,
  })
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce())

  expect({
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    getPage: getPage.mock.calls,
    getViewport: getViewport.mock.calls,
    render: render.mock.calls,
  }).toEqual({
    canvasHeight: 792,
    canvasWidth: 1224,
    getPage: [[6]],
    getViewport: [[{ scale: 1 }], [{ scale: 0.5 }]],
    render: [[{
      canvas,
      canvasContext: context,
      transform: [2, 0, 0, 2, 0, 0],
      viewport: {
        width: 612,
        height: 396,
        rotation: 270,
        viewBox: [24, 36, 816, 1260],
      },
    }]],
  })

  controller.abort()
  await expect(rendering).rejects.toThrow('Rendering cancelled.')
  expect(cancel).toHaveBeenCalledOnce()
})

test('the PDF.js renderer caps extreme backing canvases without changing page geometry', async () => {
  const render = vi.fn((_options: { transform: number[] | undefined }) => ({
    cancel: vi.fn(),
    promise: Promise.resolve(),
  }))
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: 5_000 * scale,
    height: 3_000 * scale,
  }))
  const renderer = createPdfJsPageRenderer({
    loadDocument: async () => ({
      getPage: async () => ({ getViewport, render }),
    }),
    outputScale: () => 3,
  })
  const canvas = document.createElement('canvas')
  const context = {} as CanvasRenderingContext2D
  vi.spyOn(canvas, 'getContext').mockReturnValue(context)

  await renderer.renderPage({
    canvas,
    height: 3_000,
    pageNumber: 1,
    signal: new AbortController().signal,
    url: '/extreme.pdf',
    width: 5_000,
  })

  const transform = render.mock.calls[0]![0].transform
  const effectiveScale = transform?.[0]
  expect(effectiveScale).toBeCloseTo(Math.sqrt(12_000_000 / 15_000_000), 10)
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(12_000_000)
  expect(canvas.width / canvas.height).toBeCloseTo(5 / 3, 3)
  expect(render).toHaveBeenCalledWith({
    canvas,
    canvasContext: context,
    transform: [
      effectiveScale,
      0,
      0,
      effectiveScale,
      0,
      0,
    ],
    viewport: { width: 5_000, height: 3_000 },
  })
})

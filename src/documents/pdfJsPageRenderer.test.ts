import { expect, test, vi } from 'vitest'
import { createPdfJsPageRenderer } from './pdfJsPageRenderer'

test('the PDF.js renderer scales the canvas and cancels an aborted render task', async () => {
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
      viewport: { width: 612, height: 396 },
    }]],
  })

  controller.abort()
  await expect(rendering).rejects.toThrow('Rendering cancelled.')
  expect(cancel).toHaveBeenCalledOnce()
})

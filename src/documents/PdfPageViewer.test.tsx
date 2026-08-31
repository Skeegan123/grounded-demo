import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { findDocument } from '../demoProject/demoProject'
import { PdfPageViewer, type PdfPageRenderer } from './PdfPageViewer'

test('the PDF page and Point Set overlay share fitted post-rotation geometry', async () => {
  vi.stubGlobal('ResizeObserver', class {
    private callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(target: Element) {
      this.callback([
        {
          target,
          contentRect: { width: 612, height: 500 },
        } as ResizeObserverEntry,
      ], this as unknown as ResizeObserver)
    }

    disconnect() {}
    unobserve() {}
  })

  const requests: Array<{ pageNumber: number; width: number; height: number }> = []
  const renderer: PdfPageRenderer = {
    async renderPage(request) {
      requests.push({
        pageNumber: request.pageNumber,
        width: request.width,
        height: request.height,
      })
    },
    prefetchPages() {},
  }
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages.find((candidate) => candidate.id === 'sheet-a1.3')!
  const onPlacePoint = vi.fn()

  render(
    <PdfPageViewer
      canMark
      document={document}
      onPlacePoint={onPlacePoint}
      page={page}
      points={[{
        pageId: page.id,
        pageLabel: page.label,
        pageNumber: page.number,
        x: 0.5,
        y: 0.25,
      }]}
      renderer={renderer}
      zoom={1}
    />,
  )

  const overlay = await screen.findByLabelText('Drawing page A1.3')
  await waitFor(() => expect(requests).toEqual([
    { pageNumber: 7, width: 612, height: 396 },
  ]))
  expect(screen.getByLabelText('Rendered PDF page A1.3')).toHaveStyle({
    width: '612px',
    height: '396px',
  })
  expect(screen.getByText('1')).toHaveStyle({ left: '50%', top: '25%' })

  Object.defineProperty(overlay, 'getBoundingClientRect', {
    value: () => ({ left: 10, top: 20, width: 612, height: 396 }),
  })
  fireEvent.click(overlay, { clientX: 316, clientY: 218 })
  expect(onPlacePoint).toHaveBeenCalledWith({ x: 0.5, y: 0.5 })
})

test('changing pages cancels stale work and caches only the neighboring pages', async () => {
  vi.stubGlobal('ResizeObserver', class {
    private callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(target: Element) {
      this.callback([
        {
          target,
          contentRect: { width: 612, height: 500 },
        } as ResizeObserverEntry,
      ], this as unknown as ResizeObserver)
    }

    disconnect() {}
    unobserve() {}
  })

  const requests: RenderPageRequestWithResolve[] = []
  const prefetched: number[][] = []
  const renderer: PdfPageRenderer = {
    renderPage(request) {
      return new Promise<void>((resolve) => {
        requests.push({ ...request, resolve })
      })
    },
    prefetchPages(request) {
      prefetched.push(request.pageNumbers)
    },
  }
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const firstPage = document.pages[0]!
  const secondPage = document.pages[1]!

  const view = render(
    <PdfPageViewer
      canMark={false}
      document={document}
      onPlacePoint={() => {}}
      page={firstPage}
      points={[]}
      renderer={renderer}
      zoom={1}
    />,
  )
  await waitFor(() => expect(requests).toHaveLength(1))

  view.rerender(
    <PdfPageViewer
      canMark={false}
      document={document}
      onPlacePoint={() => {}}
      page={secondPage}
      points={[]}
      renderer={renderer}
      zoom={1}
    />,
  )
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[0]!.signal.aborted).toBe(true)

  requests[1]!.resolve()
  await waitFor(() => expect(prefetched).toEqual([[1, 3]]))
})

interface RenderPageRequestWithResolve {
  canvas: HTMLCanvasElement
  height: number
  pageNumber: number
  resolve: () => void
  signal: AbortSignal
  url: string
  width: number
}

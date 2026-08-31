import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { findDocument } from '../demoProject/demoProject'
import {
  PdfPageViewer,
  type PdfPageRenderer,
  type RenderPageRequest,
} from './PdfPageViewer'

test('the PDF page and Point Set overlay share fitted post-rotation geometry', async () => {
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
  expect(screen.getByText('1').closest('.point-mark')).toHaveStyle({
    left: '50%',
    top: '25%',
  })

  Object.defineProperty(overlay, 'getBoundingClientRect', {
    value: () => ({ left: 10, top: 20, width: 612, height: 396 }),
  })
  fireEvent.click(overlay, { clientX: 316, clientY: 218 })
  expect(onPlacePoint).toHaveBeenCalledWith({ x: 0.5, y: 0.5 })
})

test('Point Numbers use the complete Point Set order across pages', async () => {
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const firstPage = document.pages.find((page) => page.id === 'sheet-a1.2')!
  const secondPage = document.pages.find((page) => page.id === 'sheet-a4.3')!
  const renderer: PdfPageRenderer = {
    async renderPage() {},
    prefetchPages() {},
  }

  render(
    <PdfPageViewer
      canMark
      document={document}
      onPlacePoint={() => {}}
      page={secondPage}
      points={[
        {
          pageId: firstPage.id,
          pageLabel: firstPage.label,
          pageNumber: firstPage.number,
          x: 0.5,
          y: 0.5,
        },
        {
          pageId: secondPage.id,
          pageLabel: secondPage.label,
          pageNumber: secondPage.number,
          x: 0.25,
          y: 0.75,
        },
      ]}
      renderer={renderer}
      zoom={1}
    />,
  )

  const overlay = await screen.findByLabelText('Drawing page A4.3')
  expect(within(overlay).getByText('2').closest('.point-mark')).toHaveStyle({
    left: '25%',
    top: '75%',
  })
  expect(within(overlay).queryByText('1')).not.toBeInTheDocument()
})

test('changing pages cancels stale work and caches only the neighboring pages', async () => {
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

test('a document-render failure keeps the authoritative PDF available', async () => {
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages[0]!
  const renderer: PdfPageRenderer = {
    async renderPage() {
      throw new Error('The document request failed.')
    },
    prefetchPages() {},
  }

  render(
    <PdfPageViewer
      canMark={false}
      document={document}
      onPlacePoint={() => {}}
      page={page}
      points={[]}
      renderer={renderer}
      zoom={1}
    />,
  )

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('The document request failed.')
  expect(screen.getByRole('link', { name: 'Open authoritative PDF page' }))
    .toHaveAttribute('href', `${document.file.url}#page=${page.number}`)
})

test('placement waits for the matching render and a drag never adds a point', async () => {
  const requests: RenderPageRequestWithResolve[] = []
  const renderer: PdfPageRenderer = {
    renderPage(request) {
      return new Promise<void>((resolve) => requests.push({ ...request, resolve }))
    },
    prefetchPages() {},
  }
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const firstPage = document.pages[0]!
  const secondPage = document.pages[1]!
  const onPlacePoint = vi.fn()
  const view = render(
    <PdfPageViewer
      canMark
      document={document}
      onPlacePoint={onPlacePoint}
      page={firstPage}
      points={[]}
      renderer={renderer}
      zoom={1}
    />,
  )

  const firstOverlay = await screen.findByLabelText('Drawing page A0.0')
  expect(firstOverlay).not.toHaveAttribute('role', 'button')
  fireEvent.click(firstOverlay, { clientX: 10, clientY: 10 })
  expect(onPlacePoint).not.toHaveBeenCalled()

  requests[0]!.resolve()
  await waitFor(() => expect(firstOverlay).toHaveAttribute('role', 'button'))
  const frame = firstOverlay.parentElement!
  Object.defineProperty(frame, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 120,
      height: 100,
      left: 10,
      right: 110,
      top: 20,
      width: 100,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }),
  })
  const viewer = firstOverlay.closest('.pdf-page-viewer')!
  fireEvent.pointerDown(viewer, {
    button: 0,
    clientX: 50,
    clientY: 60,
    pointerId: 1,
  })
  fireEvent.pointerMove(viewer, {
    buttons: 1,
    clientX: 54,
    clientY: 62,
    pointerId: 1,
  })
  fireEvent.pointerUp(viewer, { clientX: 54, clientY: 62, pointerId: 1 })
  expect(onPlacePoint).toHaveBeenLastCalledWith({ x: 0.44, y: 0.42 })

  fireEvent.pointerDown(viewer, {
    button: 0,
    clientX: 50,
    clientY: 60,
    pointerId: 2,
  })
  fireEvent.pointerMove(viewer, {
    buttons: 1,
    clientX: 70,
    clientY: 80,
    pointerId: 2,
  })
  fireEvent.pointerUp(viewer, { clientX: 70, clientY: 80, pointerId: 2 })
  expect(onPlacePoint).toHaveBeenCalledTimes(1)

  view.rerender(
    <PdfPageViewer
      canMark
      document={document}
      onPlacePoint={onPlacePoint}
      page={secondPage}
      points={[]}
      renderer={renderer}
      zoom={1}
    />,
  )
  const secondOverlay = await screen.findByLabelText('Drawing page A0.1')
  expect(secondOverlay).not.toHaveAttribute('role', 'button')
  expect(screen.getByLabelText('Rendered PDF page A0.1')).toHaveProperty('width', 0)
  fireEvent.click(secondOverlay, { clientX: 10, clientY: 10 })
  expect(onPlacePoint).toHaveBeenCalledTimes(1)
})

test('a draft marker can be selected and removed without placing a point', async () => {
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages[0]!
  const onPlacePoint = vi.fn()
  const onRemovePoint = vi.fn()
  render(
    <PdfPageViewer
      canMark
      document={document}
      onPlacePoint={onPlacePoint}
      onRemovePoint={onRemovePoint}
      page={page}
      points={[{
        pageId: page.id,
        pageLabel: page.label,
        pageNumber: page.number,
        x: 0.4,
        y: 0.6,
      }]}
      renderer={{ async renderPage() {}, prefetchPages() {} }}
      zoom={1}
    />,
  )

  const marker = await screen.findByRole('button', { name: 'Point 1' })
  await waitFor(() => expect(marker).toBeVisible())
  fireEvent.click(marker)
  expect(marker.closest('.point-mark')).toHaveClass('selected')
  fireEvent.click(screen.getByRole('button', { name: 'Remove point 1' }))
  expect(onRemovePoint).toHaveBeenCalledWith(0)
  expect(onPlacePoint).not.toHaveBeenCalled()
})

type RenderPageRequestWithResolve = RenderPageRequest & {
  resolve: () => void
}

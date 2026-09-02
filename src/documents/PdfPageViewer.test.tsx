import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
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
  expect(screen.getByLabelText('Rendered PDF page A0.1'))
    .toHaveStyle({ visibility: 'hidden' })
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

test('a submitted marker exposes its fixed number and location to keyboard users', async () => {
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages[0]!

  render(
    <PdfPageViewer
      canMark={false}
      document={document}
      onPlacePoint={() => {}}
      page={page}
      points={[{
        pointNumber: 4,
        pageId: page.id,
        pageLabel: page.label,
        pageNumber: page.number,
        x: 0.25,
        y: 0.75,
      }]}
      renderer={{ async renderPage() {}, prefetchPages() {} }}
      zoom={1}
    />,
  )

  const marker = await screen.findByRole('img', {
    name: 'Submitted point 4 at 25% from left and 75% from top',
  })
  marker.focus()
  expect(marker).toHaveFocus()
})

test('trackpad scrolling zooms responsively without flashing a cover', async () => {
  const renderer: PdfPageRenderer = {
    renderPage: vi.fn(async ({ canvas, height, width }) => {
      canvas.width = width
      canvas.height = height
    }),
    prefetchPages() {},
  }
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages[0]!
  const zoomChanges: number[] = []

  function Viewer() {
    const [zoom, setZoom] = useState(2)
    return (
      <PdfPageViewer
        canMark={false}
        document={document}
        onPlacePoint={() => {}}
        onZoomChange={(nextZoom) => {
          zoomChanges.push(nextZoom)
          setZoom(nextZoom)
        }}
        page={page}
        points={[]}
        renderer={renderer}
        zoom={zoom}
      />
    )
  }

  render(<Viewer />)
  const canvas = await screen.findByLabelText('Rendered PDF page A0.0')
  await waitFor(() => expect(renderer.renderPage).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(canvas).toHaveStyle({ visibility: 'visible' }))
  const viewer = canvas.closest('.pdf-page-viewer')!
  const frame = canvas.closest('.pdf-page-frame')!
  const initialTransform = frame.getAttribute('style')

  act(() => {
    viewer.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      deltaX: 30,
      deltaY: -24,
    }))
    viewer.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      deltaX: 20,
      deltaY: -16,
    }))
  })

  expect(zoomChanges).toHaveLength(2)
  expect(zoomChanges.at(-1)).toBeCloseTo(2 * Math.exp(40 * 0.002))
  await waitFor(() => expect(frame.getAttribute('style')).not.toBe(initialTransform))
  expect(renderer.renderPage).toHaveBeenCalledTimes(1)
  expect(canvas).toHaveStyle({ visibility: 'visible' })
  expect(screen.queryByText('Rendering PDF page')).not.toBeInTheDocument()
})

test('intentional zoom keeps the completed bitmap visible until its replacement is ready', async () => {
  let renderCount = 0
  const pendingRenders: Array<{
    canvas: HTMLCanvasElement
    height: number
    resolve: () => void
    width: number
  }> = []
  const renderer: PdfPageRenderer = {
    renderPage: vi.fn(({ canvas, height, width }) => {
      renderCount += 1
      if (renderCount === 1) {
        canvas.width = width
        canvas.height = height
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        pendingRenders.push({ canvas, height, resolve, width })
      })
    }),
    prefetchPages() {},
  }
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages[0]!
  const renderViewer = (zoom: number) => (
    <PdfPageViewer
      canMark={false}
      document={document}
      onPlacePoint={() => {}}
      page={page}
      points={[]}
      renderer={renderer}
      zoom={zoom}
    />
  )

  const view = render(renderViewer(1))
  const canvas = await screen.findByLabelText(
    'Rendered PDF page A0.0',
  ) as HTMLCanvasElement
  await waitFor(() => expect(canvas).toHaveStyle({ visibility: 'visible' }))

  view.rerender(renderViewer(1.1))
  await waitFor(() => expect(renderer.renderPage).toHaveBeenCalledTimes(2))
  expect(canvas).toHaveStyle({ visibility: 'visible' })
  expect(screen.queryByText('Rendering PDF page')).not.toBeInTheDocument()

  const replacement = pendingRenders[0]!
  replacement.canvas.width = replacement.width
  replacement.canvas.height = replacement.height
  act(() => replacement.resolve())
  await waitFor(() => expect(screen.getByLabelText('Rendered PDF page A0.0'))
    .toBe(replacement.canvas))
  expect(replacement.canvas).toHaveStyle({ visibility: 'visible' })
})

test('rapid intentional zoom coalesces obsolete replacement renders', async () => {
  const renderer: PdfPageRenderer = {
    renderPage: vi.fn(async ({ canvas, height, width }) => {
      canvas.width = width
      canvas.height = height
    }),
    prefetchPages() {},
  }
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages[0]!
  const renderViewer = (zoom: number) => (
    <PdfPageViewer
      canMark={false}
      document={document}
      onPlacePoint={() => {}}
      page={page}
      points={[]}
      renderer={renderer}
      zoom={zoom}
    />
  )

  const view = render(renderViewer(1))
  await waitFor(() => expect(renderer.renderPage).toHaveBeenCalledTimes(1))
  view.rerender(renderViewer(1.1))
  await new Promise((resolve) => setTimeout(resolve, 20))
  view.rerender(renderViewer(1.2))
  await new Promise((resolve) => setTimeout(resolve, 20))
  view.rerender(renderViewer(1.3))

  await waitFor(() => expect(renderer.renderPage).toHaveBeenCalledTimes(2))
  expect(renderer.renderPage).toHaveBeenLastCalledWith(
    expect.objectContaining({ width: 795.6 }),
  )
})

test('visible navigation acknowledgement is keyed to the current viewer request', async () => {
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
  const onVisibleViewChange = vi.fn()
  const view = render(
    <PdfPageViewer
      canMark={false}
      document={document}
      navigationRequest={{
        id: 1,
        documentId: document.id,
        documentVersionId: document.versionId,
        pageId: firstPage.id,
        fit: 'page',
        zoom: 1,
      }}
      onPlacePoint={() => {}}
      onVisibleViewChange={onVisibleViewChange}
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
      navigationRequest={{
        id: 2,
        documentId: document.id,
        documentVersionId: document.versionId,
        pageId: secondPage.id,
        fit: 'page',
        zoom: 1,
      }}
      onPlacePoint={() => {}}
      onVisibleViewChange={onVisibleViewChange}
      page={secondPage}
      points={[]}
      renderer={renderer}
      zoom={1}
    />,
  )
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[0]!.signal.aborted).toBe(true)
  act(() => requests[0]!.resolve())
  expect(onVisibleViewChange).not.toHaveBeenCalled()

  act(() => requests[1]!.resolve())
  await waitFor(() => expect(onVisibleViewChange).toHaveBeenCalledWith(
    expect.objectContaining({ pageId: secondPage.id, requestId: 2 }),
  ))
  expect(onVisibleViewChange).not.toHaveBeenCalledWith(
    expect.objectContaining({ requestId: 1 }),
  )
})

test('reports render failure only for the matching viewer request', async () => {
  const renderer: PdfPageRenderer = {
    async renderPage() {
      throw new Error('Renderer implementation detail.')
    },
    prefetchPages() {},
  }
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages[0]!
  const onRenderError = vi.fn()
  render(
    <PdfPageViewer
      canMark={false}
      document={document}
      navigationRequest={{
        id: 12,
        documentId: document.id,
        documentVersionId: document.versionId,
        pageId: page.id,
        fit: 'page',
        zoom: 1,
      }}
      onPlacePoint={() => {}}
      onRenderError={onRenderError}
      page={page}
      points={[]}
      renderer={renderer}
      zoom={1}
    />,
  )

  await waitFor(() => expect(onRenderError).toHaveBeenCalledWith(12))
  expect(onRenderError).toHaveBeenCalledTimes(1)
})

test('reports human takeover only after a real pan or zoom gesture', async () => {
  const renderer: PdfPageRenderer = {
    async renderPage() {},
    prefetchPages() {},
  }
  const document = findDocument(
    'virginia-farmhouse-drawings',
    'virginia-farmhouse-drawings-v1',
  )!
  const page = document.pages[0]!
  const onHumanTakeover = vi.fn()
  const onZoomChange = vi.fn()
  render(
    <PdfPageViewer
      canMark={false}
      document={document}
      onHumanTakeover={onHumanTakeover}
      onPlacePoint={() => {}}
      onZoomChange={onZoomChange}
      page={page}
      points={[]}
      renderer={renderer}
      zoom={1}
    />,
  )
  const canvas = await screen.findByLabelText('Rendered PDF page A0.0')
  const viewer = canvas.closest('.pdf-page-viewer')!

  fireEvent.pointerDown(viewer, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  })
  fireEvent.pointerMove(viewer, {
    buttons: 1,
    clientX: 15,
    clientY: 10,
    pointerId: 1,
  })
  expect(onHumanTakeover).not.toHaveBeenCalled()
  fireEvent.pointerMove(viewer, {
    buttons: 1,
    clientX: 16,
    clientY: 10,
    pointerId: 1,
  })
  fireEvent.pointerMove(viewer, {
    buttons: 1,
    clientX: 20,
    clientY: 10,
    pointerId: 1,
  })
  expect(onHumanTakeover).toHaveBeenCalledTimes(1)

  act(() => {
    viewer.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      deltaY: -20,
    }))
  })
  expect(onHumanTakeover).toHaveBeenCalledTimes(2)
  expect(onZoomChange).toHaveBeenCalled()
})

type RenderPageRequestWithResolve = RenderPageRequest & {
  resolve: () => void
}

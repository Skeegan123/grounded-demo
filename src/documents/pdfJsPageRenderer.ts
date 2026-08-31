import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type {
  PdfPageRenderer,
  PrefetchPagesRequest,
  RenderPageRequest,
} from './PdfPageViewer'

interface PdfViewport {
  height: number
  width: number
}

interface PdfRenderTask {
  cancel: () => void
  promise: Promise<void>
}

interface PdfPage {
  getViewport: (options: { scale: number }) => PdfViewport
  render: (options: {
    canvas: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    transform: number[] | undefined
    viewport: PdfViewport
  }) => PdfRenderTask
}

interface PdfDocument {
  getPage: (pageNumber: number) => Promise<PdfPage>
}

interface PdfJsPageRendererOptions {
  loadDocument?: (url: string) => Promise<PdfDocument>
  outputScale?: () => number
}

async function loadPdfDocument(url: string): Promise<PdfDocument> {
  const pdfJs = await import('pdfjs-dist')
  pdfJs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  return pdfJs.getDocument({ url }).promise as unknown as Promise<PdfDocument>
}

export function createPdfJsPageRenderer(
  options: PdfJsPageRendererOptions = {},
): PdfPageRenderer {
  const loadDocument = options.loadDocument ?? loadPdfDocument
  const outputScale = options.outputScale ?? (() => window.devicePixelRatio || 1)
  const documents = new Map<string, Promise<PdfDocument>>()
  const pages = new Map<string, Promise<PdfPage>>()

  const getDocument = (url: string) => {
    const cached = documents.get(url)
    if (cached) return cached

    const loading = loadDocument(url).catch((error: unknown) => {
      documents.delete(url)
      throw error
    })
    documents.set(url, loading)
    return loading
  }

  const getPage = (url: string, pageNumber: number) => {
    const key = `${url}#page=${pageNumber}`
    const cached = pages.get(key)
    if (cached) return cached

    const loading = getDocument(url)
      .then((document) => document.getPage(pageNumber))
      .catch((error: unknown) => {
        pages.delete(key)
        throw error
      })
    pages.set(key, loading)
    return loading
  }

  const renderPage = async (request: RenderPageRequest) => {
    const page = await getPage(request.url, request.pageNumber)
    if (request.signal.aborted) {
      throw new DOMException('Rendering cancelled.', 'AbortError')
    }

    const unscaledViewport = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({
      scale: request.width / unscaledViewport.width,
    })
    const scale = outputScale()
    const context = request.canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('The browser could not create a PDF canvas.')

    request.canvas.width = Math.ceil(viewport.width * scale)
    request.canvas.height = Math.ceil(viewport.height * scale)
    const renderTask = page.render({
      canvas: request.canvas,
      canvasContext: context,
      transform: scale === 1 ? undefined : [scale, 0, 0, scale, 0, 0],
      viewport,
    })
    const cancel = () => renderTask.cancel()
    request.signal.addEventListener('abort', cancel, { once: true })
    try {
      await renderTask.promise
    } finally {
      request.signal.removeEventListener('abort', cancel)
    }
  }

  const prefetchPages = ({ url, pageNumbers }: PrefetchPagesRequest) => {
    void Promise.allSettled(
      pageNumbers.map((pageNumber) => getPage(url, pageNumber)),
    )
  }

  return { prefetchPages, renderPage }
}

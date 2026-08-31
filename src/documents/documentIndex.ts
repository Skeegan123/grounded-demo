import type { ProjectDocument } from '../demoProject/demoProject'

export interface IndexedTextRun {
  text: string
  box: [number, number, number, number]
  source: 'embedded' | 'ocr'
  confidence?: number
}

export interface DocumentIndexPage {
  page: {
    id: string
    label: string
    number: number
    title: string
    sheetNumber?: string
  }
  width: number
  height: number
  rotation: number
  status: 'indexed' | 'no-usable-text' | 'failed'
  failure?: string
  runs: IndexedTextRun[]
}

export interface DocumentIndex {
  schemaVersion: 1
  documentId: string
  documentVersionId: string
  sourceFingerprint: string
  extractor: {
    pipelineVersion: string
    pdfjsVersion: string
    ocrEngine?: 'tesseract'
    ocrEngineVersion?: string
  }
  pages: DocumentIndexPage[]
}

function invalid(message: string): never {
  throw new Error(`Invalid DocumentIndex: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function validateDocumentIndexes(
  value: unknown,
  documents: ProjectDocument[],
): DocumentIndex[] {
  if (!Array.isArray(value) || value.length !== documents.length) {
    return invalid('one index is required for every Project Workspace document.')
  }

  return documents.map((document) => {
    const candidate = value.find(
      (entry) =>
        isRecord(entry) &&
        entry.documentId === document.id &&
        entry.documentVersionId === document.versionId,
    )
    if (!isRecord(candidate) || candidate.schemaVersion !== 1) {
      return invalid(`missing schema version 1 index for ${document.versionId}.`)
    }
    if (candidate.sourceFingerprint !== document.file.sha256) {
      return invalid(`source fingerprint does not match ${document.versionId}.`)
    }
    if (!isRecord(candidate.extractor) || !Array.isArray(candidate.pages)) {
      return invalid(`extractor or pages are missing for ${document.versionId}.`)
    }
    if (
      candidate.pages.length !== document.pages.length ||
      typeof candidate.extractor.pipelineVersion !== 'string' ||
      typeof candidate.extractor.pdfjsVersion !== 'string'
    ) {
      return invalid(`extractor metadata or page count is wrong for ${document.versionId}.`)
    }

    candidate.pages.forEach((pageValue, index) => {
      const sourcePage = document.pages[index]
      if (!sourcePage || !isRecord(pageValue) || !isRecord(pageValue.page)) {
        return invalid(`page ${index + 1} is missing from ${document.versionId}.`)
      }
      if (
        pageValue.page.id !== sourcePage.id ||
        pageValue.page.number !== sourcePage.number ||
        pageValue.width !== sourcePage.width ||
        pageValue.height !== sourcePage.height ||
        pageValue.rotation !== sourcePage.rotation
      ) {
        return invalid(`page ${sourcePage.id} does not match its immutable reference.`)
      }
      if (
        !['indexed', 'no-usable-text', 'failed'].includes(String(pageValue.status)) ||
        !Array.isArray(pageValue.runs)
      ) {
        return invalid(`page ${sourcePage.id} has an invalid status or run list.`)
      }
      if (
        pageValue.status === 'failed' &&
        (typeof pageValue.failure !== 'string' || !pageValue.failure.trim())
      ) {
        return invalid(`failed page ${sourcePage.id} requires a failure reason.`)
      }

      for (const run of pageValue.runs) {
        if (
          !isRecord(run) ||
          typeof run.text !== 'string' ||
          !['embedded', 'ocr'].includes(String(run.source)) ||
          !Array.isArray(run.box) ||
          run.box.length !== 4 ||
          run.box.some(
            (coordinate) =>
              typeof coordinate !== 'number' || coordinate < 0 || coordinate > 1,
          )
        ) {
          return invalid(`page ${sourcePage.id} has an invalid positioned text run.`)
        }
      }
    })

    return candidate as unknown as DocumentIndex
  })
}

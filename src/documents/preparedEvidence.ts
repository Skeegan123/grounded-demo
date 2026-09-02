import type { DocumentPage, ProjectDocument } from '../demoProject/demoProject'

export const PREPARED_EVIDENCE_SCHEMA_VERSION = 2 as const

export type EvidenceClassification = 'document_evidence' | 'search_hint'

export interface NormalizedRegion {
  left: number
  top: number
  width: number
  height: number
}

export interface PreparedEvidenceBlock {
  id: string
  order: number
  sourceType: string
  content: string
  contentFormat: 'text' | 'html'
  region: NormalizedRegion
  confidence?: {
    level?: 'high' | 'low'
    score?: number
  }
  classification: EvidenceClassification
  provenance: {
    provider: 'reducto'
    sourceType: string
  }
}

export interface PreparedEvidenceTableCell {
  text: string
  header: boolean
  rowSpan: number
  columnSpan: number
}

export interface PreparedEvidenceTableRow {
  id: string
  parentBlockId: string
  rowIndex: number
  text: string
  cells: PreparedEvidenceTableCell[]
  region: NormalizedRegion
  classification: 'document_evidence'
}

export interface PreparedEvidencePage {
  page: DocumentPage
  blocks: PreparedEvidenceBlock[]
  tableRows: PreparedEvidenceTableRow[]
}

export interface PreparedEvidenceArtifact {
  schemaVersion: typeof PREPARED_EVIDENCE_SCHEMA_VERSION
  document: {
    id: string
    versionId: string
    kind: string
    title: string
  }
  source: {
    fingerprint: string
    byteSize: number
    pageCount: number
  }
  provenance: {
    provider: 'reducto'
    importerVersion: string
    sourceFingerprint: string
    verified: {
      parseExportSha256: string
      model: 'r-1'
      modelSource: 'usage.usage_breakdown.parse_model'
    }
    maintainerDeclaredParseSettings: {
      chunking: 'disabled'
      embeddingOptimization: false
      returnedImages: false
      tableOutputFormat: 'html'
      agenticPass: false
      returnedOcrData: true
    }
  }
  pages: PreparedEvidencePage[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function repairCommand(documentId = '<document-id>') {
  return `pnpm import:document-evidence --document ${documentId} --export <parse-export.json>`
}

function invalid(document: ProjectDocument | undefined, message: string): never {
  const identity = document?.versionId ?? 'the current Project Workspace documents'
  throw new Error(
    `Invalid prepared evidence for ${identity}: ${message} Regenerate with: ${repairCommand(document?.id)}`,
  )
}

function invalidCandidate(
  candidate: Record<string, unknown>,
  documents: ProjectDocument[],
  message: string,
): never {
  const identity = isRecord(candidate.document) ? candidate.document : undefined
  const documentId = typeof identity?.id === 'string' ? identity.id : undefined
  const document = documents.find((entry) => entry.id === documentId)
  if (document) invalid(document, message)
  const versionId = typeof identity?.versionId === 'string'
    ? identity.versionId
    : 'an unidentified artifact'
  throw new Error(
    `Invalid prepared evidence for ${versionId}: ${message} Regenerate with: ${repairCommand(documentId)}`,
  )
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizedRegion(value: unknown) {
  if (!isRecord(value)) return false
  const { left, top, width, height } = value
  return (
    finiteNumber(left) &&
    finiteNumber(top) &&
    finiteNumber(width) &&
    finiteNumber(height) &&
    left >= 0 &&
    top >= 0 &&
    width >= 0 &&
    height >= 0 &&
    left <= 1 &&
    top <= 1 &&
    width <= 1 &&
    height <= 1 &&
    left + width <= 1.000001 &&
    top + height <= 1.000001
  )
}

function validConfidence(value: unknown) {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  return (
    (value.level === undefined || value.level === 'high' || value.level === 'low') &&
    (value.score === undefined ||
      (finiteNumber(value.score) && value.score >= 0 && value.score <= 1))
  )
}

function validateArtifactPages(
  candidate: Record<string, unknown>,
  document: ProjectDocument,
) {
  if (!Array.isArray(candidate.pages)) {
    invalid(document, 'pages are missing or are not an array.')
  }
  if (
    candidate.pages.length !== document.file.pageCount ||
    candidate.pages.length !== document.pages.length
  ) {
    invalid(document, 'page count does not match the immutable document version.')
  }

  const blockIds = new Set<string>()
  const rowIds = new Set<string>()
  candidate.pages.forEach((pageValue, pageIndex) => {
    const expectedPage = document.pages[pageIndex]
    if (!expectedPage || !isRecord(pageValue) || !isRecord(pageValue.page)) {
      invalid(document, `page ${pageIndex + 1} is missing or malformed.`)
    }
    const page = pageValue.page
    if (
      page.id !== expectedPage.id ||
      page.label !== expectedPage.label ||
      page.number !== expectedPage.number ||
      page.title !== expectedPage.title ||
      page.sheetNumber !== expectedPage.sheetNumber ||
      page.width !== expectedPage.width ||
      page.height !== expectedPage.height ||
      page.rotation !== expectedPage.rotation
    ) {
      invalid(document, `page ${expectedPage.id} does not match its immutable reference.`)
    }
    if (!Array.isArray(pageValue.blocks) || !Array.isArray(pageValue.tableRows)) {
      invalid(document, `page ${expectedPage.id} is missing blocks or table rows.`)
    }

    const pageBlocks = new Map<string, Record<string, unknown>>()
    pageValue.blocks.forEach((blockValue, blockIndex) => {
      if (!isRecord(blockValue)) {
        invalid(document, `page ${expectedPage.id} has a malformed block.`)
      }
      if (!nonEmptyString(blockValue.id) || blockIds.has(blockValue.id)) {
        invalid(document, `page ${expectedPage.id} has a missing or duplicate block identity.`)
      }
      if (
        blockValue.order !== blockIndex ||
        !nonEmptyString(blockValue.sourceType) ||
        !nonEmptyString(blockValue.content) ||
        (blockValue.contentFormat !== 'text' && blockValue.contentFormat !== 'html') ||
        !normalizedRegion(blockValue.region) ||
        !validConfidence(blockValue.confidence) ||
        (blockValue.classification !== 'document_evidence' &&
          blockValue.classification !== 'search_hint') ||
        !isRecord(blockValue.provenance) ||
        blockValue.provenance.provider !== 'reducto' ||
        blockValue.provenance.sourceType !== blockValue.sourceType
      ) {
        invalid(document, `page ${expectedPage.id} has an invalid block ${blockValue.id}.`)
      }
      blockIds.add(blockValue.id)
      pageBlocks.set(blockValue.id, blockValue)
    })

    pageValue.tableRows.forEach((rowValue) => {
      if (!isRecord(rowValue)) {
        invalid(document, `page ${expectedPage.id} has a malformed table row.`)
      }
      const parent = typeof rowValue.parentBlockId === 'string'
        ? pageBlocks.get(rowValue.parentBlockId)
        : undefined
      if (
        !nonEmptyString(rowValue.id) ||
        rowIds.has(rowValue.id) ||
        !parent ||
        parent.sourceType !== 'Table' ||
        parent.contentFormat !== 'html' ||
        !Number.isInteger(rowValue.rowIndex) ||
        (rowValue.rowIndex as number) < 0 ||
        !nonEmptyString(rowValue.text) ||
        !normalizedRegion(rowValue.region) ||
        rowValue.classification !== 'document_evidence' ||
        !Array.isArray(rowValue.cells) ||
        rowValue.cells.length === 0
      ) {
        invalid(document, `page ${expectedPage.id} has an invalid table row ${String(rowValue.id)}.`)
      }
      for (const cellValue of rowValue.cells) {
        if (
          !isRecord(cellValue) ||
          typeof cellValue.text !== 'string' ||
          typeof cellValue.header !== 'boolean' ||
          !Number.isInteger(cellValue.rowSpan) ||
          (cellValue.rowSpan as number) < 1 ||
          !Number.isInteger(cellValue.columnSpan) ||
          (cellValue.columnSpan as number) < 1
        ) {
          invalid(document, `page ${expectedPage.id} has an invalid table cell.`)
        }
      }
      rowIds.add(rowValue.id)
    })

    if (pageValue.lowLevelOcr !== undefined) {
      invalid(document, `page ${expectedPage.id} must not contain low-level OCR data.`)
    }
  })
}

function validateArtifact(candidate: Record<string, unknown>, document: ProjectDocument) {
  if (
    !/^[a-f0-9]{64}$/.test(document.preparedEvidence.parseExportSha256) ||
    document.preparedEvidence.requiredModel !== 'r-1'
  ) {
    invalid(document, 'manifest prepared-evidence binding is invalid.')
  }
  if (!isRecord(candidate.document)) {
    invalid(document, 'document metadata is missing.')
  }
  if (
    candidate.document.id !== document.id ||
    candidate.document.versionId !== document.versionId ||
    candidate.document.kind !== document.kind ||
    candidate.document.title !== document.title
  ) {
    invalid(document, 'document metadata does not match the manifest.')
  }

  if (!isRecord(candidate.source)) invalid(document, 'source metadata is missing.')
  if (
    candidate.source.fingerprint !== document.file.sha256 ||
    candidate.source.byteSize !== document.file.byteSize
  ) {
    invalid(document, 'source fingerprint or byte size is stale.')
  }
  if (candidate.source.pageCount !== document.file.pageCount) {
    invalid(document, 'source page count does not match the manifest.')
  }

  if (!isRecord(candidate.provenance)) invalid(document, 'provenance is missing.')
  const provenance = candidate.provenance
  if (
    provenance.provider !== 'reducto' ||
    !nonEmptyString(provenance.importerVersion) ||
    provenance.sourceFingerprint !== document.file.sha256 ||
    provenance.sourceFingerprint !== candidate.source.fingerprint ||
    !isRecord(provenance.verified) ||
    provenance.verified.parseExportSha256 !==
      document.preparedEvidence.parseExportSha256 ||
    provenance.verified.model !== document.preparedEvidence.requiredModel ||
    provenance.verified.modelSource !== 'usage.usage_breakdown.parse_model' ||
    !isRecord(provenance.maintainerDeclaredParseSettings)
  ) {
    invalid(
      document,
      'Reducto provenance does not match the immutable source or bound Parse export.',
    )
  }
  const settings = provenance.maintainerDeclaredParseSettings
  if (
    settings.chunking !== 'disabled' ||
    settings.embeddingOptimization !== false ||
    settings.returnedImages !== false ||
    settings.tableOutputFormat !== 'html' ||
    settings.agenticPass !== false ||
    settings.returnedOcrData !== true
  ) {
    invalid(document, 'Reducto parse settings do not match the required configuration.')
  }

  validateArtifactPages(candidate, document)
}

export function validatePreparedEvidenceArtifacts(
  value: unknown,
  documents: ProjectDocument[],
): PreparedEvidenceArtifact[] {
  if (!Array.isArray(value)) {
    invalid(undefined, 'one schema version 2 artifact is required for every document.')
  }

  const candidates = value.map((entry, index) => {
    if (!isRecord(entry)) {
      invalid(undefined, `artifact ${index + 1} is not an object.`)
    }
    if (entry.schemaVersion !== PREPARED_EVIDENCE_SCHEMA_VERSION) {
      invalidCandidate(entry, documents, 'only schema version 2 is supported.')
    }
    if (
      !isRecord(entry.document) ||
      !nonEmptyString(entry.document.id) ||
      !nonEmptyString(entry.document.versionId)
    ) {
      invalidCandidate(entry, documents, 'document identity is missing.')
    }
    return entry
  })

  const identities = new Set<string>()
  for (const candidate of candidates) {
    const identity = candidate.document as Record<string, unknown>
    const key = `${identity.id}\u0000${identity.versionId}`
    if (identities.has(key)) {
      invalidCandidate(candidate, documents, 'the artifact identity is duplicated.')
    }
    identities.add(key)
    if (!documents.some((document) => document.id === identity.id)) {
      invalidCandidate(candidate, documents, 'the document identity is not in the manifest.')
    }
  }

  return documents.map((document) => {
    const matches = candidates.filter(
      (candidate) =>
        isRecord(candidate.document) && candidate.document.id === document.id,
    )
    if (matches.length === 0) {
      invalid(document, 'the current document artifact is missing.')
    }
    if (matches.length > 1) {
      invalid(document, 'more than one artifact exists for this document identity.')
    }
    const candidate = matches[0]!
    if (
      !isRecord(candidate.document) ||
      candidate.document.versionId !== document.versionId
    ) {
      invalid(
        document,
        `artifact version ${String(isRecord(candidate.document) ? candidate.document.versionId : undefined)} is stale; expected ${document.versionId}.`,
      )
    }
    validateArtifact(candidate, document)
    return candidate as unknown as PreparedEvidenceArtifact
  })
}

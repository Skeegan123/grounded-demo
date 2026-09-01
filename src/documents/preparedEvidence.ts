import type { DocumentPage } from '../demoProject/demoProject'

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

export interface PreparedEvidenceOcrRecord {
  text: string
  region: NormalizedRegion
  confidence?: number
  rotation?: number
}

export interface PreparedEvidencePage {
  page: DocumentPage
  blocks: PreparedEvidenceBlock[]
  tableRows: PreparedEvidenceTableRow[]
  lowLevelOcr?: {
    lines: PreparedEvidenceOcrRecord[]
    words: PreparedEvidenceOcrRecord[]
  }
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
    model: 'r-1'
    importerVersion: string
    sourceFingerprint: string
    parseSettings: {
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

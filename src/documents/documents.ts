import {
  demoProject,
  type DocumentPage,
  type ProjectWorkspace,
} from '../demoProject/demoProject'
import typeCSubmittalEvidence from './generated/type-c-door-submittal-v1.json'
import virginiaFarmhouseEvidence from './generated/virginia-farmhouse-drawings-v1.json'
import {
  createDocumentSearch,
  type SearchProjectDocumentsInput,
} from './documentSearch'
import {
  validatePreparedEvidenceArtifacts,
  type PreparedEvidenceArtifact,
  type PreparedEvidencePage,
} from './preparedEvidence'

export type InspectDocumentEvidenceInput =
  | {
      documentId: string
      documentVersionId: string
      pageIds: string[]
    }
  | {
      documentId: string
      documentVersionId: string
      blockIds: string[]
    }

const preparedEvidenceArtifacts: unknown = [
  virginiaFarmhouseEvidence,
  typeCSubmittalEvidence,
]

interface CreateDocumentsOptions {
  project?: ProjectWorkspace
  artifacts?: unknown
}

function catalogPageReference(page: DocumentPage) {
  return {
    id: page.id,
    label: page.label,
    number: page.number,
    ...(page.sheetNumber ? { sheetNumber: page.sheetNumber } : {}),
    title: page.title,
  }
}

function inspectPage(
  page: PreparedEvidencePage,
  selectedBlockIds?: Set<string>,
) {
  const blocks = selectedBlockIds
    ? page.blocks.filter((block) => selectedBlockIds.has(block.id))
    : page.blocks
  const parentIds = new Set(blocks.map((block) => block.id))
  return {
    page: page.page,
    blocks,
    tableRows: page.tableRows.filter((row) => parentIds.has(row.parentBlockId)),
    ...(page.lowLevelOcr ? { lowLevelOcr: page.lowLevelOcr } : {}),
  }
}

function inspectionResult(
  artifact: PreparedEvidenceArtifact,
  pages: ReturnType<typeof inspectPage>[],
) {
  return {
    document: artifact.document,
    source: artifact.source,
    provenance: artifact.provenance,
    pages,
  }
}

function requireUniqueSelection(ids: string[], kind: 'page' | 'block') {
  if (ids.length === 0) throw new Error(`At least one ${kind} identity is required.`)
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Requested ${kind} identities must be unique.`)
  }
}

export function createDocuments({
  project = demoProject,
  artifacts: artifactSource = preparedEvidenceArtifacts,
}: CreateDocumentsOptions = {}) {
  const artifacts = validatePreparedEvidenceArtifacts(
    artifactSource,
    project.documents,
  )
  const searchDocuments = createDocumentSearch(artifacts)

  return {
    describeProject: () => ({
      id: project.id,
      title: project.title,
      description: project.description,
    }),
    list: () => project.documents.map((document) => ({
      id: document.id,
      versionId: document.versionId,
      kind: document.kind,
      title: document.title,
      description: document.description,
      pageCount: document.pages.length,
      pages: document.pages.map(catalogPageReference),
    })),
    search(input: SearchProjectDocumentsInput) {
      return searchDocuments(input)
    },
    inspectEvidence(input: InspectDocumentEvidenceInput) {
      const artifact = artifacts.find(
        (candidate) =>
          candidate.document.id === input.documentId &&
          candidate.document.versionId === input.documentVersionId,
      )
      if (!artifact) {
        throw new Error('The document version does not exist in this Project Workspace.')
      }

      if ('pageIds' in input) {
        requireUniqueSelection(input.pageIds, 'page')
        const selectedPageIds = new Set(input.pageIds)
        for (const pageId of selectedPageIds) {
          if (!artifact.pages.some((page) => page.page.id === pageId)) {
            throw new Error('A requested page does not belong to the document version.')
          }
        }
        return inspectionResult(
          artifact,
          artifact.pages
            .filter((page) => selectedPageIds.has(page.page.id))
            .map((page) => inspectPage(page)),
        )
      }

      requireUniqueSelection(input.blockIds, 'block')
      const selectedBlockIds = new Set(input.blockIds)
      const availableBlockIds = new Set(
        artifact.pages.flatMap((page) => page.blocks.map((block) => block.id)),
      )
      for (const blockId of selectedBlockIds) {
        if (!availableBlockIds.has(blockId)) {
          throw new Error('A requested block does not belong to the document version.')
        }
      }
      return inspectionResult(
        artifact,
        artifact.pages
          .filter((page) =>
            page.blocks.some((block) => selectedBlockIds.has(block.id)),
          )
          .map((page) => inspectPage(page, selectedBlockIds)),
      )
    },
  }
}

import {
  demoProject,
  type DocumentPage,
  type ProjectWorkspace,
} from '../demoProject/demoProject'
import {
  createDocumentSearch,
  type SearchProjectDocumentsInput,
} from './documentSearch'
import {
  validatePreparedEvidenceArtifacts,
  type PreparedEvidenceArtifact,
  type PreparedEvidenceBlock,
  type PreparedEvidencePage,
} from './preparedEvidence'

export interface ResolvedCurrentDocumentBlock {
  block: Pick<PreparedEvidenceBlock, 'id' | 'classification' | 'region'>
  document: PreparedEvidenceArtifact['document']
  page: PreparedEvidencePage['page']
}

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

const preparedEvidenceArtifactsByPath = import.meta.glob(
  './generated/*.json',
  { eager: true, import: 'default' },
) as Record<string, unknown>

interface CreateDocumentsOptions {
  project?: ProjectWorkspace
  artifacts?: unknown
}

function preparedArtifactsFor(project: ProjectWorkspace) {
  return project.documents.flatMap((document) => {
    const artifact = preparedEvidenceArtifactsByPath[
      `./generated/${document.versionId}.json`
    ]
    return artifact === undefined ? [] : [artifact]
  })
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
  artifacts: artifactSource,
}: CreateDocumentsOptions = {}) {
  const artifacts = validatePreparedEvidenceArtifacts(
    artifactSource ?? preparedArtifactsFor(project),
    project.documents,
  )
  const searchDocuments = createDocumentSearch(artifacts)

  return {
    count: () => project.documents.length,
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
    resolveCurrentBlock(
      documentId: string,
      blockId: string,
    ): ResolvedCurrentDocumentBlock {
      const artifact = artifacts.find(
        (candidate) => candidate.document.id === documentId,
      )
      const owningPage = artifact?.pages.find((page) =>
        page.blocks.some((block) => block.id === blockId),
      )
      const block = owningPage?.blocks.find(
        (candidate) => candidate.id === blockId,
      )
      if (!artifact || !owningPage || !block) {
        throw new Error(
          'The block does not belong to the current Project Document.',
        )
      }
      return {
        document: artifact.document,
        page: owningPage.page,
        block: {
          id: block.id,
          classification: block.classification,
          region: block.region,
        },
      }
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

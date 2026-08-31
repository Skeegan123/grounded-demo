import { demoProject } from '../demoProject/demoProject'
import preparedDocumentIndexes from './generated/demoProjectIndexes.json'
import {
  validateDocumentIndexes,
  type DocumentIndex,
} from './documentIndex'

export interface InspectDocumentTextInput {
  documentId: string
  documentVersionId: string
  pageIds: string[]
}

function pageReference(page: DocumentIndex['pages'][number]['page']) {
  return {
    id: page.id,
    label: page.label,
    number: page.number,
    ...(page.sheetNumber ? { sheetNumber: page.sheetNumber } : {}),
    title: page.title,
  }
}

export function createDocuments(indexSource: unknown = preparedDocumentIndexes) {
  const indexes = validateDocumentIndexes(indexSource, demoProject.documents)

  return {
    describeProject: () => ({
      id: demoProject.id,
      title: demoProject.title,
      description: demoProject.description,
    }),
    list: () => demoProject.documents,
    inspectText(input: InspectDocumentTextInput) {
      const index = indexes.find(
        (candidate) =>
          candidate.documentId === input.documentId &&
          candidate.documentVersionId === input.documentVersionId,
      )
      if (!index) {
        throw new Error('The document version does not exist in this Project Workspace.')
      }
      if (input.pageIds.length === 0) {
        throw new Error('At least one page identity is required.')
      }

      const pages = input.pageIds.map((pageId) => {
        const page = index.pages.find((candidate) => candidate.page.id === pageId)
        if (!page) {
          throw new Error('A requested page does not belong to the document version.')
        }

        return {
          page: pageReference(page.page),
          width: page.width,
          height: page.height,
          rotation: page.rotation,
          status: page.status,
          ...(page.failure ? { failure: page.failure } : {}),
          text: page.runs.map((run) => run.text).join('\n'),
          runs: page.runs,
        }
      })

      return {
        document: { id: index.documentId, versionId: index.documentVersionId },
        extractor: index.extractor,
        pages,
      }
    },
  }
}

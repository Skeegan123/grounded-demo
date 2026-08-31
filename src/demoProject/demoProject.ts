import demoProjectManifest from './demoProjectManifest.json'

export interface DocumentPage {
  id: string
  label: string
  number: number
  title: string
  sheetNumber?: string
  width: number
  height: number
  rotation: number
}

export interface ProjectDocument {
  id: string
  versionId: string
  kind: 'contract_drawings' | 'submittal_product_data'
  title: string
  description: string
  file: {
    name: string
    url: string
    byteSize: number
    sha256: string
    pageCount: number
  }
  pages: DocumentPage[]
}

function projectDocumentKind(kind: string): ProjectDocument['kind'] {
  if (kind === 'contract_drawings' || kind === 'submittal_product_data') {
    return kind
  }

  throw new Error(`Unsupported Demo Project document kind: ${kind}`)
}

export const demoProject: {
  id: string
  title: string
  description: string
  documents: ProjectDocument[]
} = {
  ...demoProjectManifest.projectWorkspace,
  documents: demoProjectManifest.documents.map((document) => ({
    ...document,
    kind: projectDocumentKind(document.kind),
    pages: document.pages.map((page) => ({ ...page })),
  })),
}

export function findDocument(documentId: string, versionId: string) {
  return demoProject.documents.find(
    (document) =>
      document.id === documentId && document.versionId === versionId,
  )
}

export function findPage(documentId: string, pageId: string) {
  return demoProject.documents
    .find((document) => document.id === documentId)
    ?.pages.find((page) => page.id === pageId)
}

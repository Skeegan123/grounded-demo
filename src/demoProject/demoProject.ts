export interface DocumentPage {
  id: string
  label: string
  number: number
}

export interface ProjectDocument {
  id: string
  versionId: string
  title: string
  description: string
  pages: DocumentPage[]
}

export const demoProject = {
  id: 'virginia-farmhouse-door-review',
  title: 'Virginia Farmhouse — Door Submittal Review',
  documents: [
    {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
      title: 'Virginia Farmhouse Drawings',
      description: 'Construction drawing set',
      pages: [{ id: 'sheet-a1.2', label: 'A1.2', number: 3 }],
    },
    {
      id: 'type-c-door-submittal',
      versionId: 'type-c-door-submittal-v1',
      title: 'Type C Door Submittal',
      description: 'Product data',
      pages: [{ id: 'door-submittal-page-1', label: '1', number: 1 }],
    },
  ] satisfies ProjectDocument[],
} as const

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

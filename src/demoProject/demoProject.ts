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
  kind: string
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

export interface DocumentVersionReference {
  id: string
  versionId: string
}

export interface SupportingDocumentReference {
  documentId: string
  documentVersionId: string
  pageIds: string[]
}

export interface ProjectWorkspace {
  id: string
  title: string
  description: string
  documents: ProjectDocument[]
}

interface ProjectWorkspaceManifest {
  projectWorkspace: Omit<ProjectWorkspace, 'documents'>
  documents: ProjectDocument[]
}

function projectDocumentKind(kind: string) {
  if (kind.trim()) {
    return kind
  }

  throw new Error('Demo Project document kind must be a non-empty string.')
}

export function createProjectWorkspace(
  manifest: ProjectWorkspaceManifest,
): ProjectWorkspace {
  return {
    ...manifest.projectWorkspace,
    documents: manifest.documents.map((document) => ({
      ...document,
      kind: projectDocumentKind(document.kind),
      file: { ...document.file },
      pages: document.pages.map((page) => ({ ...page })),
    })),
  }
}

export const demoProject = createProjectWorkspace(demoProjectManifest)

export function findDocument(documentId: string, versionId: string) {
  return demoProject.documents.find(
    (document) =>
      document.id === documentId && document.versionId === versionId,
  )
}

export function findPage(
  document: DocumentVersionReference,
  pageId: string,
) {
  return findDocument(document.id, document.versionId)?.pages.find(
    (page) => page.id === pageId,
  )
}

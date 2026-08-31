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

const drawingPageDetails = new Map<number, Partial<DocumentPage>>([
  [6, { id: 'sheet-a1.2', label: 'A1.2', sheetNumber: 'A1.2', title: '1st Floor Plan' }],
  [24, { id: 'sheet-a4.3', label: 'A4.3', sheetNumber: 'A4.3', title: 'Doors & Windows' }],
])

const rotatedDrawingPages = new Set([1, 2, 3, 7])

const drawingPages: DocumentPage[] = Array.from({ length: 25 }, (_, index) => {
  const number = index + 1
  const details = drawingPageDetails.get(number)

  return {
    id: details?.id ?? `drawing-page-${number}`,
    label: details?.label ?? `PDF ${number}`,
    number,
    title: details?.title ?? `Drawing page ${number}`,
    ...(details?.sheetNumber ? { sheetNumber: details.sheetNumber } : {}),
    width: 1224,
    height: 792,
    rotation: rotatedDrawingPages.has(number) ? 270 : 0,
  }
})

export const demoProject: {
  id: string
  title: string
  description: string
  documents: ProjectDocument[]
} = {
  id: 'demo-virginia-farmhouse',
  title: 'Virginia Farmhouse Demo Project',
  description:
    'A Project Workspace for reviewing Type C interior door product data against the contract drawings.',
  documents: [
    {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
      kind: 'contract_drawings',
      title: 'Virginia Farmhouse drawing set',
      description: 'Complete 25-page contract drawing set',
      file: {
        name: 'virginia-farmhouse-drawing-set.pdf',
        url: '/demo-project/virginia-farmhouse-drawing-set.pdf',
        byteSize: 5_160_966,
        sha256: '2049cb0424de69c753e4345c2c87c4632cec75b0dd3ac0c8d1462f735c8a27af',
        pageCount: 25,
      },
      pages: drawingPages,
    },
    {
      id: 'type-c-door-submittal',
      versionId: 'type-c-door-submittal-v1',
      kind: 'submittal_product_data',
      title: 'Type C interior door product data and review cover',
      description: 'Two-page fictional product-data submittal',
      file: {
        name: 'type-c-door-submittal.pdf',
        url: '/demo-project/type-c-door-submittal.pdf',
        byteSize: 4_557,
        sha256: 'b8592a08c81af8605ed2994888213137bddac8d6e8c709be21318da93cb91658',
        pageCount: 2,
      },
      pages: [
        {
          id: 'door-submittal-page-1',
          label: '1',
          number: 1,
          title: 'Submittal cover',
          width: 612,
          height: 792,
          rotation: 0,
        },
        {
          id: 'door-submittal-page-2',
          label: '2',
          number: 2,
          title: 'Hollow-core flush wood door product data',
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    },
  ],
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

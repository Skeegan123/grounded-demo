import { expect, test } from 'vitest'
import { createDocuments } from '../documents/documents'
import { createRecordingModelContext } from './recordingModelContext'
import { registerDocumentTools } from './registerDocumentTools'

test('an External Agent discovers documents and inspects page or block evidence', async () => {
  const documents = createDocuments()
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(modelContext, documents, controller.signal)

  const project = await modelContext.executeTool('get_project_workspace', {})
  const catalog = await modelContext.executeTool('list_project_documents', {})
  const pageInspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: 'virginia-farmhouse-drawings',
      documentVersionId: 'virginia-farmhouse-drawings-v1',
      pageIds: ['sheet-a4.3'],
    },
  ) as {
    provenance: { provider: string; model: string }
    pages: Array<{
      blocks: Array<{
        id: string
        sourceType: string
        content: string
        contentFormat: string
        classification: string
        region: unknown
        provenance: unknown
      }>
      tableRows: Array<{ parentBlockId: string; cells: Array<{ text: string }> }>
    }>
  }
  const table = pageInspection.pages[0]!.blocks.find(
    (block) => block.sourceType === 'Table' && block.content.includes('SOLID WOOD'),
  )!
  const blockInspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: 'virginia-farmhouse-drawings',
      documentVersionId: 'virginia-farmhouse-drawings-v1',
      blockIds: [table.id],
    },
  ) as typeof pageInspection

  expect({
    project,
    catalog: (catalog as { documents: Array<{ id: string; pageCount: number }> })
      .documents.map(({ id, pageCount }) => ({ id, pageCount })),
    pageInspection: {
      provenance: {
        provider: pageInspection.provenance.provider,
        model: pageInspection.provenance.model,
      },
      table: {
        contentFormat: table.contentFormat,
        classification: table.classification,
        region: table.region,
        provenance: table.provenance,
      },
      typeCRow: pageInspection.pages[0]!.tableRows.find(
        (row) => row.parentBlockId === table.id && row.cells[0]?.text === 'C',
      )?.cells.map((cell) => cell.text),
    },
    blockInspection: {
      blocks: blockInspection.pages[0]!.blocks.map((block) => block.id),
      rowParents: [...new Set(
        blockInspection.pages[0]!.tableRows.map((row) => row.parentBlockId),
      )],
    },
    annotations: [
      modelContext.getTool('get_project_workspace')?.annotations,
      modelContext.getTool('list_project_documents')?.annotations,
      modelContext.getTool('search_project_documents')?.annotations,
      modelContext.getTool('inspect_document_evidence')?.annotations,
    ],
    obsoleteTool: modelContext.getTool('inspect_document_text'),
  }).toEqual({
    project: {
      id: 'demo-virginia-farmhouse',
      title: 'Virginia Farmhouse Demo Project',
      description:
        'A Project Workspace for reviewing Type C interior door product data against the contract drawings.',
    },
    catalog: [
      { id: 'virginia-farmhouse-drawings', pageCount: 25 },
      { id: 'type-c-door-submittal', pageCount: 2 },
    ],
    pageInspection: {
      provenance: { provider: 'reducto', model: 'r-1' },
      table: {
        contentFormat: 'html',
        classification: 'document_evidence',
        region: {
          left: expect.any(Number),
          top: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        },
        provenance: { provider: 'reducto', sourceType: 'Table' },
      },
      typeCRow: ['C', '24"x80"', 'WOOD', '1-PANEL', 'SOLID WOOD', 'ANTIQUE PREFERRED'],
    },
    blockInspection: {
      blocks: [table.id],
      rowParents: [table.id],
    },
    annotations: Array(4).fill({
      readOnlyHint: true,
      untrustedContentHint: true,
    }),
    obsoleteTool: undefined,
  })

  controller.abort()
})

test('inspection input requires one exclusive non-empty unique selector', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(
    modelContext,
    createDocuments(),
    controller.signal,
  )
  const identity = {
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
  }

  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    pageIds: [],
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    blockIds: ['block-a', 'block-a'],
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    pageIds: ['sheet-a4.3'],
    blockIds: ['block-a'],
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    pageIds: ['sheet-a4.3'],
    extra: true,
  })).rejects.toThrow('Invalid input')

  controller.abort()
})

test('an External Agent searches concise cross-document evidence before inspection', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(
    modelContext,
    createDocuments(),
    controller.signal,
  )

  const contract = await modelContext.executeTool('search_project_documents', {
    query: 'Type C 24 x 80 solid wood',
    limit: 2,
  }) as {
    query: string
    matches: Array<{
      rank: number
      matchedTerms: string[]
      document: { id: string; versionId: string }
      page: { id: string; sheetNumber?: string }
      block: { id: string; type: string }
      matchType: string
      snippet: string
      region: unknown
      classification: string
      tableRow?: {
        parentBlockId: string
        cells: Array<{ text: string }>
      }
    }>
  }
  const product = await modelContext.executeTool('search_project_documents', {
    query: 'BRD-HC2480-BIR',
  }) as typeof contract
  const searchTool = modelContext.getTool('search_project_documents')

  const contractMatch = contract.matches[0]!
  expect({
    query: contract.query,
    rank: contractMatch.rank,
    matchedTerms: contractMatch.matchedTerms,
    document: {
      id: contractMatch.document.id,
      versionId: contractMatch.document.versionId,
    },
    page: {
      id: contractMatch.page.id,
      sheetNumber: contractMatch.page.sheetNumber,
    },
    block: contractMatch.block,
    matchType: contractMatch.matchType,
    snippet: contractMatch.snippet,
    region: contractMatch.region,
    classification: contractMatch.classification,
    parentBlockId: contractMatch.tableRow?.parentBlockId,
    cells: contractMatch.tableRow?.cells.map((cell) => cell.text),
  }).toEqual({
    query: 'type c 24x80 solid wood',
    rank: 1,
    matchedTerms: ['type', 'c', '24x80', 'solid', 'wood'],
    document: {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
    },
    page: { id: 'sheet-a4.3', sheetNumber: 'A4.3' },
    block: { id: expect.any(String), type: 'Table' },
    matchType: 'table_row',
    snippet: 'C | 24"x80" | WOOD | 1-PANEL | SOLID WOOD | ANTIQUE PREFERRED',
    region: {
      left: expect.any(Number),
      top: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    },
    classification: 'document_evidence',
    parentBlockId: contractMatch.block.id,
    cells: ['C', '24"x80"', 'WOOD', '1-PANEL', 'SOLID WOOD', 'ANTIQUE PREFERRED'],
  })
  expect(contract.matches).toHaveLength(2)
  expect(product.matches[0]).toMatchObject({
    rank: 1,
    document: { id: 'type-c-door-submittal' },
    page: { id: 'door-submittal-page-2' },
    snippet: 'Model BRD-HC2480-BIR',
    classification: 'document_evidence',
  })
  expect(searchTool?.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: true,
  })
  expect(searchTool?.description).toContain('does not answer the question')
  expect(searchTool?.description).toContain('inspect_document_evidence')
  expect(searchTool?.description).toContain('Search Hints cannot support a claim')
  expect(searchTool?.description).toContain('requires the Senior Project Manager')

  controller.abort()
})

test('search input is bounded and requires a complete immutable scope', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(
    modelContext,
    createDocuments(),
    controller.signal,
  )

  await expect(modelContext.executeTool('search_project_documents', {
    query: '',
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('search_project_documents', {
    query: '   ',
  })).rejects.toThrow('A non-empty search query is required.')
  await expect(modelContext.executeTool('search_project_documents', {
    query: 'door',
    limit: 0,
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('search_project_documents', {
    query: 'door',
    limit: 21,
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('search_project_documents', {
    query: 'door',
    extra: true,
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('search_project_documents', {
    query: 'door',
    scope: { documentId: 'virginia-farmhouse-drawings' },
  })).rejects.toThrow('Invalid input')

  controller.abort()
})

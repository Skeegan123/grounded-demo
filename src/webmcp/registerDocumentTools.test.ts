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
    annotations: Array(3).fill({
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

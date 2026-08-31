import { expect, test } from 'vitest'
import { createDocuments } from '../documents/documents'
import { createRecordingModelContext } from './recordingModelContext'
import { registerDocumentTools } from './registerDocumentTools'

test('an External Agent discovers the Project Workspace documents and inspects prepared page text', async () => {
  const documents = createDocuments()
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(modelContext, documents, controller.signal)

  const project = await modelContext.executeTool('get_project_workspace', {})
  const catalog = await modelContext.executeTool('list_project_documents', {})
  const inspection = await modelContext.executeTool('inspect_document_text', {
    documentId: 'type-c-door-submittal',
    documentVersionId: 'type-c-door-submittal-v1',
    pageIds: ['door-submittal-page-2'],
  })

  expect({
    project,
    catalog: (catalog as { documents: Array<{ id: string; pageCount: number }> })
      .documents.map(({ id, pageCount }) => ({ id, pageCount })),
    inspection: {
      document: (inspection as { document: unknown }).document,
      page: (inspection as { pages: Array<{ page: unknown }> }).pages[0]?.page,
      text: (inspection as { pages: Array<{ text: string }> }).pages[0]?.text,
    },
    annotations: [
      modelContext.getTool('get_project_workspace')?.annotations,
      modelContext.getTool('list_project_documents')?.annotations,
      modelContext.getTool('inspect_document_text')?.annotations,
    ],
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
    inspection: {
      document: {
        id: 'type-c-door-submittal',
        versionId: 'type-c-door-submittal-v1',
      },
      page: {
        id: 'door-submittal-page-2',
        label: '2',
        number: 2,
        title: 'Hollow-core flush wood door product data',
      },
      text: expect.stringContaining('Hollow honeycomb core'),
    },
    annotations: Array(3).fill({
      readOnlyHint: true,
      untrustedContentHint: true,
    }),
  })

  controller.abort()
})

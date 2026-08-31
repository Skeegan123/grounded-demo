import { Type } from '@sinclair/typebox'
import type { createDocuments } from '../documents/documents'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const EmptyInput = Type.Object({}, { additionalProperties: false })

const InspectDocumentTextInput = Type.Object(
  {
    documentId: Type.String({ minLength: 1 }),
    documentVersionId: Type.String({ minLength: 1 }),
    pageIds: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
)

export function registerDocumentTools(
  modelContext: ModelContextAdapter,
  documents: ReturnType<typeof createDocuments>,
  signal: AbortSignal,
) {
  const tools = [
    defineTool({
      name: 'get_project_workspace',
      title: 'Get the Project Workspace',
      description:
        'Introduce this Demo Project and its purpose before inspecting its immutable documents.',
      schema: EmptyInput,
      readOnly: true,
      execute: () => documents.describeProject(),
    }),
    defineTool({
      name: 'list_project_documents',
      title: 'List Project Workspace documents',
      description:
        'List immutable document versions and stable page or sheet references without changing the visible workspace.',
      schema: EmptyInput,
      readOnly: true,
      execute: () => ({
        documents: documents.list().map((document) => ({
          id: document.id,
          versionId: document.versionId,
          kind: document.kind,
          title: document.title,
          description: document.description,
          pageCount: document.pages.length,
          pages: document.pages.map((page) => ({
            id: page.id,
            label: page.label,
            number: page.number,
            ...(page.sheetNumber ? { sheetNumber: page.sheetNumber } : {}),
            title: page.title,
          })),
        })),
      }),
    }),
    defineTool({
      name: 'inspect_document_text',
      title: 'Inspect prepared document text',
      description:
        'Return prepared positioned text for specified stable page identities in one immutable document version.',
      schema: InspectDocumentTextInput,
      readOnly: true,
      execute: (input) => documents.inspectText(input),
    }),
  ]

  return Promise.all(
    tools.map((tool) => modelContext.registerTool(tool, { signal })),
  )
}

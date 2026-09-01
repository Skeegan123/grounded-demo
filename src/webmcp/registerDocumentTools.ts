import { Type } from '@sinclair/typebox'
import type { createDocuments } from '../documents/documents'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const EmptyInput = Type.Object({}, { additionalProperties: false })

const InspectDocumentEvidenceInput = Type.Union(
  [
    Type.Object(
      {
        documentId: Type.String({ minLength: 1 }),
        documentVersionId: Type.String({ minLength: 1 }),
        pageIds: Type.Array(Type.String({ minLength: 1 }), {
          minItems: 1,
          uniqueItems: true,
        }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        documentId: Type.String({ minLength: 1 }),
        documentVersionId: Type.String({ minLength: 1 }),
        blockIds: Type.Array(Type.String({ minLength: 1 }), {
          minItems: 1,
          uniqueItems: true,
        }),
      },
      { additionalProperties: false },
    ),
  ],
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
        documents: documents.list(),
      }),
    }),
    defineTool({
      name: 'inspect_document_evidence',
      title: 'Inspect prepared Document Evidence',
      description:
        'Inspect complete pages or selected blocks from one immutable document version without changing the visible workspace. Results distinguish source-derived Document Evidence from generated Search Hints, which can locate content but cannot support a claim by themselves.',
      schema: InspectDocumentEvidenceInput,
      readOnly: true,
      execute: (input) => documents.inspectEvidence(input),
    }),
  ]

  return Promise.all(
    tools.map((tool) => modelContext.registerTool(tool, { signal })),
  )
}

import { Type } from '@sinclair/typebox'
import type { createDocuments } from '../documents/documents'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const EmptyInput = Type.Object({}, { additionalProperties: false })
const InspectionIdentifier = Type.String({ minLength: 1, maxLength: 200 })
const MAX_INSPECTION_RESPONSE_BYTES = 512 * 1024

const SearchProjectDocumentsInput = Type.Object(
  {
    query: Type.String({ minLength: 1, maxLength: 300 }),
    scope: Type.Optional(Type.Object(
      {
        documentId: Type.String({ minLength: 1 }),
        documentVersionId: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    )),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  },
  { additionalProperties: false },
)

const InspectDocumentEvidenceInput = Type.Union(
  [
    Type.Object(
      {
        documentId: InspectionIdentifier,
        documentVersionId: InspectionIdentifier,
        pageIds: Type.Array(InspectionIdentifier, {
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
        }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        documentId: InspectionIdentifier,
        documentVersionId: InspectionIdentifier,
        blockIds: Type.Array(InspectionIdentifier, {
          minItems: 1,
          maxItems: 50,
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
      name: 'search_project_documents',
      title: 'Search Project Workspace documents',
      description:
        'Locate concise prepared-content matches across immutable Project Workspace documents. Search locates evidence and does not answer the question; follow a match with inspect_document_evidence for full context. Search Hints cannot support a claim, and visual interpretation, selection, measurement, or counting requires the Senior Project Manager.',
      schema: SearchProjectDocumentsInput,
      readOnly: true,
      execute: (input) => documents.search(input),
    }),
    defineTool({
      name: 'inspect_document_evidence',
      title: 'Inspect prepared Document Evidence',
      description:
        'Inspect prepared page evidence or selected blocks from one immutable document version without changing the visible workspace. Page results include semantic blocks and table rows while omitting the stored low-level word and line OCR. Results distinguish source-derived Document Evidence from generated Search Hints, which can locate content but cannot support a claim by themselves.',
      schema: InspectDocumentEvidenceInput,
      readOnly: true,
      includeValidationIssueMessage: true,
      execute: (input) => {
        const result = documents.inspectEvidence(input)
        const agentResult = {
          ...result,
          pages: result.pages.map((page) => ({
            page: page.page,
            blocks: page.blocks,
            tableRows: page.tableRows,
          })),
        }
        const serialized = JSON.stringify(agentResult)
        const byteLength = new TextEncoder().encode(serialized).byteLength
        if (byteLength > MAX_INSPECTION_RESPONSE_BYTES) {
          throw new Error(
            'Inspection response exceeds 512 KiB. Narrow the pageIds or blockIds selectors and retry.',
          )
        }
        return agentResult
      },
    }),
  ]

  return Promise.all(
    tools.map((tool) => modelContext.registerTool(tool, { signal })),
  )
}

import { Type } from '@sinclair/typebox'
import type { createDocuments } from '../documents/documents'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const EmptyInput = Type.Object({}, { additionalProperties: false })
const inspectionIdentifier = (description: string) => Type.String({
  minLength: 1,
  maxLength: 200,
  description,
})
const MAX_INSPECTION_RESPONSE_BYTES = 512 * 1024

const SearchProjectDocumentsInput = Type.Object(
  {
    query: Type.String({
      minLength: 1,
      maxLength: 300,
      description:
        'A construction phrase, identifier, note, schedule entry, or requirement to search for in prepared evidence.',
    }),
    scope: Type.Optional(Type.Object(
      {
        documentId: Type.String({
          minLength: 1,
          description: 'The immutable document ID for the optional search scope.',
        }),
        documentVersionId: Type.String({
          minLength: 1,
          description:
            'The immutable version ID paired with scope.documentId.',
        }),
      },
      {
        additionalProperties: false,
        description:
          'Optional immutable document/version pair copied exactly from list_project_documents or another tool result.',
      },
    )),
    limit: Type.Optional(Type.Integer({
      minimum: 1,
      maximum: 20,
      description: 'Maximum matches to return, from 1 through 20.',
    })),
  },
  { additionalProperties: false },
)

const InspectDocumentEvidenceInput = Type.Union(
  [
    Type.Object(
      {
        documentId: inspectionIdentifier(
          'The immutable document ID copied exactly from the document catalog or search result.',
        ),
        documentVersionId: inspectionIdentifier(
          'The immutable version ID paired with documentId.',
        ),
        pageIds: Type.Array(inspectionIdentifier(
          'A page ID returned by the document catalog or search.',
        ), {
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          description:
            'One to five page IDs returned by the document catalog or search, used to inspect complete page-level evidence.',
        }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        documentId: inspectionIdentifier(
          'The immutable document ID copied exactly from the document catalog or search result.',
        ),
        documentVersionId: inspectionIdentifier(
          'The immutable version ID paired with documentId.',
        ),
        blockIds: Type.Array(inspectionIdentifier(
          'An exact semantic block ID returned by search.',
        ), {
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
          description:
            'One to fifty exact semantic block IDs returned by search, used for focused inspection.',
        }),
      },
      { additionalProperties: false },
    ),
  ],
  { type: 'object' },
)

export function registerDocumentTools(
  modelContext: ModelContextAdapter,
  documents: ReturnType<typeof createDocuments>,
  signal: AbortSignal,
) {
  const tools = [
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
        'Locate concise prepared-content matches across immutable Project Workspace documents. Search does not answer the question; follow matches with inspect_document_evidence before relying on them. For a direct visual comparison, navigate to the exact blocks and inspect them. Search Hints cannot support a claim; interpreting drawings, symbols, linework, measurements, or counts requires the Human Reviewer.',
      schema: SearchProjectDocumentsInput,
      readOnly: true,
      execute: (input) => documents.search(input),
    }),
    defineTool({
      name: 'inspect_document_evidence',
      title: 'Inspect prepared Document Evidence',
      description:
        'Inspect prepared evidence from one immutable document version without changing the visible workspace. Results include semantic blocks, table rows, and normalized regions. For a direct visual comparison, navigate to the exact relevant blocks and inspect them first. An obvious isolated difference may be reported as an External Agent observation. Ask a Human Reviewer to confirm uncertainty and always use one for interpreting drawings, symbols, linework, measurements, or counts.',
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

import { Type } from '@sinclair/typebox'
import type { DocumentNavigator } from '../documents/DocumentNavigator'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const navigationIdentifier = (description: string) => Type.String({
  minLength: 1,
  maxLength: 200,
  description,
})

const documentRegion = Type.Object(
  {
    left: Type.Number({ minimum: 0, maximum: 1 }),
    top: Type.Number({ minimum: 0, maximum: 1 }),
    width: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
    height: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
)

const NavigateDocumentInput = Type.Object(
  {
    documentId: navigationIdentifier(
      'The stable Project Document ID copied exactly from list_project_documents or another tool result. Grounded resolves its currently accessible immutable version.',
    ),
    target: Type.Optional(Type.Union([
      Type.Object(
        {
          type: Type.Literal('page'),
          pageId: navigationIdentifier(
            'The stable page ID copied exactly from the current Project Document catalog or another tool result.',
          ),
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          type: Type.Literal('block'),
          blockId: navigationIdentifier(
            'A stable semantic block ID copied exactly from search_project_documents or inspect_document_evidence. Grounded resolves its owning page and Document Region within the current Project Document.',
          ),
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          type: Type.Literal('region'),
          pageId: navigationIdentifier(
            'The stable page ID that owns this normalized Document Region.',
          ),
          region: documentRegion,
        },
        { additionalProperties: false },
      ),
    ], {
      description:
        'Optional Document Destination. Use page for whole-sheet context, block for a known schedule row, diagram, note, or detail, and region for an exact normalized area. Omit to show the document\'s current page.',
    })),
  },
  { additionalProperties: false },
)

export function registerDocumentNavigationTool(
  modelContext: ModelContextAdapter,
  navigator: DocumentNavigator,
  signal: AbortSignal,
) {
  return modelContext.registerTool(defineTool({
    name: 'navigate_document',
    title: 'Navigate to a Project Document destination',
    description:
      'Navigate the visible Document Browsing workbench to the current Project Document, page, semantic block, or normalized Document Region. Use a page for whole-sheet context. Prefer a block when search or inspection found a schedule row, diagram, note, or detail relevant to the current visual comparison. Block and region targets fit and transiently outline the resolved region without selecting or annotating it.',
    schema: NavigateDocumentInput,
    readOnly: false,
    includeValidationIssueMessage: true,
    execute: (input, context) => navigator.navigate(input, context),
  }), { signal })
}

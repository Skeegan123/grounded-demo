import { Type } from '@sinclair/typebox'
import type { DocumentNavigator } from '../documents/DocumentNavigator'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const navigationIdentifier = (description: string) => Type.String({
  minLength: 1,
  maxLength: 200,
  description,
})

const NavigateDocumentInput = Type.Object(
  {
    documentId: navigationIdentifier(
      'The stable Project Document ID copied exactly from list_project_documents or another tool result. Grounded resolves its currently accessible immutable version.',
    ),
    target: Type.Optional(Type.Object(
      {
        type: Type.Literal('page'),
        pageId: navigationIdentifier(
          'The stable page ID copied exactly from the current Project Document catalog or another tool result.',
        ),
      },
      { additionalProperties: false },
    )),
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
      'Navigate the visible Document Browsing workbench to the current Project Document and, optionally, one stable page. The command returns only after the requested page is visibly rendered with ordinary full-page fit and does not change Assistance state or add highlighting.',
    schema: NavigateDocumentInput,
    readOnly: false,
    includeValidationIssueMessage: true,
    execute: (input) => navigator.navigate(input),
  }), { signal })
}

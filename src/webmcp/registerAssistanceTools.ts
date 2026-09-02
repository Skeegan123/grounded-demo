import { Type } from '@sinclair/typebox'
import {
  ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT,
  ASSISTANCE_QUESTION_CHARACTER_LIMIT,
  ASSISTANCE_RECOMMENDED_PAGE_LIMIT,
  ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT,
  ASSISTANCE_SUPPORTING_PAGE_LIMIT,
  type createAssistance,
} from '../assistance/assistance'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const assistanceIdentifier = (description: string) => Type.String({
  minLength: 1,
  maxLength: ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT,
  description,
})

const AssistanceQuestion = Type.String({
  minLength: 1,
  maxLength: ASSISTANCE_QUESTION_CHARACTER_LIMIT,
  pattern: '\\S',
  description:
    'One focused construction judgment or clarification for the Senior Project Manager.',
})

const RESPONSE_TYPE_DESCRIPTION =
  'Use point_set when the response should identify marked document locations; use text for a plain-text response.'

const SupportingDocumentReference = Type.Object(
  {
    documentId: assistanceIdentifier(
      'The immutable supporting evidence document ID.',
    ),
    documentVersionId: assistanceIdentifier(
      'The immutable supporting evidence version paired with documentId.',
    ),
    pageIds: Type.Array(assistanceIdentifier(
      'A page ID in the supporting document version.',
    ), {
      minItems: 1,
      maxItems: ASSISTANCE_SUPPORTING_PAGE_LIMIT,
      uniqueItems: true,
      description:
        'One to twenty-five page IDs in the supporting document version that support the judgment.',
    }),
  },
  { additionalProperties: false },
)

const CreatePointSetAssistanceRequestInput = Type.Object(
  {
    question: AssistanceQuestion,
    responseType: Type.Literal('point_set', {
      description: RESPONSE_TYPE_DESCRIPTION,
    }),
    documentId: assistanceIdentifier(
      'The immutable document ID on which a returned Point Set should be placed.',
    ),
    documentVersionId: assistanceIdentifier(
      'The immutable document version on which a returned Point Set should be placed.',
    ),
    recommendedPageIds: Type.Array(assistanceIdentifier(
      'A suggested starting page ID in the Point Set target document.',
    ), {
      maxItems: ASSISTANCE_RECOMMENDED_PAGE_LIMIT,
      uniqueItems: true,
      description:
        'Suggested starting pages for review, not a restriction on where the final response may point.',
    }),
    supportingDocumentReferences: Type.Optional(
      Type.Array(SupportingDocumentReference, {
        minItems: 1,
        maxItems: ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT,
        description:
          'Immutable document and page references that support the judgment, distinct from the Point Set target document.',
      }),
    ),
  },
  { additionalProperties: false },
)

const CreateTextAssistanceRequestInput = Type.Object(
  {
    question: AssistanceQuestion,
    responseType: Type.Literal('text', {
      description: RESPONSE_TYPE_DESCRIPTION,
    }),
  },
  { additionalProperties: false },
)

const CreateAssistanceRequestInput = Type.Union([
  CreatePointSetAssistanceRequestInput,
  CreateTextAssistanceRequestInput,
])

const GetAssistanceRequestInput = Type.Object(
  {
    id: assistanceIdentifier(
      'The exact durable Assistance Request ID returned when the request was created.',
    ),
  },
  { additionalProperties: false },
)

export function registerAssistanceTools(
  modelContext: ModelContextAdapter,
  assistance: ReturnType<typeof createAssistance>,
  signal: AbortSignal,
) {
  const tools = [
    defineTool({
      name: 'create_assistance_request',
      title: 'Create an Assistance Request',
      description:
        'Queue one Assistance Request requiring a Point Set or text response from a Senior Project Manager. For a Point Set, include references to other immutable documents that support the requested judgment. Returns immediately with the durable request identity.',
      schema: CreateAssistanceRequestInput,
      readOnly: false,
      includeValidationIssueMessage: true,
      execute: (input) => assistance.createRequest(input),
    }),
    defineTool({
      name: 'get_assistance_request',
      title: 'Get an Assistance Request',
      description:
        'Retrieve one request from this Demo Session, including its final Professional Response when answered.',
      schema: GetAssistanceRequestInput,
      readOnly: true,
      includeValidationIssueMessage: true,
      execute: ({ id }) => assistance.getResult(id),
    }),
  ]

  return Promise.all(
    tools.map((tool) => modelContext.registerTool(tool, { signal })),
  )
}

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

const AssistanceIdentifier = Type.String({
  minLength: 1,
  maxLength: ASSISTANCE_IDENTIFIER_CHARACTER_LIMIT,
})

const AssistanceQuestion = Type.String({
  minLength: 1,
  maxLength: ASSISTANCE_QUESTION_CHARACTER_LIMIT,
  pattern: '\\S',
})

const SupportingDocumentReference = Type.Object(
  {
    documentId: AssistanceIdentifier,
    documentVersionId: AssistanceIdentifier,
    pageIds: Type.Array(AssistanceIdentifier, {
      minItems: 1,
      maxItems: ASSISTANCE_SUPPORTING_PAGE_LIMIT,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
)

const CreatePointSetAssistanceRequestInput = Type.Object(
  {
    question: AssistanceQuestion,
    responseType: Type.Literal('point_set'),
    documentId: AssistanceIdentifier,
    documentVersionId: AssistanceIdentifier,
    recommendedPageIds: Type.Array(AssistanceIdentifier, {
      maxItems: ASSISTANCE_RECOMMENDED_PAGE_LIMIT,
      uniqueItems: true,
    }),
    supportingDocumentReferences: Type.Optional(
      Type.Array(SupportingDocumentReference, {
        minItems: 1,
        maxItems: ASSISTANCE_SUPPORTING_DOCUMENT_LIMIT,
      }),
    ),
  },
  { additionalProperties: false },
)

const CreateTextAssistanceRequestInput = Type.Object(
  {
    question: AssistanceQuestion,
    responseType: Type.Literal('text'),
  },
  { additionalProperties: false },
)

const CreateAssistanceRequestInput = Type.Union([
  CreatePointSetAssistanceRequestInput,
  CreateTextAssistanceRequestInput,
])

const GetAssistanceRequestInput = Type.Object(
  { id: AssistanceIdentifier },
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
      execute: (input) => assistance.createRequest(input),
    }),
    defineTool({
      name: 'get_assistance_request',
      title: 'Get an Assistance Request',
      description:
        'Retrieve one request from this Demo Session, including its final Professional Response when answered.',
      schema: GetAssistanceRequestInput,
      readOnly: true,
      execute: ({ id }) => assistance.getResult(id),
    }),
  ]

  return Promise.all(
    tools.map((tool) => modelContext.registerTool(tool, { signal })),
  )
}

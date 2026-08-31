import { Type } from '@sinclair/typebox'
import type { createAssistance } from '../assistance/assistance'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const SupportingDocumentReference = Type.Object(
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

const CreatePointSetAssistanceRequestInput = Type.Object(
  {
    question: Type.String({ minLength: 1, pattern: '\\S' }),
    responseType: Type.Literal('point_set'),
    documentId: Type.String({ minLength: 1 }),
    documentVersionId: Type.String({ minLength: 1 }),
    recommendedPageIds: Type.Array(Type.String({ minLength: 1 })),
    supportingDocumentReferences: Type.Optional(
      Type.Array(SupportingDocumentReference, { minItems: 1 }),
    ),
  },
  { additionalProperties: false },
)

const CreateTextAssistanceRequestInput = Type.Object(
  {
    question: Type.String({ minLength: 1, pattern: '\\S' }),
    responseType: Type.Literal('text'),
  },
  { additionalProperties: false },
)

const CreateAssistanceRequestInput = Type.Union([
  CreatePointSetAssistanceRequestInput,
  CreateTextAssistanceRequestInput,
])

const GetAssistanceRequestInput = Type.Object(
  { id: Type.String({ minLength: 1 }) },
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

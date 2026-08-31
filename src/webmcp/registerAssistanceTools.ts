import { Type } from '@sinclair/typebox'
import type { createAssistance } from '../assistance/assistance'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const CreateAssistanceRequestInput = Type.Object(
  {
    question: Type.String({ minLength: 1, pattern: '\\S' }),
    responseType: Type.Literal('point_set'),
    documentId: Type.String({ minLength: 1 }),
    documentVersionId: Type.String({ minLength: 1 }),
    recommendedPageIds: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

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
      title: 'Create a Point Set Assistance Request',
      description:
        'Queue one request for a Senior Project Manager to mark points on an immutable document version. Returns immediately with the durable request identity.',
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

import { Type, type Static, type TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import type { createAssistance } from '../assistance/assistance'
import type { ModelContextAdapter, ModelContextTool } from './modelContext'

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

function validatedTool<Schema extends TSchema>(options: {
  name: string
  title: string
  description: string
  schema: Schema
  readOnly: boolean
  execute: (input: Static<Schema>) => Promise<unknown>
}): ModelContextTool {
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: options.schema,
    annotations: {
      readOnlyHint: options.readOnly,
      untrustedContentHint: true,
    },
    async execute(input) {
      if (!Value.Check(options.schema, input)) {
        const issue = Value.Errors(options.schema, input).First()
        throw new Error(`Invalid input${issue?.path ? ` at ${issue.path}` : ''}.`)
      }
      return options.execute(input as Static<Schema>)
    },
  }
}

export function registerAssistanceTools(
  modelContext: ModelContextAdapter,
  assistance: ReturnType<typeof createAssistance>,
  signal: AbortSignal,
) {
  const tools = [
    validatedTool({
      name: 'create_assistance_request',
      title: 'Create a Point Set Assistance Request',
      description:
        'Queue one request for a Senior Project Manager to mark points on an immutable document version. Returns immediately with the durable request identity.',
      schema: CreateAssistanceRequestInput,
      readOnly: false,
      execute: (input) => assistance.createRequest(input),
    }),
    validatedTool({
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

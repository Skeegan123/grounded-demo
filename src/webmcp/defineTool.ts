import { type Static, type TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import type { ModelContextTool } from './modelContext'

export function defineTool<Schema extends TSchema>(options: {
  name: string
  title: string
  description: string
  schema: Schema
  readOnly: boolean
  execute: (input: Static<Schema>) => Promise<unknown> | unknown
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

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
        const issues = Value.Errors(options.schema, input)
        const collectedIssues = [...issues]
        let issue = collectedIssues.find((candidate) => candidate.path)
        const variants = (options.schema as TSchema & { anyOf?: TSchema[] }).anyOf
        if (!issue && variants && input && typeof input === 'object') {
          const matchingVariant = variants.find((variant) => {
            const properties = (
              variant as TSchema & {
                properties?: Record<string, { const?: unknown }>
              }
            ).properties
            const constants = Object.entries(properties ?? {}).filter(
              ([, property]) => 'const' in property,
            )
            return (
              constants.length > 0 &&
              constants.every(
                ([key, property]) =>
                  key in input &&
                  (input as Record<string, unknown>)[key] === property.const,
              )
            )
          })
          if (matchingVariant) {
            issue = [...Value.Errors(matchingVariant, input)].find(
              (candidate) => candidate.path,
            )
          }
        }
        issue ??= collectedIssues[0]
        throw new Error(`Invalid input${issue?.path ? ` at ${issue.path}` : ''}.`)
      }
      return options.execute(input as Static<Schema>)
    },
  }
}

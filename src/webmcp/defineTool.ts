import { type Static, type TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import type { ModelContextTool } from './modelContext'

export function defineTool<Schema extends TSchema>(options: {
  name: string
  title: string
  description: string
  schema: Schema
  readOnly: boolean
  includeValidationIssueMessage?: boolean
  execute: (
    input: Static<Schema>,
    context?: { signal?: AbortSignal },
  ) => Promise<unknown> | unknown
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
    async execute(input, context) {
      if (!Value.Check(options.schema, input)) {
        const issues = Value.Errors(options.schema, input)
        const collectedIssues = [...issues]
        let issue = collectedIssues.find((candidate) => candidate.path)
        const variants = (options.schema as TSchema & { anyOf?: TSchema[] }).anyOf
        if (!issue && variants && input && typeof input === 'object') {
          const variantMatches = variants.map((variant) => {
            const properties = (
              variant as TSchema & {
                properties?: Record<string, { const?: unknown }>
              }
            ).properties ?? {}
            const constants = Object.entries(properties).filter(
              ([, property]) => 'const' in property,
            )
            return {
              constantsMatch:
                constants.length > 0 &&
                constants.every(
                  ([key, property]) =>
                    key in input &&
                    (input as Record<string, unknown>)[key] === property.const,
                ),
              matchingPropertyCount: Object.keys(properties).filter(
                (key) => key in input,
              ).length,
              variant,
            }
          })
          const constantMatch = variantMatches.find(
            ({ constantsMatch }) => constantsMatch,
          )
          const bestPropertyMatch = Math.max(
            ...variantMatches.map(({ matchingPropertyCount }) =>
              matchingPropertyCount,
            ),
          )
          const propertyMatches = variantMatches.filter(
            ({ matchingPropertyCount }) =>
              matchingPropertyCount === bestPropertyMatch,
          )
          const matchingVariant = constantMatch?.variant ?? (
            options.includeValidationIssueMessage &&
            bestPropertyMatch > 0 &&
            propertyMatches.length === 1
              ? propertyMatches[0]?.variant
              : undefined
          )
          if (matchingVariant) {
            issue = [...Value.Errors(matchingVariant, input)].find(
              (candidate) => candidate.path,
            )
          }
        }
        issue ??= collectedIssues[0]
        throw new Error(
          `Invalid input${issue?.path ? ` at ${issue.path}` : ''}.${
            options.includeValidationIssueMessage && issue?.message
              ? ` ${issue.message}.`
              : ''
          }`,
        )
      }
      return options.execute(input as Static<Schema>, context)
    },
  }
}

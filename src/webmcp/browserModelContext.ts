import type { ModelContextAdapter } from './modelContext'

export function createBrowserModelContext(): ModelContextAdapter | undefined {
  const browserModelContext = document.modelContext
  if (!browserModelContext) return undefined

  return {
    registerTool: (tool, options) =>
      browserModelContext.registerTool(tool, options),
  }
}

import type { ModelContextAdapter, ModelContextTool } from './modelContext'

export interface RecordingModelContext extends ModelContextAdapter {
  executeTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>
  getTool: (name: string) => ModelContextTool | undefined
  waitForTool: (name: string) => Promise<ModelContextTool>
}

export function createRecordingModelContext(): RecordingModelContext {
  const tools = new Map<string, ModelContextTool>()
  const waiters = new Map<string, Array<(tool: ModelContextTool) => void>>()

  return {
    async registerTool(tool, options) {
      tools.set(tool.name, tool)
      waiters.get(tool.name)?.forEach((resolve) => resolve(tool))
      waiters.delete(tool.name)
      options?.signal?.addEventListener(
        'abort',
        () => {
          if (tools.get(tool.name) === tool) tools.delete(tool.name)
        },
        { once: true },
      )
    },
    async executeTool(name, input) {
      const tool = tools.get(name)
      if (!tool) throw new Error(`WebMCP tool is not registered: ${name}`)
      return tool.execute(input)
    },
    getTool(name) {
      return tools.get(name)
    },
    waitForTool(name) {
      const existing = tools.get(name)
      if (existing) return Promise.resolve(existing)

      return new Promise((resolve) => {
        const namedWaiters = waiters.get(name) ?? []
        namedWaiters.push(resolve)
        waiters.set(name, namedWaiters)
      })
    },
  }
}

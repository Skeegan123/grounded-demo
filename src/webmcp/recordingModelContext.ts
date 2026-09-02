import type { ModelContextAdapter, ModelContextTool } from './modelContext'

export interface RecordingModelContext extends ModelContextAdapter {
  executeTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>
  getTool: (name: string) => ModelContextTool | undefined
  getToolNames: () => string[]
  waitForTool: (name: string) => Promise<ModelContextTool>
}

export interface RecordingRegistration {
  signal?: AbortSignal
  tool: ModelContextTool
}

interface RecordingModelContextOptions {
  registrationControl?: (
    registration: RecordingRegistration,
  ) => Promise<void> | void
}

export function createRecordingModelContext(
  options: RecordingModelContextOptions = {},
): RecordingModelContext {
  const tools = new Map<string, ModelContextTool>()
  const waiters = new Map<string, Array<(tool: ModelContextTool) => void>>()

  return {
    async registerTool(tool, registrationOptions) {
      await options.registrationControl?.({
        signal: registrationOptions?.signal,
        tool,
      })
      if (registrationOptions?.signal?.aborted) return

      tools.set(tool.name, tool)
      waiters.get(tool.name)?.forEach((resolve) => resolve(tool))
      waiters.delete(tool.name)
      registrationOptions?.signal?.addEventListener(
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
    getToolNames() {
      return [...tools.keys()]
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

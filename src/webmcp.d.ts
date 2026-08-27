declare global {
  interface WebMCPToolExecutionContext {
    signal?: AbortSignal
  }

  interface WebMCPTool {
    name: string
    title?: string
    description: string
    inputSchema?: Record<string, unknown>
    annotations?: {
      readOnlyHint?: boolean
      untrustedContentHint?: boolean
    }
    execute: (
      input: Record<string, unknown>,
      context?: WebMCPToolExecutionContext,
    ) => Promise<unknown>
  }

  interface WebMCPRegisteredTool {
    name: string
    title?: string
    description: string
    inputSchema?: string
    origin: string
    window: Window
  }

  interface WebMCPModelContext {
    registerTool: (
      tool: WebMCPTool,
      options?: { signal?: AbortSignal },
    ) => Promise<void>
    getTools: () => Promise<WebMCPRegisteredTool[]>
    executeTool: (
      tool: WebMCPRegisteredTool,
      input?: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ) => Promise<string>
  }

  interface Document {
    readonly modelContext?: WebMCPModelContext
  }
}

export {}

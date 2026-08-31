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

  interface WebMCPModelContext {
    registerTool: (
      tool: WebMCPTool,
      options?: { signal?: AbortSignal },
    ) => Promise<void>
  }

  interface Document {
    readonly modelContext?: WebMCPModelContext
  }
}

export {}

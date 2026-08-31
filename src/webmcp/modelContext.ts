export interface ModelContextTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: {
    readOnlyHint: boolean
    untrustedContentHint: boolean
  }
  execute: (
    input: Record<string, unknown>,
    context?: { signal?: AbortSignal },
  ) => Promise<unknown>
}

export interface ModelContextAdapter {
  registerTool: (
    tool: ModelContextTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>
}

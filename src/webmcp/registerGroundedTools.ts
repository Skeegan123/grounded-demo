import type { createAssistance } from '../assistance/assistance'
import type { createDocuments } from '../documents/documents'
import type { ModelContextAdapter } from './modelContext'
import { registerAssistanceTools } from './registerAssistanceTools'
import { registerDocumentTools } from './registerDocumentTools'

interface GroundedToolRegistration {
  assistance: ReturnType<typeof createAssistance>
  controller: AbortController
  documents: ReturnType<typeof createDocuments>
  modelContext: ModelContextAdapter
}

export async function registerGroundedTools({
  assistance,
  controller,
  documents,
  modelContext,
}: GroundedToolRegistration) {
  const registrations: Promise<void>[] = []
  const availability = { ready: false }
  controller.signal.addEventListener(
    'abort',
    () => {
      availability.ready = false
    },
    { once: true },
  )
  const trackedModelContext: ModelContextAdapter = {
    registerTool(tool, options) {
      const gatedTool = {
        ...tool,
        async execute(
          input: Record<string, unknown>,
          context?: { signal?: AbortSignal },
        ) {
          if (!availability.ready || controller.signal.aborted) {
            throw new Error('The Grounded WebMCP tool set is not ready.')
          }
          return tool.execute(input, context)
        },
      }
      let registration: Promise<void>
      try {
        registration = Promise.resolve(
          modelContext.registerTool(gatedTool, options),
        )
      } catch (error) {
        registration = Promise.reject(error)
      }
      registrations.push(registration)
      return registration
    },
  }

  const registrars = [
    registerAssistanceTools(
      trackedModelContext,
      assistance,
      controller.signal,
    ),
    registerDocumentTools(
      trackedModelContext,
      documents,
      controller.signal,
    ),
  ]

  try {
    await Promise.all(registrars)
    if (!controller.signal.aborted) availability.ready = true
  } catch (error) {
    controller.abort()
    await Promise.allSettled(registrations)
    throw error
  }
}

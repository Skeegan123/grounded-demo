import { Type } from '@sinclair/typebox'
import { defineTool } from './defineTool'
import type { ModelContextAdapter } from './modelContext'

const EmptyInput = Type.Object({}, { additionalProperties: false })
const QUESTION_PREVIEW_BYTE_LIMIT = 100

interface ProjectIdentity {
  id: string
  title: string
  description: string
  documentCount: number
}

interface DocumentBrowsingSelection {
  selectedDocument: {
    id: string
    versionId: string
  }
  selectedPage: {
    id: string
  }
}

interface AssistanceRequestState {
  id: string
  state: 'pending' | 'answered' | 'declined'
  responseType: 'point_set' | 'text'
  question: string
  createdAt: string
}

export interface ProjectWorkspaceSnapshotSource {
  readProject: () => ProjectIdentity
  readDocumentBrowsing: () => DocumentBrowsingSelection
  readAssistanceRequests: () => Promise<AssistanceRequestState[]>
}

function questionPreview(question: string) {
  const normalized = question.trim().replace(/\s+/g, ' ')
  const encoder = new TextEncoder()
  if (encoder.encode(normalized).byteLength <= QUESTION_PREVIEW_BYTE_LIMIT) {
    return normalized
  }

  const suffix = '…'
  const contentLimit =
    QUESTION_PREVIEW_BYTE_LIMIT - encoder.encode(suffix).byteLength
  let preview = ''
  let byteLength = 0
  for (const character of normalized) {
    const characterBytes = encoder.encode(character).byteLength
    if (byteLength + characterBytes > contentLimit) break
    preview += character
    byteLength += characterBytes
  }
  return `${preview}${suffix}`
}

function summarizeRequest(request: AssistanceRequestState) {
  return {
    id: request.id,
    state: request.state,
    responseType: request.responseType,
    createdAt: request.createdAt,
    questionPreview: questionPreview(request.question),
  }
}

export function registerProjectWorkspaceTool(
  modelContext: ModelContextAdapter,
  source: ProjectWorkspaceSnapshotSource,
  signal: AbortSignal,
) {
  return modelContext.registerTool(defineTool({
    name: 'get_project_workspace',
    title: 'Get the Project Workspace',
    description:
      'Return a fresh read-only snapshot of the current project, selected document and page, and resumable Assistance Request state.',
    schema: EmptyInput,
    readOnly: true,
    async execute() {
      const requests = await source.readAssistanceRequests()
      const pending = requests.filter((request) => request.state === 'pending')
      const completed = requests.filter((request) => request.state !== 'pending')
      const latestCompleted = completed.at(-1)

      return {
        project: source.readProject(),
        documentBrowsing: source.readDocumentBrowsing(),
        assistance: {
          pendingCount: pending.length,
          completedCount: completed.length,
          currentPending: pending[0] ? summarizeRequest(pending[0]) : null,
          latestCompleted: latestCompleted
            ? summarizeRequest(latestCompleted)
            : null,
        },
      }
    },
  }), { signal })
}

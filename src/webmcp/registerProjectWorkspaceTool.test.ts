import { expect, test } from 'vitest'
import { createRecordingModelContext } from './recordingModelContext'
import {
  type ProjectWorkspaceSnapshotSource,
  registerProjectWorkspaceTool,
} from './registerProjectWorkspaceTool'

test('returns a fresh bounded workspace snapshot through the public tool interface', async () => {
  const requests: Awaited<ReturnType<
    ProjectWorkspaceSnapshotSource['readAssistanceRequests']
  >> = [
    {
      id: 'c'.repeat(200),
      state: 'answered',
      responseType: 'text',
      question: `Was this answered? ${'🧱'.repeat(4_000)}`,
      createdAt: '2030-01-02T03:04:05.000Z',
    },
    {
      id: 'p'.repeat(200),
      state: 'pending',
      responseType: 'point_set',
      question: `Mark  every\nlocation ${'x'.repeat(4_000)}`,
      createdAt: '2030-01-02T03:05:06.000Z',
    },
  ]
  const source: ProjectWorkspaceSnapshotSource = {
    readProject: () => ({
      id: 'demo-virginia-farmhouse',
      title: 'Virginia Farmhouse Demo Project',
      description:
        'A Project Workspace for reviewing Type C interior door product data against the contract drawings.',
      documentCount: 2,
    }),
    readDocumentBrowsing: () => ({
      selectedDocument: {
        id: 'virginia-farmhouse-drawings',
        versionId: 'virginia-farmhouse-drawings-v1',
      },
      selectedPage: { id: 'sheet-a1.2' },
    }),
    readAssistanceRequests: async () => requests,
  }
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerProjectWorkspaceTool(modelContext, source, controller.signal)

  const first = await modelContext.executeTool('get_project_workspace', {}) as {
    assistance: {
      pendingCount: number
      completedCount: number
      currentPending: { questionPreview: string }
      latestCompleted: { questionPreview: string }
    }
  }
  expect(first.assistance).toMatchObject({
    pendingCount: 1,
    completedCount: 1,
    currentPending: {
      questionPreview: expect.stringMatching(/^Mark every location x+…$/),
    },
    latestCompleted: {
      questionPreview: expect.stringMatching(/^Was this answered\? 🧱+…$/u),
    },
  })
  expect(new TextEncoder().encode(
    first.assistance.currentPending.questionPreview,
  ).byteLength).toBe(100)
  expect(new TextEncoder().encode(
    first.assistance.latestCompleted.questionPreview,
  ).byteLength).toBeLessThanOrEqual(100)
  expect(new TextEncoder().encode(JSON.stringify(first)).byteLength)
    .toBeLessThanOrEqual(1_500)

  requests[1] = { ...requests[1]!, state: 'declined' }
  await expect(modelContext.executeTool('get_project_workspace', {}))
    .resolves.toMatchObject({
      assistance: {
        pendingCount: 0,
        completedCount: 2,
        currentPending: null,
        latestCompleted: {
          id: 'p'.repeat(200),
          state: 'declined',
          responseType: 'point_set',
        },
      },
    })

  controller.abort()
  expect(modelContext.getTool('get_project_workspace')).toBeUndefined()
})

test('preserves read-only annotations and rejects extra input', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerProjectWorkspaceTool(modelContext, {
    readProject: () => ({
      id: 'project',
      title: 'Project',
      description: 'Purpose',
      documentCount: 0,
    }),
    readDocumentBrowsing: () => ({
      selectedDocument: { id: 'document', versionId: 'version' },
      selectedPage: { id: 'page' },
    }),
    readAssistanceRequests: async () => [],
  }, controller.signal)

  expect(modelContext.getTool('get_project_workspace')?.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: true,
  })
  await expect(modelContext.executeTool('get_project_workspace', {
    extra: true,
  })).rejects.toThrow('Invalid input at /extra.')
})

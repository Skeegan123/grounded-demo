import { act, render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { PdfPageRenderer } from '../documents/PdfPageViewer'
import {
  createRecordingModelContext,
  type RecordingRegistration,
} from '../webmcp/recordingModelContext'
import { createGroundedApp } from './createGroundedApp'

const TOOL_NAMES = [
  'create_assistance_request',
  'get_assistance_request',
  'get_project_workspace',
  'inspect_document_evidence',
  'list_project_documents',
  'search_project_documents',
]

interface ControlledRegistration extends RecordingRegistration {
  reject: (error: Error) => void
  resolve: () => void
  settled: boolean
}

function createRegistrationHarness() {
  const registrations = new Map<string, ControlledRegistration>()
  const modelContext = createRecordingModelContext({
    registrationControl(registration) {
      return new Promise<void>((resolve, reject) => {
        registrations.set(registration.tool.name, {
          ...registration,
          reject(error) {
            registrations.get(registration.tool.name)!.settled = true
            reject(error)
          },
          resolve() {
            registrations.get(registration.tool.name)!.settled = true
            resolve()
          },
          settled: false,
        })
      })
    },
  })

  return {
    modelContext,
    registrations,
    reject(name: string, error: Error) {
      registrations.get(name)!.reject(error)
    },
    resolve(name: string) {
      registrations.get(name)!.resolve()
    },
    resolvePending() {
      for (const registration of registrations.values()) {
        if (!registration.settled) registration.resolve()
      }
    },
    async waitForAllRegistrations() {
      await waitFor(() => expect(registrations).toHaveLength(6))
    },
  }
}

const pageRenderer: PdfPageRenderer = {
  async renderPage({ canvas, height, width }) {
    canvas.height = height
    canvas.width = width
  },
  prefetchPages() {},
}

function appEnvironment(
  modelContext: ReturnType<typeof createRecordingModelContext>,
  databaseName = `grounded-registration-${crypto.randomUUID()}`,
) {
  return {
    createId: () => 'session-1',
    databaseName,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
  }
}

test('reports ready only after the shared attempt registers all six existing tools', async () => {
  const harness = createRegistrationHarness()
  render(createGroundedApp(appEnvironment(harness.modelContext)))

  await harness.waitForAllRegistrations()
  expect(screen.getByText('Registering tools')).toBeInTheDocument()
  expect(new Set(
    [...harness.registrations.values()].map(({ signal }) => signal),
  )).toHaveProperty('size', 1)

  await act(async () => {
    for (const name of TOOL_NAMES.slice(0, -1)) harness.resolve(name)
  })
  await waitFor(() => expect(harness.modelContext.getToolNames()).toHaveLength(5))
  expect(screen.getByText('Registering tools')).toBeInTheDocument()
  await expect(harness.modelContext.executeTool(
    'get_project_workspace',
    {},
  )).rejects.toThrow('The Grounded WebMCP tool set is not ready.')
  await expect(harness.modelContext.executeTool(
    'create_assistance_request',
    { question: 'Do not queue this before readiness.', responseType: 'text' },
  )).rejects.toThrow('The Grounded WebMCP tool set is not ready.')

  await act(async () => harness.resolve(TOOL_NAMES.at(-1)!))
  await screen.findByText('WebMCP ready')
  expect(harness.modelContext.getToolNames().sort()).toEqual(TOOL_NAMES)
  await expect(harness.modelContext.executeTool(
    'get_project_workspace',
    {},
  )).resolves.toEqual(expect.objectContaining({ id: 'demo-virginia-farmhouse' }))
})

test.each([
  'get_assistance_request',
  'inspect_document_evidence',
])('aborts when %s fails and waits for partial and late registrations to clean up before reporting it', async (failedTool) => {
  const harness = createRegistrationHarness()
  render(createGroundedApp(appEnvironment(harness.modelContext)))

  await harness.waitForAllRegistrations()
  await act(async () => {
    harness.resolve('create_assistance_request')
    harness.resolve('get_project_workspace')
  })
  await waitFor(() => expect(harness.modelContext.getToolNames()).toHaveLength(2))
  const partiallyRegisteredTool = harness.registrations.get(
    'get_project_workspace',
  )!.tool

  await act(async () => {
    harness.reject(
      failedTool,
      new Error(`${failedTool} registration failed.`),
    )
  })
  await waitFor(() => {
    expect(
      [...harness.registrations.values()].every(({ signal }) => signal?.aborted),
    ).toBe(true)
  })
  expect(harness.modelContext.getToolNames()).toEqual([])
  await expect(partiallyRegisteredTool.execute({})).rejects.toThrow(
    'The Grounded WebMCP tool set is not ready.',
  )
  expect(screen.queryByText('Registration failed')).not.toBeInTheDocument()

  await act(async () => harness.resolvePending())
  await screen.findByText('Registration failed')
  expect(screen.getByRole('alert')).toHaveTextContent(
    `${failedTool} registration failed.`,
  )
  expect(harness.modelContext.getToolNames()).toEqual([])
})

test('replacing an attempt aborts its partial surface and refuses its late registrations', async () => {
  const databaseName = `grounded-registration-replaced-${crypto.randomUUID()}`
  const first = createRegistrationHarness()
  const second = createRegistrationHarness()
  const view = render(
    createGroundedApp(appEnvironment(first.modelContext, databaseName)),
  )

  await first.waitForAllRegistrations()
  await act(async () => first.resolve('create_assistance_request'))
  const replacedTool = await first.modelContext.waitForTool(
    'create_assistance_request',
  )

  view.rerender(
    createGroundedApp(appEnvironment(second.modelContext, databaseName)),
  )
  await second.waitForAllRegistrations()
  expect(first.registrations.values().next().value?.signal?.aborted).toBe(true)
  expect(first.modelContext.getToolNames()).toEqual([])
  await expect(replacedTool.execute({
    question: 'Do not queue this from a replaced attempt.',
    responseType: 'text',
  })).rejects.toThrow('The Grounded WebMCP tool set is not ready.')

  await act(async () => {
    first.resolvePending()
    second.resolvePending()
  })
  await screen.findByText('WebMCP ready')
  expect(first.modelContext.getToolNames()).toEqual([])
  expect(second.modelContext.getToolNames().sort()).toEqual(TOOL_NAMES)
})

test('unmounting aborts the attempt and removes partial tools without late leaks', async () => {
  const harness = createRegistrationHarness()
  const view = render(createGroundedApp(appEnvironment(harness.modelContext)))

  await harness.waitForAllRegistrations()
  await act(async () => harness.resolve('get_project_workspace'))
  const unmountedTool = await harness.modelContext.waitForTool(
    'get_project_workspace',
  )

  view.unmount()
  expect(harness.registrations.values().next().value?.signal?.aborted).toBe(true)
  expect(harness.modelContext.getToolNames()).toEqual([])
  await expect(unmountedTool.execute({})).rejects.toThrow(
    'The Grounded WebMCP tool set is not ready.',
  )

  await act(async () => harness.resolvePending())
  expect(harness.modelContext.getToolNames()).toEqual([])
})

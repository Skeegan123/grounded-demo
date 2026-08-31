import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { createGroundedApp } from './createGroundedApp'
import { createRecordingModelContext } from '../webmcp/recordingModelContext'

const requestInput = {
  question: 'Mark every Type C door opening on the recommended drawing page.',
  responseType: 'point_set',
  documentId: 'virginia-farmhouse-drawings',
  documentVersionId: 'virginia-farmhouse-drawings-v1',
  recommendedPageIds: ['sheet-a1.2'],
} as const

function createIds(...ids: string[]) {
  let index = 0
  return () => ids[index++] ?? `unexpected-id-${index}`
}

test('an External Agent retrieves a durable Point Set after the Senior Project Manager responds and reloads', async () => {
  const user = userEvent.setup()
  const storage = window.sessionStorage
  const databaseName = `grounded-tracer-${crypto.randomUUID()}`
  const modelContext = createRecordingModelContext()
  const firstRender = render(
    createGroundedApp({
      databaseName,
      modelContext,
      sessionStorage: storage,
      createId: createIds('session-1', 'request-1'),
      now: () => new Date('2030-01-02T03:04:05.000Z'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', requestInput)

  await screen.findByRole('heading', { name: 'Current Assistance' })
  await screen.findByText(requestInput.question)
  screen.getByRole('heading', { name: 'Project Documents' })

  const drawingPage = screen.getByLabelText('Drawing page A1.2')
  Object.defineProperty(drawingPage, 'getBoundingClientRect', {
    value: () => ({
      bottom: 420,
      height: 400,
      left: 10,
      right: 210,
      top: 20,
      width: 200,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }),
  })
  fireEvent.click(drawingPage, { clientX: 110, clientY: 220 })
  await screen.findByText('1 point')
  await user.click(screen.getByRole('button', { name: 'Submit Point Set' }))
  await screen.findByText('No pending Assistance Requests')

  firstRender.unmount()

  const reloadedModelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName,
      modelContext: reloadedModelContext,
      sessionStorage: storage,
      createId: createIds('unused-session', 'unused-request'),
      now: () => new Date('2030-01-02T03:05:06.000Z'),
    }),
  )
  await reloadedModelContext.waitForTool('get_assistance_request')

  const retrieved = await reloadedModelContext.executeTool(
    'get_assistance_request',
    { id: 'request-1' },
  )

  await waitFor(() =>
    expect(retrieved).toEqual({
      id: 'request-1',
      state: 'answered',
      question: requestInput.question,
      createdAt: '2030-01-02T03:04:05.000Z',
      professionalResponse: {
        type: 'point_set',
        document: {
          id: 'virginia-farmhouse-drawings',
          versionId: 'virginia-farmhouse-drawings-v1',
        },
        points: [
          {
            page: { id: 'sheet-a1.2', label: 'A1.2', number: 3 },
            x: 0.5,
            y: 0.5,
          },
        ],
        count: 1,
        submittedAt: '2030-01-02T03:04:05.000Z',
      },
    }),
  )
})

test('reload keeps a pending request but discards its unfinished Point Set draft', async () => {
  const user = userEvent.setup()
  const storage = window.sessionStorage
  const databaseName = `grounded-draft-${crypto.randomUUID()}`
  const modelContext = createRecordingModelContext()
  const firstRender = render(
    createGroundedApp({
      databaseName,
      modelContext,
      sessionStorage: storage,
      createId: createIds('session-1', 'request-1'),
      now: () => new Date('2030-01-02T03:04:05.000Z'),
    }),
  )
  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)

  const drawingPage = screen.getByLabelText('Drawing page A1.2')
  Object.defineProperty(drawingPage, 'getBoundingClientRect', {
    value: () => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  })
  fireEvent.click(drawingPage, { clientX: 25, clientY: 75 })
  await user.type(screen.getByLabelText('Overall note optional'), 'Unfinished note')
  await screen.findByText('1 point')

  firstRender.unmount()
  const reloadedModelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName,
      modelContext: reloadedModelContext,
      sessionStorage: storage,
      createId: createIds('unused-session', 'unused-request'),
      now: () => new Date('2030-01-02T03:05:06.000Z'),
    }),
  )

  await screen.findByText(requestInput.question)
  expect({
    count: screen.getByText('0 points').textContent,
    note: screen.getByLabelText('Overall note optional'),
  }).toEqual({
    count: '0 points',
    note: expect.objectContaining({ value: '' }),
  })
})

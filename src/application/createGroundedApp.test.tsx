import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createGroundedApp } from './createGroundedApp'
import type { PdfPageRenderer } from '../documents/PdfPageViewer'
import { DEMO_SESSION_STORAGE_KEY } from '../demoSession/demoSession'
import { createRecordingModelContext } from '../webmcp/recordingModelContext'

const requestInput = {
  question: 'Mark every Type C door opening on the recommended drawing page.',
  responseType: 'point_set',
  documentId: 'virginia-farmhouse-drawings',
  documentVersionId: 'virginia-farmhouse-drawings-v1',
  recommendedPageIds: ['sheet-a1.2'],
  supportingDocumentReferences: [
    {
      documentId: 'type-c-door-submittal',
      documentVersionId: 'type-c-door-submittal-v1',
      pageIds: ['door-submittal-page-1', 'door-submittal-page-2'],
    },
  ],
} as const

function createIds(...ids: string[]) {
  let index = 0
  return () => ids[index++] ?? `unexpected-id-${index}`
}

function createTestPageRenderer() {
  return {
    renderPage: vi.fn(async ({ canvas, height, width }) => {
      canvas.width = width
      canvas.height = height
    }),
    prefetchPages() {},
  } satisfies PdfPageRenderer
}

test('an External Agent retrieves stable Point Numbers for a multi-page Point Set after reload', async () => {
  const user = userEvent.setup()
  const storage = window.sessionStorage
  const databaseName = `grounded-tracer-${crypto.randomUUID()}`
  const modelContext = createRecordingModelContext()
  const pageRenderer = createTestPageRenderer()
  const firstRender = render(
    createGroundedApp({
      databaseName,
      modelContext,
      pageRenderer,
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
  const currentAssistance = screen
    .getByRole('heading', { name: 'Current Assistance' })
    .closest('aside')!
  expect(
    within(currentAssistance).getByText(
      'Type C interior door product data and review cover',
    ),
  ).toBeInTheDocument()
  expect(within(currentAssistance).getByText(/Pages 1, 2/)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Go to target' }))
  const drawingPage = await screen.findByLabelText('Drawing page A1.2')
  expect(screen.getByLabelText('Rendered PDF page A1.2')).toBeInTheDocument()
  await waitFor(() => expect(pageRenderer.renderPage).toHaveBeenCalledWith(
    expect.objectContaining({ pageNumber: 6 }),
  ))
  Object.defineProperty(drawingPage, 'getBoundingClientRect', {
    configurable: true,
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

  await user.selectOptions(screen.getByLabelText('Document page'), 'sheet-a4.3')
  const secondDrawingPage = await screen.findByLabelText('Drawing page A4.3')
  Object.defineProperty(secondDrawingPage, 'getBoundingClientRect', {
    configurable: true,
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
  fireEvent.click(secondDrawingPage, { clientX: 25, clientY: 75 })
  await screen.findByText('2 points')
  expect(within(secondDrawingPage).getByText('2')).toBeInTheDocument()
  fireEvent.click(secondDrawingPage, { clientX: 75, clientY: 25 })
  await screen.findByText('3 points')
  expect(within(secondDrawingPage).getByText('3')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Undo' }))
  await screen.findByText('2 points')
  expect(within(secondDrawingPage).queryByText('3')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Submit Point Set' }))
  await screen.findByText('No pending Assistance Requests')

  firstRender.unmount()

  const reloadedModelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName,
      modelContext: reloadedModelContext,
      pageRenderer: createTestPageRenderer(),
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
            pointNumber: 1,
            page: { id: 'sheet-a1.2', label: 'A1.2', number: 6 },
            x: 0.5,
            y: 0.5,
          },
          {
            pointNumber: 2,
            page: { id: 'sheet-a4.3', label: 'A4.3', number: 24 },
            x: 0.25,
            y: 0.75,
          },
        ],
        count: 2,
        submittedAt: '2030-01-02T03:04:05.000Z',
      },
    }),
  )

  await user.click(await screen.findByRole('tab', { name: 'Done 1' }))
  await user.click(screen.getByRole('button', { name: 'View Point Set on drawing' }))
  const reloadedOverlay = await screen.findByLabelText('Drawing page A1.2')
  const reloadedMark = within(reloadedOverlay).getByText('1')
  expect(reloadedOverlay).toContainElement(reloadedMark)
  expect(reloadedMark).toHaveStyle({ left: '50%', top: '50%' })

  await user.selectOptions(screen.getByLabelText('Document page'), 'sheet-a4.3')
  const reloadedSecondOverlay = await screen.findByLabelText('Drawing page A4.3')
  const reloadedSecondMark = within(reloadedSecondOverlay).getByText('2')
  expect(reloadedSecondOverlay).toContainElement(reloadedSecondMark)
  expect(reloadedSecondMark).toHaveStyle({ left: '25%', top: '75%' })
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
      pageRenderer: createTestPageRenderer(),
      sessionStorage: storage,
      createId: createIds('session-1', 'request-1'),
      now: () => new Date('2030-01-02T03:04:05.000Z'),
    }),
  )
  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)

  await user.click(screen.getByRole('button', { name: 'Go to target' }))
  const drawingPage = await screen.findByLabelText('Drawing page A1.2')
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
      pageRenderer: createTestPageRenderer(),
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

test('Start over creates an isolated Demo Session and clears transient workspace state', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName: `grounded-start-over-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1', 'session-2'),
      now: () => new Date('2030-01-02T03:04:05.000Z'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await user.click(
    screen.getByRole('button', {
      name: /Type C interior door product data and review cover/i,
    }),
  )
  await user.selectOptions(
    screen.getByLabelText('Document page'),
    'door-submittal-page-2',
  )
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  await user.type(screen.getByLabelText('Overall note optional'), 'Discard this draft')

  await user.click(screen.getByRole('button', { name: 'Start over' }))

  await screen.findByText('No pending Assistance Requests')
  expect(screen.queryByDisplayValue('Discard this draft')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Virginia Farmhouse drawing set' }))
    .toBeInTheDocument()
  expect(screen.getByLabelText('Document page')).toHaveValue('sheet-a0.0')
  expect(screen.getByText('100%')).toBeInTheDocument()
  await user.click(
    screen.getByRole('button', {
      name: /Type C interior door product data and review cover/i,
    }),
  )
  expect(screen.getByLabelText('Document page'))
    .toHaveValue('door-submittal-page-1')
  expect(JSON.parse(window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY)!))
    .toEqual(expect.objectContaining({ sessionId: 'session-2' }))
  await expect(
    modelContext.executeTool('get_assistance_request', { id: 'request-1' }),
  ).rejects.toThrow('does not exist in this Demo Session')
})

test('Document Browsing restores each document location and reloads the current view', async () => {
  const user = userEvent.setup()
  const storage = window.sessionStorage
  const databaseName = `grounded-document-browsing-${crypto.randomUUID()}`
  const firstRender = render(
    createGroundedApp({
      databaseName,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: storage,
      createId: createIds('session-1'),
    }),
  )

  await screen.findByText('No pending Assistance Requests')
  await user.selectOptions(screen.getByLabelText('Document page'), 'sheet-a4.3')
  await user.click(
    screen.getByRole('button', {
      name: /Type C interior door product data and review cover/i,
    }),
  )
  await user.selectOptions(
    screen.getByLabelText('Document page'),
    'door-submittal-page-2',
  )

  await user.click(
    screen.getByRole('button', { name: /Virginia Farmhouse drawing set/i }),
  )
  expect(screen.getByLabelText('Document page')).toHaveValue('sheet-a4.3')
  await user.click(
    screen.getByRole('button', {
      name: /Type C interior door product data and review cover/i,
    }),
  )
  expect(screen.getByLabelText('Document page'))
    .toHaveValue('door-submittal-page-2')
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(screen.getByText('110%')).toBeInTheDocument()

  firstRender.unmount()
  render(
    createGroundedApp({
      databaseName,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: storage,
      createId: createIds('unused-session'),
    }),
  )

  expect(await screen.findByRole('heading', {
    name: 'Type C interior door product data and review cover',
  })).toBeInTheDocument()
  expect(screen.getByLabelText('Document page'))
    .toHaveValue('door-submittal-page-2')
  expect(screen.getByText('110%')).toBeInTheDocument()
})

test('an Assistance Request leaves Document Browsing in place until Go to target', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName: `grounded-request-navigation-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await user.click(
    screen.getByRole('button', {
      name: /Type C interior door product data and review cover/i,
    }),
  )
  await user.selectOptions(
    screen.getByLabelText('Document page'),
    'door-submittal-page-2',
  )
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))

  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)

  expect(screen.getByRole('heading', {
    name: 'Type C interior door product data and review cover',
  })).toBeInTheDocument()
  expect(screen.getByLabelText('Document page'))
    .toHaveValue('door-submittal-page-2')
  expect(screen.getByText('110%')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Go to target' }))

  expect(screen.getByRole('heading', { name: 'Virginia Farmhouse drawing set' }))
    .toBeInTheDocument()
  expect(screen.getByLabelText('Document page')).toHaveValue('sheet-a1.2')
  expect(screen.getByText('100%')).toBeInTheDocument()
})

test('Go to target uses the target document first page without a recommendation', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName: `grounded-request-fallback-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await user.selectOptions(screen.getByLabelText('Document page'), 'sheet-a4.3')
  await modelContext.executeTool('create_assistance_request', {
    ...requestInput,
    recommendedPageIds: [],
  })
  await screen.findByText(requestInput.question)

  expect(screen.getByLabelText('Document page')).toHaveValue('sheet-a4.3')
  await user.click(screen.getByRole('button', { name: 'Go to target' }))
  expect(screen.getByLabelText('Document page')).toHaveValue('sheet-a0.0')
})

test('the workspace distinguishes Demo Session loading from an empty queue and explains unsupported WebMCP', async () => {
  render(
    createGroundedApp({
      databaseName: `grounded-feedback-${crypto.randomUUID()}`,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1'),
    }),
  )

  expect(screen.getByRole('status', { name: 'Loading Demo Session' }))
    .toBeInTheDocument()
  await screen.findByText('No pending Assistance Requests')
  expect(screen.getByText(/Open this page in a WebMCP-capable browser/))
    .toBeInTheDocument()
})

test('a validation failure explains how to submit the requested Professional Response', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName: `grounded-validation-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', {
    question: 'State the recommended disposition.',
    responseType: 'text',
  })
  await screen.findByText('State the recommended disposition.')

  await user.click(screen.getByRole('button', { name: 'Submit Text Response' }))

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a text Professional Response before submitting.',
  )
})

test('External Agent document inspection leaves the visible workspace and unfinished Point Set draft unchanged', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName: `grounded-document-separation-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1'),
      now: () => new Date('2030-01-02T03:04:05.000Z'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)

  await user.click(
    screen.getByRole('button', {
      name: /Type C interior door product data and review cover/i,
    }),
  )
  await user.selectOptions(screen.getByLabelText('Document page'), 'door-submittal-page-2')
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  await user.type(screen.getByLabelText('Overall note optional'), 'Keep this draft')

  await modelContext.executeTool('inspect_document_text', {
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    pageIds: ['sheet-a4.3'],
  })

  expect({
    document: screen.getByRole('heading', {
      name: 'Type C interior door product data and review cover',
    }),
    page: screen.getByLabelText('Document page'),
    zoom: screen.getByText('110%'),
    assistance: screen.getByRole('heading', { name: 'Current Assistance' }),
    note: screen.getByLabelText('Overall note optional'),
  }).toEqual({
    document: expect.any(HTMLElement),
    page: expect.objectContaining({ value: 'door-submittal-page-2' }),
    zoom: expect.any(HTMLElement),
    assistance: expect.any(HTMLElement),
    note: expect.objectContaining({ value: 'Keep this draft' }),
  })
})

test('the Senior Project Manager works the FIFO queue through Current, Queue, and Done', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName: `grounded-workspace-queue-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1', 'request-2', 'request-3'),
      now: () => new Date('2030-01-02T03:04:05.000Z'),
    }),
  )
  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', {
    ...requestInput,
    recommendedPageIds: ['sheet-a1.2', 'sheet-a4.3'],
  })
  await modelContext.executeTool('create_assistance_request', {
    question: 'State the recommended disposition.',
    responseType: 'text',
  })
  await modelContext.executeTool('create_assistance_request', {
    ...requestInput,
    question: 'Mark any other affected openings.',
  })

  await screen.findByText(requestInput.question)
  await screen.findByText('2 waiting')
  expect(screen.getByText('Next: State the recommended disposition.')).toBeInTheDocument()
  expect(screen.getByText('A1.2, A4.3')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Document page'), 'sheet-a4.3')
  expect(await screen.findByLabelText('Drawing page A4.3')).toHaveAttribute('role', 'button')

  await user.click(await screen.findByRole('tab', { name: 'Queue 2' }))
  expect(screen.getByText('State the recommended disposition.')).toBeInTheDocument()
  expect(screen.getByText('Mark any other affected openings.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Submit/ })).not.toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Current 1' }))
  await user.click(screen.getByRole('button', { name: 'Submit Point Set' }))
  await screen.findByText('State the recommended disposition.')

  await user.type(screen.getByLabelText('Text response'), 'Revise and resubmit.')
  await user.type(
    screen.getByLabelText('Overall note optional'),
    'The product does not match the schedule.',
  )
  await user.click(screen.getByRole('button', { name: 'Submit Text Response' }))
  await screen.findByText('Mark any other affected openings.')

  await user.type(
    screen.getByLabelText('Decline reason optional'),
    'The page is not legible.',
  )
  await user.click(screen.getByRole('button', { name: 'Decline Request' }))
  await screen.findByText('No pending Assistance Requests')

  await user.click(screen.getByRole('tab', { name: 'Done 3' }))
  expect(screen.getByText(requestInput.question)).toBeInTheDocument()
  expect(screen.getByText('0 points')).toBeInTheDocument()
  expect(screen.getByText('Revise and resubmit.')).toBeInTheDocument()
  expect(screen.getByText('The page is not legible.')).toBeInTheDocument()
})

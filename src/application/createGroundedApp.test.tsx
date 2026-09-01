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

async function chooseDocument(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp,
) {
  await user.click(screen.getByRole('button', { name: 'Documents' }))
  const panel = screen.getByRole('dialog', { name: 'Choose a document' })
  await user.click(within(panel).getByRole('button', { name }))
}

async function choosePage(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp,
) {
  await user.click(screen.getByRole('button', { name: /Current page:/ }))
  const picker = screen.getByRole('dialog', { name: 'Choose a page' })
  await user.click(within(picker).getByRole('option', { name }))
}

function expectCurrentPage(name: string | RegExp) {
  expect(screen.getByRole('button', { name: /Current page:/ }))
    .toHaveAccessibleName(name)
}

test('the workbench opens searchable document and page overlays without changing the canvas layout', async () => {
  const user = userEvent.setup()
  render(
    createGroundedApp({
      databaseName: `grounded-workbench-navigation-${crypto.randomUUID()}`,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1'),
    }),
  )

  await screen.findByText('No pending Assistance Requests')
  expect(screen.queryByRole('navigation', { name: 'Project documents' }))
    .not.toBeInTheDocument()

  const documentsButton = screen.getByRole('button', { name: 'Documents' })
  await user.click(documentsButton)
  let documentsPanel = screen.getByRole('dialog', { name: 'Choose a document' })
  const documentSearch = within(documentsPanel).getByRole('searchbox', {
    name: 'Search documents',
  })
  expect(documentSearch).toHaveFocus()
  await user.type(documentSearch, 'fictional')
  expect(
    within(documentsPanel).getByRole('button', {
      name: /Type C interior door product data and review cover/i,
    }),
  ).toBeInTheDocument()
  expect(
    within(documentsPanel).queryByRole('button', {
      name: /Virginia Farmhouse drawing set/i,
    }),
  ).not.toBeInTheDocument()

  fireEvent.pointerLeave(documentsPanel)
  expect(screen.getByRole('dialog', { name: 'Choose a document' }))
    .toBeInTheDocument()
  await user.click(documentsButton)
  expect(screen.queryByRole('dialog', { name: 'Choose a document' }))
    .not.toBeInTheDocument()

  await user.click(documentsButton)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Choose a document' }))
    .not.toBeInTheDocument()
  expect(documentsButton).toHaveFocus()

  await user.click(documentsButton)
  await user.click(
    screen.getByRole('heading', { name: 'Virginia Farmhouse drawing set' }),
  )
  expect(screen.queryByRole('dialog', { name: 'Choose a document' }))
    .not.toBeInTheDocument()

  await user.click(documentsButton)
  documentsPanel = screen.getByRole('dialog', { name: 'Choose a document' })
  await user.type(
    within(documentsPanel).getByRole('searchbox', { name: 'Search documents' }),
    'submittal_product_data',
  )
  await user.click(
    within(documentsPanel).getByRole('button', {
      name: /Type C interior door product data and review cover/i,
    }),
  )
  expect(screen.queryByRole('dialog', { name: 'Choose a document' }))
    .not.toBeInTheDocument()
  expect(screen.getByRole('heading', {
    name: 'Type C interior door product data and review cover',
  })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Current page:/ }))
  const pagePanel = screen.getByRole('dialog', { name: 'Choose a page' })
  const pageSearch = within(pagePanel).getByRole('searchbox', {
    name: 'Search pages',
  })
  await user.type(pageSearch, 'Hollow-core')
  await user.click(
    within(pagePanel).getByRole('option', {
      name: /^2 Hollow-core flush wood door product data$/,
    }),
  )
  expectCurrentPage(/2, Hollow-core flush wood door product data/)
})

test('the workbench stops page navigation at boundaries and resets direct navigation to Fit page', async () => {
  const user = userEvent.setup()
  render(
    createGroundedApp({
      databaseName: `grounded-workbench-boundaries-${crypto.randomUUID()}`,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1'),
    }),
  )

  await screen.findByText('No pending Assistance Requests')
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

  await user.click(screen.getByRole('button', { name: 'Fit width' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(screen.getByText('110%')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expectCurrentPage(/A0\.1, Project Information/)
  expect(screen.getByText('100%')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Fit page' }))
    .not.toHaveAttribute('aria-pressed')

  await user.click(screen.getByRole('button', { name: /Current page:/ }))
  const picker = screen.getByRole('dialog', { name: 'Choose a page' })
  await user.type(
    within(picker).getByRole('searchbox', { name: 'Search pages' }),
    'A5.0 Schedules',
  )
  await user.click(within(picker).getByRole('option', { name: /^A5\.0 Schedules$/ }))
  expectCurrentPage(/A5\.0, Schedules/)
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()

  await user.click(screen.getByRole('button', { name: 'More' }))
  const more = screen.getByRole('dialog', { name: 'More document actions' })
  expect(within(more).getByRole('link', { name: 'Open authoritative PDF' }))
    .toHaveAttribute('href', '/demo-project/virginia-farmhouse-drawing-set.pdf#page=25')
  expect(within(more).getByText('Keyboard shortcuts')).toBeInTheDocument()
})

test('map controls and keyboard shortcuts change fit, zoom, and pages outside editable controls', async () => {
  const user = userEvent.setup()
  render(
    createGroundedApp({
      databaseName: `grounded-map-controls-${crypto.randomUUID()}`,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1'),
    }),
  )

  await screen.findByText('No pending Assistance Requests')
  const zoomOut = screen.getByRole('button', { name: 'Zoom out' })
  const fitPage = screen.getByRole('button', { name: 'Fit page' })
  const fitWidth = screen.getByRole('button', { name: 'Fit width' })

  expect(fitPage).not.toHaveAttribute('aria-pressed')
  expect(fitWidth).not.toHaveAttribute('aria-pressed')
  fireEvent.keyDown(document, { key: '+', code: 'Equal' })
  expect(screen.getByText('110%')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: '0', shiftKey: true })
  expect(fitWidth).not.toHaveAttribute('aria-pressed')
  expect(screen.getByText('100%')).toBeInTheDocument()

  fireEvent.keyDown(document, { key: 'ArrowRight' })
  expectCurrentPage(/A0\.1, Project Information/)
  await user.click(screen.getByRole('button', { name: 'Documents' }))
  const search = screen.getByRole('searchbox', { name: 'Search documents' })
  fireEvent.keyDown(search, { key: 'ArrowRight' })
  expectCurrentPage(/A0\.1, Project Information/)

  await user.keyboard('{Escape}')
  for (let step = 0; step < 8; step += 1) fireEvent.click(zoomOut)
  expect(screen.getByText('25%')).toBeInTheDocument()
  expect(zoomOut).toBeDisabled()
})

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
  await modelContext.executeTool('create_assistance_request', {
    ...requestInput,
    recommendedPageIds: ['sheet-a1.2', 'sheet-a4.3'],
  })

  await screen.findByRole('heading', { name: 'Current Assistance' })
  await screen.findByText(requestInput.question)
  screen.getByRole('button', { name: 'Documents' })
  const currentAssistance = screen
    .getByRole('heading', { name: 'Current Assistance' })
    .closest('aside')!
  expect(
    within(currentAssistance).getByText(
      'Type C interior door product data and review cover',
    ),
  ).toBeInTheDocument()
  expect(within(currentAssistance).getByText(/Pages 1, 2/)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Current page:/ }))
  let pagePicker = screen.getByRole('dialog', { name: 'Choose a page' })
  expect(within(pagePicker).getByRole('option', {
    name: /^A1\.2 1st Floor Plan$/,
  })).toHaveAccessibleDescription('Recommended')
  expect(within(pagePicker).getByRole('option', {
    name: /^A4\.3 Doors & Windows$/,
  })).toHaveAccessibleDescription('Recommended')
  await user.keyboard('{Escape}')

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

  await user.click(screen.getByRole('button', { name: /Current page:/ }))
  pagePicker = screen.getByRole('dialog', { name: 'Choose a page' })
  expect(within(pagePicker).getByRole('option', {
    name: /^A1\.2 1st Floor Plan$/,
  })).toHaveAccessibleDescription('Recommended, 1 draft point')
  expect(within(pagePicker).getByRole('option', {
    name: /^A4\.3 Doors & Windows$/,
  })).toHaveAccessibleDescription('Recommended')
  await user.click(within(pagePicker).getByRole('option', {
    name: /^A4\.3 Doors & Windows$/,
  }))
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

  await user.click(screen.getByRole('button', { name: /Current page:/ }))
  pagePicker = screen.getByRole('dialog', { name: 'Choose a page' })
  expect(within(pagePicker).getByRole('option', {
    name: /^A1\.2 1st Floor Plan$/,
  })).toHaveAccessibleDescription('Recommended, 1 draft point')
  expect(within(pagePicker).getByRole('option', {
    name: /^A4\.3 Doors & Windows$/,
  })).toHaveAccessibleDescription('Recommended, 2 draft points')
  await user.keyboard('{Escape}')

  await user.click(within(secondDrawingPage).getByRole('button', { name: 'Point 2' }))
  await user.click(screen.getByRole('button', { name: 'Remove point 2' }))
  await screen.findByText('2 points')
  expect(within(secondDrawingPage).queryByRole('button', { name: 'Point 3' }))
    .not.toBeInTheDocument()
  expect(within(secondDrawingPage).getByRole('button', { name: 'Point 2' })
    .closest('.point-mark')).toHaveStyle({ left: '75%', top: '25%' })

  fireEvent.click(secondDrawingPage, { clientX: 30, clientY: 30 })
  await screen.findByText('3 points')
  await choosePage(user, /^A1\.2 1st Floor Plan$/)
  await user.click(screen.getByRole('button', { name: 'Undo' }))
  await screen.findByText('2 points')
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  const undoNotice = screen.getByRole('status')
  expect(undoNotice).toHaveTextContent('Removed the latest point from page A4.3.')
  await user.click(within(undoNotice).getByRole('button', { name: 'View page A4.3' }))
  expectCurrentPage(/A4\.3, Doors & Windows/)

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
            x: 0.75,
            y: 0.25,
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
  expect(reloadedOverlay).not.toHaveAttribute('role', 'button')
  expect(within(reloadedOverlay).queryByRole('button', { name: /Remove point/ }))
    .not.toBeInTheDocument()
  expect(reloadedMark.closest('.point-mark')).toHaveStyle({
    left: '50%',
    top: '50%',
  })

  await user.click(screen.getByRole('button', { name: /Current page:/ }))
  pagePicker = screen.getByRole('dialog', { name: 'Choose a page' })
  expect(within(pagePicker).getByRole('option', {
    name: /^A1\.2 1st Floor Plan$/,
  })).toHaveAccessibleDescription('1 submitted point')
  expect(within(pagePicker).getByRole('option', {
    name: /^A4\.3 Doors & Windows$/,
  })).toHaveAccessibleDescription('1 submitted point')
  await user.click(within(pagePicker).getByRole('option', {
    name: /^A4\.3 Doors & Windows$/,
  }))
  const reloadedSecondOverlay = await screen.findByLabelText('Drawing page A4.3')
  const reloadedSecondMark = within(reloadedSecondOverlay).getByText('2')
  expect(reloadedSecondOverlay).toContainElement(reloadedSecondMark)
  expect(reloadedSecondMark.closest('.point-mark')).toHaveStyle({
    left: '75%',
    top: '25%',
  })
})

test('reopening a submitted Point Set starts on its earliest marked document page', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName: `grounded-first-marked-page-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', {
    ...requestInput,
    recommendedPageIds: ['sheet-a4.3'],
  })
  await screen.findByText(requestInput.question)
  await user.click(screen.getByRole('button', { name: 'Go to target' }))

  const laterPage = await screen.findByLabelText('Drawing page A4.3')
  Object.defineProperty(laterPage, 'getBoundingClientRect', {
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
  fireEvent.click(laterPage, { clientX: 75, clientY: 25 })
  await screen.findByText('1 point')

  await choosePage(user, /^A1\.2 1st Floor Plan$/)
  const earlierPage = await screen.findByLabelText('Drawing page A1.2')
  Object.defineProperty(earlierPage, 'getBoundingClientRect', {
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
  fireEvent.click(earlierPage, { clientX: 25, clientY: 75 })
  await screen.findByText('2 points')
  await user.click(screen.getByRole('button', { name: 'Submit Point Set' }))
  await screen.findByText('No pending Assistance Requests')

  await user.click(screen.getByRole('tab', { name: 'Done 1' }))
  await user.click(screen.getByRole('button', { name: 'View Point Set on drawing' }))
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
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
  await chooseDocument(user, /Type C interior door product data and review cover/i)
  await choosePage(user, /^2 Hollow-core flush wood door product data$/)
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  await user.type(screen.getByLabelText('Overall note optional'), 'Discard this draft')

  await user.click(screen.getByRole('button', { name: 'Start over' }))

  await screen.findByText('No pending Assistance Requests')
  expect(screen.queryByDisplayValue('Discard this draft')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Virginia Farmhouse drawing set' }))
    .toBeInTheDocument()
  expectCurrentPage(/A0\.0, Cover Page/)
  expect(screen.getByText('100%')).toBeInTheDocument()
  await chooseDocument(user, /Type C interior door product data and review cover/i)
  expectCurrentPage(/1, Submittal cover/)
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
  await choosePage(user, /^A4\.3 Doors & Windows$/)
  await chooseDocument(user, /Type C interior door product data and review cover/i)
  await choosePage(user, /^2 Hollow-core flush wood door product data$/)

  await chooseDocument(user, /Virginia Farmhouse drawing set/i)
  expectCurrentPage(/A4\.3, Doors & Windows/)
  await chooseDocument(user, /Type C interior door product data and review cover/i)
  expectCurrentPage(/2, Hollow-core flush wood door product data/)
  await user.click(screen.getByRole('button', { name: 'Fit width' }))
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
  expectCurrentPage(/2, Hollow-core flush wood door product data/)
  expect(screen.getByText('110%')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Fit width' }))
    .not.toHaveAttribute('aria-pressed')
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
  await chooseDocument(user, /Type C interior door product data and review cover/i)
  await choosePage(user, /^2 Hollow-core flush wood door product data$/)
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))

  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)

  expect(screen.getByRole('heading', {
    name: 'Type C interior door product data and review cover',
  })).toBeInTheDocument()
  expectCurrentPage(/2, Hollow-core flush wood door product data/)
  expect(screen.getByText('110%')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Go to target' }))

  expect(screen.getByRole('heading', { name: 'Virginia Farmhouse drawing set' }))
    .toBeInTheDocument()
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
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
  await choosePage(user, /^A4\.3 Doors & Windows$/)
  await modelContext.executeTool('create_assistance_request', {
    ...requestInput,
    recommendedPageIds: [],
  })
  await screen.findByText(requestInput.question)

  expectCurrentPage(/A4\.3, Doors & Windows/)
  await user.click(screen.getByRole('button', { name: 'Go to target' }))
  expectCurrentPage(/A0\.0, Cover Page/)
})

test('the workspace distinguishes Demo Session loading from an empty queue', async () => {
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

test('External Agent document search and inspection leave the visible workspace and unfinished Point Set draft unchanged', async () => {
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

  await user.click(screen.getByRole('button', { name: 'Go to target' }))
  const targetPage = await screen.findByLabelText('Drawing page A1.2')
  Object.defineProperty(targetPage, 'getBoundingClientRect', {
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
  fireEvent.click(targetPage, { clientX: 40, clientY: 60 })
  await screen.findByText('1 point')

  await chooseDocument(user, /Type C interior door product data and review cover/i)
  await choosePage(user, /^2 Hollow-core flush wood door product data$/)
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  await user.type(screen.getByLabelText('Overall note optional'), 'Keep this draft')

  const visibleState = () => ({
    document: screen.getByRole('heading', {
      name: 'Type C interior door product data and review cover',
    }).textContent,
    page: screen.getByRole('button', { name: /Current page:/ }).textContent,
    zoom: screen.getByText('110%').textContent,
    assistance: screen.getByRole('heading', { name: 'Current Assistance' }).textContent,
    pointCount: screen.getByText('1 point').textContent,
    note: (screen.getByLabelText('Overall note optional') as HTMLTextAreaElement).value,
  })
  const beforeSearch = visibleState()
  await modelContext.executeTool('search_project_documents', {
    query: 'Type C 24 x 80 solid wood',
  })
  expect(visibleState()).toEqual(beforeSearch)

  await modelContext.executeTool('inspect_document_evidence', {
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    pageIds: ['sheet-a4.3'],
  })

  expect({
    document: screen.getByRole('heading', {
      name: 'Type C interior door product data and review cover',
    }),
    page: screen.getByRole('button', { name: /Current page:/ }),
    zoom: screen.getByText('110%'),
    assistance: screen.getByRole('heading', { name: 'Current Assistance' }),
    pointCount: screen.getByText('1 point'),
    note: screen.getByLabelText('Overall note optional'),
  }).toEqual({
    document: expect.any(HTMLElement),
    page: expect.any(HTMLElement),
    zoom: expect.any(HTMLElement),
    assistance: expect.any(HTMLElement),
    pointCount: expect.any(HTMLElement),
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
  await choosePage(user, /^A4\.3 Doors & Windows$/)
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

  await user.click(screen.getByRole('button', {
    name: 'View Point Set on drawing',
  }))
  expectCurrentPage(/A0\.0, Cover Page/)
})

test('Assistance collapse survives reload and View request restores the rail', async () => {
  const user = userEvent.setup()
  const storage = window.sessionStorage
  const databaseName = `grounded-assistance-layout-${crypto.randomUUID()}`
  const modelContext = createRecordingModelContext()
  const firstRender = render(
    createGroundedApp({
      databaseName,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: storage,
      createId: createIds('session-1', 'request-1'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  expect(screen.queryByLabelText('Active Assistance Request')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Hide Assistance' }))
  expect(screen.queryByRole('heading', { name: 'Current Assistance' }))
    .not.toBeInTheDocument()
  const strip = screen.getByLabelText('Active Assistance Request')
  expect(within(strip).getByText('Point Set, 0 marked')).toBeInTheDocument()

  firstRender.unmount()
  render(
    createGroundedApp({
      databaseName,
      modelContext: createRecordingModelContext(),
      pageRenderer: createTestPageRenderer(),
      sessionStorage: storage,
      createId: createIds('unused-session', 'unused-request'),
    }),
  )

  await screen.findByLabelText('Active Assistance Request')
  expect(screen.queryByRole('heading', { name: 'Current Assistance' }))
    .not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'View request' }))
  expect(await screen.findByRole('heading', { name: 'Current Assistance' }))
    .toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Hide Assistance' }))
  await user.click(screen.getByRole('button', { name: 'Start over' }))
  expect(await screen.findByRole('heading', { name: 'Current Assistance' }))
    .toBeInTheDocument()
  await screen.findByText('No pending Assistance Requests')
})

test('supporting references preserve the Point Set draft and Return to target resumes placement', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(
    createGroundedApp({
      databaseName: `grounded-supporting-reference-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer: createTestPageRenderer(),
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  await user.click(screen.getByRole('button', { name: 'Go to target' }))
  const targetOverlay = await screen.findByLabelText('Drawing page A1.2')
  Object.defineProperty(targetOverlay, 'getBoundingClientRect', {
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
  fireEvent.click(targetOverlay, { clientX: 40, clientY: 60 })
  await screen.findByText('1 point')
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))

  await user.click(screen.getByRole('button', { name: 'Open page 2' }))
  expect(screen.getByRole('heading', {
    name: 'Type C interior door product data and review cover',
  })).toBeInTheDocument()
  expectCurrentPage(/2, Hollow-core flush wood door product data/)
  expect(screen.getByText('100%')).toBeInTheDocument()
  expect(screen.getByLabelText('Drawing page 2')).not.toHaveAttribute('role', 'button')
  expect(screen.getByText(requestInput.question)).toBeInTheDocument()
  expect(screen.getByText('1 point')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Hide Assistance' }))
  const strip = screen.getByLabelText('Active Assistance Request')
  expect(within(strip).getByText('Point Set, 1 marked')).toBeInTheDocument()
  await user.click(within(strip).getByRole('button', { name: 'Return to target' }))
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  const returnedOverlay = await screen.findByLabelText('Drawing page A1.2')
  expect(within(returnedOverlay).getByText('1')).toBeInTheDocument()
  expect(returnedOverlay).toHaveAttribute('role', 'button')
})

test('Point Set placement stays blocked while the selected page is pending or failed', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  let resolveTargetRender: (() => void) | undefined
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(({ pageNumber }) => {
      if (pageNumber === 6) {
        return new Promise<void>((resolve) => { resolveTargetRender = resolve })
      }
      if (pageNumber === 7) {
        return Promise.reject(new Error('The selected drawing page failed to render.'))
      }
      return Promise.resolve()
    }),
    prefetchPages() {},
  }
  render(
    createGroundedApp({
      databaseName: `grounded-render-safety-${crypto.randomUUID()}`,
      modelContext,
      pageRenderer,
      sessionStorage: window.sessionStorage,
      createId: createIds('session-1', 'request-1'),
    }),
  )

  await modelContext.waitForTool('create_assistance_request')
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  await user.click(screen.getByRole('button', { name: 'Go to target' }))

  const targetOverlay = await screen.findByLabelText('Drawing page A1.2')
  expect(targetOverlay).not.toHaveAttribute('role', 'button')
  expect(screen.getByRole('status')).toHaveTextContent('Rendering PDF page')
  fireEvent.click(targetOverlay, { clientX: 20, clientY: 20 })
  expect(screen.getByText('0 points')).toBeInTheDocument()

  resolveTargetRender?.()
  await waitFor(() => expect(targetOverlay).toHaveAttribute('role', 'button'))
  Object.defineProperty(targetOverlay, 'getBoundingClientRect', {
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
  fireEvent.click(targetOverlay, { clientX: 20, clientY: 20 })
  await screen.findByText('1 point')

  await choosePage(user, /^A1\.3 2nd Floor Plan$/)
  const failedOverlay = await screen.findByLabelText('Drawing page A1.3')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The selected drawing page failed to render.',
  )
  expect(failedOverlay).not.toHaveAttribute('role', 'button')
  fireEvent.click(failedOverlay, { clientX: 20, clientY: 20 })
  expect(screen.getByText('1 point')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open authoritative PDF page' }))
    .toHaveAttribute('href', '/demo-project/virginia-farmhouse-drawing-set.pdf#page=7')
})

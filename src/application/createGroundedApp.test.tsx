import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

async function waitForWebMcpReady() {
  await screen.findByText('WebMCP ready')
}

test('get_project_workspace returns the fresh Demo Session snapshot without changing the workspace', async () => {
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-project-workspace-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer: createTestPageRenderer(),
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await screen.findByText('No pending Assistance Requests')
  const before = {
    heading: screen.getByRole('heading', {
      name: 'Virginia Farmhouse drawing set',
    }).textContent,
    page: screen.getByRole('button', { name: /Current page:/ })
      .getAttribute('aria-label'),
    assistance: screen.getByText('No pending Assistance Requests').textContent,
  }
  const snapshot = await modelContext.executeTool('get_project_workspace', {})

  expect(snapshot).toEqual({
    project: {
      id: 'demo-virginia-farmhouse',
      title: 'Virginia Farmhouse Demo Project',
      description:
        'A Project Workspace for reviewing Type C interior door product data against the contract drawings.',
      documentCount: 2,
    },
    documentBrowsing: {
      selectedDocument: {
        id: 'virginia-farmhouse-drawings',
        versionId: 'virginia-farmhouse-drawings-v1',
      },
      selectedPage: { id: 'sheet-a0.0' },
    },
    assistance: {
      pendingCount: 0,
      completedCount: 0,
      currentPending: null,
      latestCompleted: null,
    },
  })
  expect(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength)
    .toBeLessThanOrEqual(1_500)
  expect(modelContext.getTool('get_project_workspace')?.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: true,
  })
  await expect(modelContext.executeTool('get_project_workspace', {
    extra: true,
  })).rejects.toThrow('Invalid input at /extra.')
  expect({
    heading: screen.getByRole('heading', {
      name: 'Virginia Farmhouse drawing set',
    }).textContent,
    page: screen.getByRole('button', { name: /Current page:/ })
      .getAttribute('aria-label'),
    assistance: screen.getByText('No pending Assistance Requests').textContent,
  }).toEqual(before)
})

test('get_project_workspace recovers current browsing and Assistance state across reload and Start over', async () => {
  const user = userEvent.setup()
  const storage = window.sessionStorage
  const databaseName = `grounded-project-recovery-${crypto.randomUUID()}`
  const firstModelContext = createRecordingModelContext()
  const firstRender = render(createGroundedApp({
    databaseName,
    modelContext: firstModelContext,
    pageRenderer: createTestPageRenderer(),
    sessionStorage: storage,
    createId: createIds('session-1', 'request-1', 'request-2'),
    now: () => new Date('2030-01-02T03:04:05.000Z'),
  }))

  await waitForWebMcpReady()
  await chooseDocument(user, /Type C interior door product data and review cover/i)
  await choosePage(user, /^2 Hollow-core flush wood door product data$/)
  await firstModelContext.executeTool('create_assistance_request', {
    question: 'Confirm whether the submitted door construction complies.',
    responseType: 'text',
  })
  await firstModelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText('Confirm whether the submitted door construction complies.')

  const pendingSnapshot = await firstModelContext.executeTool(
    'get_project_workspace',
    {},
  )
  expect(pendingSnapshot).toMatchObject({
    documentBrowsing: {
      selectedDocument: {
        id: 'type-c-door-submittal',
        versionId: 'type-c-door-submittal-v1',
      },
      selectedPage: { id: 'door-submittal-page-2' },
    },
    assistance: {
      pendingCount: 2,
      completedCount: 0,
      currentPending: {
        id: 'request-1',
        state: 'pending',
        responseType: 'text',
        createdAt: '2030-01-02T03:04:05.000Z',
        questionPreview:
          'Confirm whether the submitted door construction complies.',
      },
      latestCompleted: null,
    },
  })
  await expect(firstModelContext.executeTool('get_project_workspace', {}))
    .resolves.toEqual(pendingSnapshot)
  expect(screen.getByText(
    'Confirm whether the submitted door construction complies.',
  )).toBeInTheDocument()
  expectCurrentPage(/2, Hollow-core flush wood door product data/)

  firstRender.unmount()
  const reloadedModelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName,
    modelContext: reloadedModelContext,
    pageRenderer: createTestPageRenderer(),
    sessionStorage: storage,
    createId: createIds('session-2'),
    now: () => new Date('2030-01-02T03:05:06.000Z'),
  }))

  await waitForWebMcpReady()
  await screen.findByText('Confirm whether the submitted door construction complies.')
  const reloadedPending = await reloadedModelContext.executeTool(
    'get_project_workspace',
    {},
  ) as {
    assistance: { currentPending: { id: string; state: string } }
  }
  expect(reloadedPending.assistance.currentPending).toMatchObject({
    id: 'request-1',
    state: 'pending',
  })
  expectCurrentPage(/2, Hollow-core flush wood door product data/)

  await user.type(
    screen.getByLabelText('Text response'),
    'The hollow-core submitted construction does not comply.',
  )
  await user.click(screen.getByRole('button', { name: 'Submit Text Response' }))
  await screen.findByText(requestInput.question)
  await expect(reloadedModelContext.executeTool('get_project_workspace', {}))
    .resolves.toMatchObject({
      assistance: {
        pendingCount: 1,
        completedCount: 1,
        currentPending: {
          id: 'request-2',
          state: 'pending',
          responseType: 'point_set',
        },
        latestCompleted: {
          id: 'request-1',
          state: 'answered',
          responseType: 'text',
        },
      },
    })

  await user.click(screen.getByRole('button', { name: 'Decline Request' }))
  await screen.findByText('No pending Assistance Requests')
  const completed = await reloadedModelContext.executeTool(
    'get_project_workspace',
    {},
  ) as {
    assistance: {
      pendingCount: number
      completedCount: number
      currentPending: unknown
      latestCompleted: {
        id: string
        state: string
        responseType: string
        questionPreview: string
      }
    }
  }
  expect(completed.assistance).toMatchObject({
    pendingCount: 0,
    completedCount: 2,
    currentPending: null,
    latestCompleted: {
      id: 'request-2',
      state: 'declined',
      responseType: 'point_set',
      questionPreview: requestInput.question,
    },
  })
  expect(completed.assistance.latestCompleted).not.toHaveProperty(
    'professionalResponse',
  )

  await user.click(screen.getByRole('button', { name: 'Start over' }))
  await screen.findByText('No pending Assistance Requests')
  await waitFor(() => expectCurrentPage(/A0\.0, Cover Page/))
  await expect(reloadedModelContext.executeTool('get_project_workspace', {}))
    .resolves.toMatchObject({
      documentBrowsing: {
        selectedDocument: {
          id: 'virginia-farmhouse-drawings',
          versionId: 'virginia-farmhouse-drawings-v1',
        },
        selectedPage: { id: 'sheet-a0.0' },
      },
      assistance: {
        pendingCount: 0,
        completedCount: 0,
        currentPending: null,
        latestCompleted: null,
      },
    })
})

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

test('navigate_document waits for its requested page to be visibly rendered and returns the applied view', async () => {
  let resolveTargetRender: (() => void) | undefined
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(({ canvas, height, pageNumber, width }) => {
      canvas.width = width
      canvas.height = height
      if (pageNumber === 6) {
        return new Promise<void>((resolve) => {
          resolveTargetRender = resolve
        })
      }
      return Promise.resolve()
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-page-navigation-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  let settled = false
  const navigation = modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page', pageId: 'sheet-a1.2' },
  }).then((result) => {
    settled = true
    return result
  })

  await waitFor(() => expectCurrentPage(/A1\.2, 1st Floor Plan/))
  expect(screen.getByText('100%')).toBeInTheDocument()
  expect(screen.getByText('Rendering PDF page')).toBeInTheDocument()
  expect(settled).toBe(false)

  resolveTargetRender?.()
  await expect(navigation).resolves.toEqual({
    status: 'applied',
    document: {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
    },
    page: { id: 'sheet-a1.2' },
    type: 'page',
    fit: 'page',
    zoom: 1,
  })
  expect(screen.getByLabelText('Rendered PDF page A1.2')).toBeInTheDocument()
})

test('navigate_document restores the current-session page and preserves unfinished Assistance work', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-document-navigation-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer: createTestPageRenderer(),
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1', 'request-1'),
  }))

  await waitForWebMcpReady()
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))
  const drawingPage = await screen.findByLabelText('Drawing page A1.2')
  Object.defineProperty(drawingPage, 'getBoundingClientRect', {
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
  fireEvent.click(drawingPage, { clientX: 40, clientY: 60 })
  await user.type(
    screen.getByLabelText('Overall note optional'),
    'Keep this draft intact.',
  )
  await screen.findByText('1 point')

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'type-c-door-submittal',
    target: { type: 'page', pageId: 'door-submittal-page-2' },
  })).resolves.toMatchObject({
    status: 'applied',
    document: { id: 'type-c-door-submittal' },
    page: { id: 'door-submittal-page-2' },
    type: 'page',
    fit: 'page',
    zoom: 1,
  })
  expect(screen.getByText(requestInput.question)).toBeInTheDocument()
  expect(screen.getByLabelText('Overall note optional')).toHaveValue(
    'Keep this draft intact.',
  )
  expect(screen.getByText('1 point')).toBeInTheDocument()

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
  })).resolves.toEqual({
    status: 'applied',
    document: {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
    },
    page: { id: 'sheet-a1.2' },
    type: 'document',
    fit: 'page',
    zoom: 1,
  })
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  expect(within(screen.getByLabelText('Drawing page A1.2')).getByText('1'))
    .toBeInTheDocument()
})

test('document-only navigation opens a never-before-opened Project Document on its first page', async () => {
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-document-first-page-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer: createTestPageRenderer(),
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'type-c-door-submittal',
  })).resolves.toMatchObject({
    status: 'applied',
    document: { id: 'type-c-door-submittal' },
    page: { id: 'door-submittal-page-1' },
    type: 'document',
    fit: 'page',
    zoom: 1,
  })
  expectCurrentPage(/1, Submittal cover/)
  expect(screen.getByLabelText('Rendered PDF page 1')).toBeVisible()
})

test('invalid navigate_document identities do not change the visible workbench', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-invalid-navigation-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer: createTestPageRenderer(),
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await user.click(screen.getByRole('button', { name: 'Fit width' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(screen.getByText('110%')).toBeInTheDocument()

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'missing-document',
  })).rejects.toThrow(
    'The Project Document does not exist in this Project Workspace.',
  )
  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page', pageId: 'missing-page' },
  })).rejects.toThrow('The page does not belong to the Project Document.')

  expectCurrentPage(/A0\.0, Cover Page/)
  expect(screen.getByText('110%')).toBeInTheDocument()
})

test('navigate_document visibly fits a raw Document Region and preserves unfinished Assistance work', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  const pageRenderer = createTestPageRenderer()
  render(createGroundedApp({
    databaseName: `grounded-region-navigation-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1', 'request-1'),
  }))

  await waitForWebMcpReady()
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))
  const drawingPage = await screen.findByLabelText('Drawing page A1.2')
  Object.defineProperty(drawingPage, 'getBoundingClientRect', {
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
  fireEvent.click(drawingPage, { clientX: 40, clientY: 60 })
  await user.type(
    screen.getByLabelText('Overall note optional'),
    'Keep this region review draft.',
  )
  const region = { left: 0.4, top: 0.35, width: 0.2, height: 0.2 }

  const result = await modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'region', pageId: 'sheet-a1.2', region },
  })

  expect(result).toEqual({
    status: 'applied',
    document: {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
    },
    page: { id: 'sheet-a1.2' },
    type: 'region',
    fit: 'region',
    region,
    zoom: 4,
  })
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  expect(screen.getByText('400%')).toBeInTheDocument()
  expect(screen.getByText(requestInput.question)).toBeInTheDocument()
  expect(screen.getByLabelText('Overall note optional')).toHaveValue(
    'Keep this region review draft.',
  )
  expect(within(screen.getByLabelText('Drawing page A1.2')).getByText('1'))
    .toBeInTheDocument()
  const focusOutline = document.querySelector('.document-focus-outline')
  expect(focusOutline).toBeInTheDocument()
  expect(focusOutline).toHaveAttribute('aria-hidden', 'true')
  expect(focusOutline).toHaveStyle({
    left: '40%',
    top: '35%',
    width: '20%',
    height: '20%',
  })
})

test('navigate_document resolves Document Evidence and Search Hint blocks through the public region-focus path', async () => {
  const modelContext = createRecordingModelContext()
  const pageRenderer = createTestPageRenderer()
  render(createGroundedApp({
    databaseName: `grounded-block-navigation-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  const sourceSearch = await modelContext.executeTool('search_project_documents', {
    query: 'hollow honeycomb core',
    limit: 1,
  }) as {
    matches: Array<{
      block: { id: string }
      classification: string
      document: { id: string }
      page: { id: string }
      region: { left: number; top: number; width: number; height: number }
    }>
  }
  const hintSearch = await modelContext.executeTool('search_project_documents', {
    query: 'first floor plan room layout utility coats WC',
    limit: 1,
  }) as typeof sourceSearch
  const source = sourceSearch.matches[0]!
  const hint = hintSearch.matches[0]!

  expect(source.classification).toBe('document_evidence')
  expect(hint.classification).toBe('search_hint')
  const sourceResult = await modelContext.executeTool('navigate_document', {
    documentId: source.document.id,
    target: { type: 'block', blockId: source.block.id },
  })
  expect(sourceResult).toEqual({
    status: 'applied',
    document: {
      id: 'type-c-door-submittal',
      versionId: 'type-c-door-submittal-v1',
    },
    page: { id: source.page.id },
    type: 'block',
    blockId: source.block.id,
    fit: 'region',
    region: source.region,
    zoom: expect.any(Number),
  })
  expectCurrentPage(/2, Hollow-core flush wood door product data/)

  const hintResult = await modelContext.executeTool('navigate_document', {
    documentId: hint.document.id,
    target: { type: 'block', blockId: hint.block.id },
  })
  expect(hintResult).toEqual({
    status: 'applied',
    document: {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
    },
    page: { id: hint.page.id },
    type: 'block',
    blockId: hint.block.id,
    fit: 'region',
    region: hint.region,
    zoom: expect.any(Number),
  })
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  expect(hintResult).not.toHaveProperty('classification')
  expect(hintResult).not.toHaveProperty('content')
  expect(hintResult).not.toHaveProperty('evidence')
  expect(document.querySelector('.document-focus-outline')).toHaveStyle({
    left: `${hint.region.left * 100}%`,
    top: `${hint.region.top * 100}%`,
    width: `${hint.region.width * 100}%`,
    height: `${hint.region.height * 100}%`,
  })

  const focusedRenderCount = vi.mocked(pageRenderer.renderPage).mock.calls.length
  await expect(modelContext.executeTool('navigate_document', {
    documentId: hint.document.id,
    target: { type: 'region', pageId: hint.page.id, region: hint.region },
  })).resolves.toMatchObject({ status: 'applied', type: 'region' })
  expect(pageRenderer.renderPage).toHaveBeenCalledTimes(focusedRenderCount)
})

test('block navigation rejects missing and foreign IDs atomically and preserves the table-row distinction', async () => {
  const modelContext = createRecordingModelContext()
  const pageRenderer = createTestPageRenderer()
  render(createGroundedApp({
    databaseName: `grounded-block-scope-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  const submittalSearch = await modelContext.executeTool(
    'search_project_documents',
    { query: 'hollow honeycomb core', limit: 1 },
  ) as {
    matches: Array<{ block: { id: string } }>
  }
  const tableSearch = await modelContext.executeTool(
    'search_project_documents',
    { query: 'Type C 24 x 80 solid wood', limit: 1 },
  ) as {
    matches: Array<{
      block: { id: string }
      matchType: string
      page: { id: string }
      region: { left: number; top: number; width: number; height: number }
      tableRow?: { parentBlockId: string }
    }>
  }
  await screen.findByLabelText('Rendered PDF page A0.0')
  const initialRenderCount = pageRenderer.renderPage.mock.calls.length

  for (const blockId of [submittalSearch.matches[0]!.block.id, 'missing-block']) {
    await expect(modelContext.executeTool('navigate_document', {
      documentId: 'virginia-farmhouse-drawings',
      target: { type: 'block', blockId },
    })).rejects.toThrow(
      'The block does not belong to the current Project Document.',
    )
  }
  expectCurrentPage(/A0\.0, Cover Page/)
  expect(pageRenderer.renderPage).toHaveBeenCalledTimes(initialRenderCount)

  const match = tableSearch.matches[0]!
  expect(match.matchType).toBe('table_row')
  expect(match.tableRow?.parentBlockId).toBe(match.block.id)
  const inspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: 'virginia-farmhouse-drawings',
      documentVersionId: 'virginia-farmhouse-drawings-v1',
      blockIds: [match.block.id],
    },
  ) as {
    pages: Array<{
      blocks: Array<{
        id: string
        region: typeof match.region
      }>
    }>
  }
  const parentTable = inspection.pages[0]!.blocks[0]!
  const tableResult = await modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'block', blockId: match.block.id },
  }) as { region: typeof match.region }
  expect(parentTable.id).toBe(match.block.id)
  expect(tableResult.region).toEqual(parentTable.region)

  const rowResult = await modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'region', pageId: match.page.id, region: match.region },
  })
  expect(rowResult).toMatchObject({
    status: 'applied',
    page: { id: match.page.id },
    type: 'region',
    region: match.region,
  })
})

test('invalid Document Regions fail atomically at the public boundary', async () => {
  const modelContext = createRecordingModelContext()
  const pageRenderer = createTestPageRenderer()
  render(createGroundedApp({
    databaseName: `grounded-invalid-region-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await screen.findByLabelText('Rendered PDF page A0.0')
  const renderCount = pageRenderer.renderPage.mock.calls.length
  const base = {
    documentId: 'virginia-farmhouse-drawings',
    target: {
      type: 'region',
      pageId: 'sheet-a1.2',
      region: { left: 0.8, top: 0.2, width: 0.3, height: 0.2 },
    },
  }

  await expect(modelContext.executeTool('navigate_document', base))
    .rejects.toThrow('contained within the page')
  await expect(modelContext.executeTool('navigate_document', {
    ...base,
    target: {
      ...base.target,
      pageId: 'missing-page',
      region: { left: 0.2, top: 0.2, width: 0.3, height: 0.2 },
    },
  })).rejects.toThrow('The page does not belong to the Project Document.')
  await expect(modelContext.executeTool('navigate_document', {
    ...base,
    target: {
      type: 'page',
      pageId: 'sheet-a1.2',
      region: base.target.region,
    },
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('navigate_document', {
    ...base,
    target: {
      ...base.target,
      region: { ...base.target.region, width: Number.NaN },
    },
  })).rejects.toThrow('Invalid input')

  expectCurrentPage(/A0\.0, Cover Page/)
  expect(screen.getByText('100%')).toBeInTheDocument()
  expect(pageRenderer.renderPage).toHaveBeenCalledTimes(renderCount)
})

test('invalid navigation preserves the applied Document Focus outline', async () => {
  const modelContext = createRecordingModelContext()
  const pageRenderer = createTestPageRenderer()
  render(createGroundedApp({
    databaseName: `grounded-invalid-navigation-focus-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))
  const region = { left: 0.4, top: 0.35, width: 0.2, height: 0.2 }

  await waitForWebMcpReady()
  await modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'region', pageId: 'sheet-a1.2', region },
  })
  const outline = document.querySelector('.document-focus-outline')
  const renderCount = pageRenderer.renderPage.mock.calls.length

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'missing-document',
    target: { type: 'region', pageId: 'sheet-a1.2', region },
  })).rejects.toThrow(
    'The Project Document does not exist in this Project Workspace.',
  )

  expect(document.querySelector('.document-focus-outline')).toBe(outline)
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  expect(pageRenderer.renderPage).toHaveBeenCalledTimes(renderCount)
})

test('Document Focus survives idempotence, yields cleanly to the user, and is not restored after reload', async () => {
  const storage = window.sessionStorage
  const pageRenderer = createTestPageRenderer()
  const firstModelContext = createRecordingModelContext()
  const databaseName = `grounded-transient-region-${crypto.randomUUID()}`
  const firstRender = render(createGroundedApp({
    databaseName,
    modelContext: firstModelContext,
    pageRenderer,
    sessionStorage: storage,
    createId: createIds('session-1'),
  }))
  const input = {
    documentId: 'virginia-farmhouse-drawings',
    target: {
      type: 'region' as const,
      pageId: 'sheet-a1.2',
      region: { left: 0.4, top: 0.35, width: 0.2, height: 0.2 },
    },
  }

  await waitForWebMcpReady()
  await firstModelContext.executeTool('navigate_document', input)
  expect(screen.getByText('400%')).toBeInTheDocument()
  expect(document.querySelector('.document-focus-outline')).toBeInTheDocument()
  const focusedRenderCount = pageRenderer.renderPage.mock.calls.length
  await firstModelContext.executeTool('navigate_document', input)
  expect(pageRenderer.renderPage).toHaveBeenCalledTimes(focusedRenderCount)

  firstRender.unmount()

  const secondModelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName,
    modelContext: secondModelContext,
    pageRenderer,
    sessionStorage: storage,
    createId: createIds('unexpected-session'),
  }))
  await waitForWebMcpReady()
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  expect(screen.getByText('100%')).toBeInTheDocument()

  await secondModelContext.executeTool('navigate_document', input)
  expect(screen.getByText('400%')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
  expect(screen.getByText('390%')).toBeInTheDocument()
  expect(document.querySelector('.document-focus-outline')).not.toBeInTheDocument()
})

test('repeating a dismissed Document Focus restores its outline without rerendering the visible page', async () => {
  const modelContext = createRecordingModelContext()
  const pageRenderer = createTestPageRenderer()
  render(createGroundedApp({
    databaseName: `grounded-repeat-dismissed-focus-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))
  const input = {
    documentId: 'virginia-farmhouse-drawings',
    target: {
      type: 'region' as const,
      pageId: 'sheet-a1.2',
      region: { left: 0.4, top: 0.35, width: 0.2, height: 0.2 },
    },
  }

  await waitForWebMcpReady()
  await modelContext.executeTool('navigate_document', input)
  const outline = document.querySelector('.document-focus-outline')!
  const viewer = outline.closest('.pdf-page-viewer')!
  const frame = outline.closest('.pdf-page-frame')!
  const fittedTransform = frame.getAttribute('style')
  const focusedRenderCount = pageRenderer.renderPage.mock.calls.length

  fireEvent.pointerDown(viewer, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  })
  expect(document.querySelector('.document-focus-outline')).not.toBeInTheDocument()
  expect(frame.getAttribute('style')).toBe(fittedTransform)

  await modelContext.executeTool('navigate_document', input)

  expect(document.querySelector('.document-focus-outline')).toBeInTheDocument()
  expect(frame.getAttribute('style')).toBe(fittedTransform)
  expect(pageRenderer.renderPage).toHaveBeenCalledTimes(focusedRenderCount)
})

test('page and document navigation remove the Document Focus outline', async () => {
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-clear-focus-navigation-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer: createTestPageRenderer(),
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))
  const regionInput = {
    documentId: 'virginia-farmhouse-drawings',
    target: {
      type: 'region' as const,
      pageId: 'sheet-a1.2',
      region: { left: 0.4, top: 0.35, width: 0.2, height: 0.2 },
    },
  }

  await waitForWebMcpReady()
  await modelContext.executeTool('navigate_document', regionInput)
  expect(document.querySelector('.document-focus-outline')).toBeInTheDocument()

  await modelContext.executeTool('navigate_document', {
    documentId: regionInput.documentId,
    target: { type: 'page', pageId: regionInput.target.pageId },
  })
  expect(document.querySelector('.document-focus-outline')).not.toBeInTheDocument()

  await modelContext.executeTool('navigate_document', regionInput)
  expect(document.querySelector('.document-focus-outline')).toBeInTheDocument()
  await modelContext.executeTool('navigate_document', {
    documentId: regionInput.documentId,
  })
  expect(document.querySelector('.document-focus-outline')).not.toBeInTheDocument()
})

test('pointer-down during region rendering dismisses the eventual outline until navigation is repeated', async () => {
  let finishFocusedRender: (() => void) | undefined
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(async ({ canvas, height, pageNumber, width }) => {
      if (pageNumber === 6) {
        await new Promise<void>((resolve) => {
          finishFocusedRender = resolve
        })
      }
      canvas.width = width
      canvas.height = height
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-pending-focus-dismissal-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))
  const input = {
    documentId: 'virginia-farmhouse-drawings',
    target: {
      type: 'region' as const,
      pageId: 'sheet-a1.2',
      region: { left: 0.4, top: 0.35, width: 0.2, height: 0.2 },
    },
  }

  await waitForWebMcpReady()
  await screen.findByLabelText('Rendered PDF page A0.0')
  const navigation = modelContext.executeTool('navigate_document', input)
  await waitFor(() => expect(finishFocusedRender).toBeTypeOf('function'))
  const viewer = document.querySelector('.pdf-page-viewer')!
  fireEvent.pointerDown(viewer, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  })
  act(() => finishFocusedRender?.())
  await navigation
  expect(document.querySelector('.document-focus-outline')).not.toBeInTheDocument()
  const focusedRenderCount = vi.mocked(pageRenderer.renderPage).mock.calls.length

  await modelContext.executeTool('navigate_document', input)

  expect(document.querySelector('.document-focus-outline')).toBeInTheDocument()
  expect(pageRenderer.renderPage).toHaveBeenCalledTimes(focusedRenderCount)
})

test('navigate_document restores the last visible page after a render failure', async () => {
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(async ({ canvas, height, pageNumber, width }) => {
      if (pageNumber === 6) throw new Error('Sensitive renderer details.')
      canvas.width = width
      canvas.height = height
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-navigation-render-failure-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await screen.findByLabelText('Rendered PDF page A0.0')

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page', pageId: 'sheet-a1.2' },
  })).rejects.toThrow('The Project Document page could not be rendered.')

  expectCurrentPage(/A0\.0, Cover Page/)
  expect(screen.getByLabelText('Rendered PDF page A0.0')).toBeVisible()
  expect(screen.queryByText('Sensitive renderer details.')).not.toBeInTheDocument()
})

test('render-failure rollback does not restore a dismissed Document Focus outline', async () => {
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(async ({ canvas, height, pageNumber, width }) => {
      if (pageNumber === 6) throw new Error('Sensitive renderer details.')
      canvas.width = width
      canvas.height = height
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-dismissed-focus-recovery-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))
  const focusedInput = {
    documentId: 'virginia-farmhouse-drawings',
    target: {
      type: 'region' as const,
      pageId: 'sheet-a1.3',
      region: { left: 0.4, top: 0.35, width: 0.2, height: 0.2 },
    },
  }

  await waitForWebMcpReady()
  await modelContext.executeTool('navigate_document', focusedInput)
  const outline = document.querySelector('.document-focus-outline')!
  fireEvent.pointerDown(outline.closest('.pdf-page-viewer')!, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  })
  expect(document.querySelector('.document-focus-outline')).not.toBeInTheDocument()

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page', pageId: 'sheet-a1.2' },
  })).rejects.toThrow('The Project Document page could not be rendered.')

  expectCurrentPage(/A1\.3, 2nd Floor Plan/)
  expect(document.querySelector('.document-focus-outline')).not.toBeInTheDocument()
})

test('failed cross-document navigation restores remembered pages and the exact ordinary fit and zoom', async () => {
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(async ({ canvas, height, pageNumber, url, width }) => {
      if (url.includes('type-c') && pageNumber === 2) {
        throw new Error('Sensitive renderer details.')
      }
      canvas.width = width
      canvas.height = height
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  const user = userEvent.setup()
  render(createGroundedApp({
    databaseName: `grounded-navigation-cross-document-recovery-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'type-c-door-submittal',
  })).resolves.toMatchObject({ page: { id: 'door-submittal-page-1' } })
  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
  })).resolves.toMatchObject({ page: { id: 'sheet-a0.0' } })

  await user.click(screen.getByRole('button', { name: 'Fit width' }))
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  await waitFor(() => expect(screen.getByText('110%')).toBeInTheDocument())
  const ordinaryCanvas = screen.getByLabelText('Rendered PDF page A0.0')
  const ordinarySize = {
    height: (ordinaryCanvas as HTMLCanvasElement).height,
    width: (ordinaryCanvas as HTMLCanvasElement).width,
  }

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'type-c-door-submittal',
    target: { type: 'page', pageId: 'door-submittal-page-2' },
  })).rejects.toThrow('The Project Document page could not be rendered.')

  expectCurrentPage(/A0\.0, Cover Page/)
  expect(screen.getByText('110%')).toBeInTheDocument()
  const restoredCanvas = screen.getByLabelText('Rendered PDF page A0.0')
  expect((restoredCanvas as HTMLCanvasElement).width).toBe(ordinarySize.width)
  expect((restoredCanvas as HTMLCanvasElement).height).toBe(ordinarySize.height)

  await expect(modelContext.executeTool('navigate_document', {
    documentId: 'type-c-door-submittal',
  })).resolves.toMatchObject({
    status: 'applied',
    page: { id: 'door-submittal-page-1' },
  })
  expectCurrentPage(/1, Submittal cover/)
})

test('navigate_document times out after 15 seconds and restores the last visible page', async () => {
  const pending: Array<{ resolve: () => void; signal: AbortSignal }> = []
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(({ canvas, height, pageNumber, signal, width }) => {
      if (pageNumber === 6) {
        return new Promise<void>((resolve) => pending.push({ resolve, signal }))
      }
      canvas.width = width
      canvas.height = height
      return Promise.resolve()
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-navigation-timeout-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await screen.findByLabelText('Rendered PDF page A0.0')
  vi.useFakeTimers()
  try {
    const navigation = modelContext.executeTool('navigate_document', {
      documentId: 'virginia-farmhouse-drawings',
      target: { type: 'page', pageId: 'sheet-a1.2' },
    }).then(
      () => undefined,
      (error: unknown) => error,
    )
    await act(async () => {})
    expectCurrentPage(/A1\.2, 1st Floor Plan/)
    expect(pending).toHaveLength(1)

    await act(async () => {
      vi.advanceTimersByTime(15_000)
    })
    await expect(navigation).resolves.toEqual(expect.objectContaining({
      message: 'Document navigation timed out before the destination became visible.',
    }))
    expectCurrentPage(/A0\.0, Cover Page/)
    expect(pending[0]!.signal.aborted).toBe(true)

    act(() => pending[0]!.resolve())
    expectCurrentPage(/A0\.0, Cover Page/)
  } finally {
    vi.useRealTimers()
  }
})

test('caller cancellation restores the visible page and cannot apply late', async () => {
  let targetRender: { resolve: () => void; signal: AbortSignal } | undefined
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(({ canvas, height, pageNumber, signal, width }) => {
      if (pageNumber === 6) {
        return new Promise<void>((resolve) => {
          targetRender = { resolve, signal }
        })
      }
      canvas.width = width
      canvas.height = height
      return Promise.resolve()
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-navigation-cancel-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await screen.findByLabelText('Rendered PDF page A0.0')
  const controller = new AbortController()
  const navigation = modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page', pageId: 'sheet-a1.2' },
  }, { signal: controller.signal })
  await waitFor(() => expect(targetRender).toBeDefined())

  controller.abort()
  await expect(navigation).rejects.toThrow('Document navigation was cancelled.')
  expectCurrentPage(/A0\.0, Cover Page/)
  expect(targetRender!.signal.aborted).toBe(true)
  act(() => targetRender!.resolve())
  expectCurrentPage(/A0\.0, Cover Page/)
})

test('newer External Agent navigation supersedes an older call and owns visible completion', async () => {
  let oldRender: { resolve: () => void; signal: AbortSignal } | undefined
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(({ canvas, height, pageNumber, signal, width }) => {
      if (pageNumber === 6) {
        return new Promise<void>((resolve) => {
          oldRender = { resolve, signal }
        })
      }
      canvas.width = width
      canvas.height = height
      return Promise.resolve()
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  render(createGroundedApp({
    databaseName: `grounded-navigation-supersession-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await screen.findByLabelText('Rendered PDF page A0.0')
  const older = modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page', pageId: 'sheet-a1.2' },
  })
  await waitFor(() => expect(oldRender).toBeDefined())
  const newer = modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page', pageId: 'sheet-a1.3' },
  })

  await expect(older).resolves.toEqual({
    status: 'superseded',
    requestedDocument: { id: 'virginia-farmhouse-drawings' },
    targetType: 'page',
  })
  await expect(newer).resolves.toMatchObject({
    status: 'applied',
    page: { id: 'sheet-a1.3' },
  })
  expectCurrentPage(/A1\.3, 2nd Floor Plan/)
  expect(oldRender!.signal.aborted).toBe(true)
  act(() => oldRender!.resolve())
  expectCurrentPage(/A1\.3, 2nd Floor Plan/)
})

test.each([
  ['pan', async () => {
    const viewer = document.querySelector('.pdf-page-viewer')!
    fireEvent.pointerDown(viewer, {
      button: 0,
      clientX: 20,
      clientY: 20,
      pointerId: 1,
      pointerType: 'mouse',
    })
    fireEvent.pointerMove(viewer, {
      clientX: 30,
      clientY: 20,
      pointerId: 1,
      pointerType: 'mouse',
    })
  }],
  ['zoom', async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  }],
  ['fit', async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Fit page' }))
  }],
  ['page selection', async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Next' }))
  }],
  ['document selection', async (user: ReturnType<typeof userEvent.setup>) => {
    await chooseDocument(user, /Type C interior door product data/i)
  }],
] as const)('User %s supersedes pending External Agent navigation', async (_name, takeOver) => {
  const pageRenderer: PdfPageRenderer = {
    renderPage: vi.fn(({ canvas, height, pageNumber, width }) => {
      if (pageNumber === 6) return new Promise<void>(() => {})
      canvas.width = width
      canvas.height = height
      return Promise.resolve()
    }),
    prefetchPages() {},
  }
  const modelContext = createRecordingModelContext()
  const user = userEvent.setup()
  render(createGroundedApp({
    databaseName: `grounded-navigation-user-control-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await screen.findByLabelText('Rendered PDF page A0.0')
  const navigation = modelContext.executeTool('navigate_document', {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page', pageId: 'sheet-a1.2' },
  })
  await waitFor(() => expectCurrentPage(/A1\.2, 1st Floor Plan/))

  await takeOver(user)
  await expect(navigation).resolves.toEqual({
    status: 'superseded',
    requestedDocument: { id: 'virginia-farmhouse-drawings' },
    targetType: 'page',
  })
})

test('navigate_document is immediate only while the exact view remains visibly applied', async () => {
  const user = userEvent.setup()
  const modelContext = createRecordingModelContext()
  const pageRenderer = createTestPageRenderer()
  render(createGroundedApp({
    databaseName: `grounded-navigation-idempotence-${crypto.randomUUID()}`,
    modelContext,
    pageRenderer,
    sessionStorage: window.sessionStorage,
    createId: createIds('session-1'),
  }))

  await waitForWebMcpReady()
  await screen.findByLabelText('Rendered PDF page A0.0')
  const input = {
    documentId: 'virginia-farmhouse-drawings',
    target: { type: 'page' as const, pageId: 'sheet-a1.2' },
  }
  await expect(modelContext.executeTool('navigate_document', input))
    .resolves.toMatchObject({ status: 'applied' })
  const appliedRenderCount = pageRenderer.renderPage.mock.calls.length
  const frame = document.querySelector('.pdf-page-frame')!
  const appliedTransform = frame.getAttribute('style')

  await expect(modelContext.executeTool('navigate_document', input))
    .resolves.toMatchObject({ status: 'applied' })
  expect(pageRenderer.renderPage).toHaveBeenCalledTimes(appliedRenderCount)

  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  await waitFor(() => expect(screen.getByText('110%')).toBeInTheDocument())
  expect(frame.getAttribute('style')).not.toBe(appliedTransform)
  await expect(modelContext.executeTool('navigate_document', input))
    .resolves.toMatchObject({ status: 'applied', fit: 'page', zoom: 1 })
  expect(screen.getByText('100%')).toBeInTheDocument()
  expect(frame.getAttribute('style')).toBe(appliedTransform)
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

  await waitForWebMcpReady()
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
  expect(within(currentAssistance).getByRole('button', {
    name: 'Open supporting page 1: Submittal cover',
  })).toBeInTheDocument()
  expect(within(currentAssistance).getByRole('button', {
    name: 'Open supporting page 2: Hollow-core flush wood door product data',
  })).toBeInTheDocument()
  expect(within(currentAssistance).queryByText('FIFO work rail'))
    .not.toBeInTheDocument()
  expect(within(currentAssistance).queryByText('request-1'))
    .not.toBeInTheDocument()
  expect(within(currentAssistance).getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  })).toBeInTheDocument()
  expect(within(currentAssistance).getByRole('button', {
    name: 'Open A4.3: Doors & Windows',
  })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Current page:/ }))
  let pagePicker = screen.getByRole('dialog', { name: 'Choose a page' })
  expect(within(pagePicker).getByRole('option', {
    name: /^A1\.2 1st Floor Plan$/,
  })).toHaveAccessibleDescription('Recommended')
  expect(within(pagePicker).getByRole('option', {
    name: /^A4\.3 Doors & Windows$/,
  })).toHaveAccessibleDescription('Recommended')
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))
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
  await user.keyboard('{Escape}')
  await user.click(within(currentAssistance).getByRole('button', {
    name: 'Open A4.3: Doors & Windows',
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
  await waitForWebMcpReady()

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
  await user.click(screen.getByRole('button', { name: 'Show Point Set' }))
  const reloadedOverlay = await screen.findByLabelText('Drawing page A1.2')
  const reloadedMark = within(reloadedOverlay).getByText('1')
  expect(reloadedOverlay).toContainElement(reloadedMark)
  expect(reloadedOverlay).toHaveAttribute('role', 'group')
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
  const hidePointSet = screen.getByRole('button', { name: 'Hide Point Set' })
  expect(hidePointSet).toHaveAttribute('aria-pressed', 'true')
  await user.click(hidePointSet)
  expectCurrentPage(/A4\.3, Doors & Windows/)
  expect(reloadedSecondOverlay.querySelector('.point-mark')).toBeNull()
  expect(screen.getByRole('button', { name: 'Show Point Set' }))
    .toHaveAttribute('aria-pressed', 'false')
})

test('the public Type C journey reaches a revise-and-resubmit disposition', async () => {
  const user = userEvent.setup()
  const storage = window.sessionStorage
  const databaseName = `grounded-type-c-journey-${crypto.randomUUID()}`
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

  type CatalogDocument = {
    id: string
    versionId: string
    pages: Array<{ id: string; label: string; number: number }>
  }
  type SearchMatch = {
    rank: number
    document: { id: string; versionId: string }
    page: { id: string; sheetNumber?: string }
    block: { id: string; type: string }
    classification: 'document_evidence' | 'search_hint'
    tableRow?: {
      parentBlockId: string
      cells: Array<{ text: string }>
    }
  }
  type Inspection = {
    pages: Array<{
      blocks: Array<{
        id: string
        sourceType: string
        content: string
        classification: 'document_evidence' | 'search_hint'
      }>
      tableRows: Array<{
        parentBlockId: string
        cells: Array<{ text: string }>
      }>
    }>
  }

  await waitForWebMcpReady()
  const project = await modelContext.executeTool('get_project_workspace', {})
  const catalog = await modelContext.executeTool(
    'list_project_documents',
    {},
  ) as { documents: CatalogDocument[] }
  expect(project).toMatchObject({
    project: {
      id: 'demo-virginia-farmhouse',
      title: 'Virginia Farmhouse Demo Project',
      documentCount: 2,
    },
  })
  expect(catalog.documents).toHaveLength(2)

  const search = async (query: string) => modelContext.executeTool(
    'search_project_documents',
    { query },
  ) as Promise<{ matches: SearchMatch[] }>
  const productMatch = (await search('hollow honeycomb core')).matches[0]!
  const contractMatch = (await search('Type C 24 x 80 solid wood')).matches[0]!
  const planMatch = (
    await search('first floor plan room layout utility coats WC')
  ).matches[0]!

  expect(productMatch).toMatchObject({
    rank: 1,
    document: { id: 'type-c-door-submittal' },
    page: { id: 'door-submittal-page-2' },
    classification: 'document_evidence',
  })
  expect(contractMatch).toMatchObject({
    rank: 1,
    document: { id: 'virginia-farmhouse-drawings' },
    page: { id: 'sheet-a4.3', sheetNumber: 'A4.3' },
    block: { type: 'Table' },
    classification: 'document_evidence',
    tableRow: {
      cells: [
        { text: 'C' },
        { text: '24"x80"' },
        { text: 'WOOD' },
        { text: '1-PANEL' },
        { text: 'SOLID WOOD' },
        { text: 'ANTIQUE PREFERRED' },
      ],
    },
  })
  expect(planMatch).toMatchObject({
    rank: 1,
    document: { id: 'virginia-farmhouse-drawings' },
    page: { id: 'sheet-a1.2', sheetNumber: 'A1.2' },
    block: { type: 'Figure' },
    classification: 'search_hint',
  })

  const productInspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: productMatch.document.id,
      documentVersionId: productMatch.document.versionId,
      pageIds: [productMatch.page.id],
    },
  ) as Inspection
  const contractInspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: contractMatch.document.id,
      documentVersionId: contractMatch.document.versionId,
      blockIds: [contractMatch.tableRow!.parentBlockId],
    },
  ) as Inspection
  const planInspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: planMatch.document.id,
      documentVersionId: planMatch.document.versionId,
      blockIds: [planMatch.block.id],
    },
  ) as Inspection
  const productContent = productInspection.pages
    .flatMap((page) => page.blocks.map((block) => block.content))
    .join(' ')
  const typeCRow = contractInspection.pages
    .flatMap((page) => page.tableRows)
    .find((row) => row.cells[0]?.text === 'C')!
  const inspectedPlanHint = planInspection.pages
    .flatMap((page) => page.blocks)
    .find((block) => block.id === planMatch.block.id)!

  expect(productContent).toContain('Model BRD-HC2480-BIR')
  expect(productContent).toContain('24 in x 80 in')
  expect(productContent).toContain('Hollow honeycomb core')
  expect(typeCRow.cells.map((cell) => cell.text)).toEqual([
    'C',
    '24"x80"',
    'WOOD',
    '1-PANEL',
    'SOLID WOOD',
    'ANTIQUE PREFERRED',
  ])
  expect(inspectedPlanHint).toMatchObject({
    sourceType: 'Figure',
    classification: 'search_hint',
    content: expect.stringContaining('utility, coats, and WC'),
  })

  const submittalDocument = catalog.documents.find(
    (document) =>
      document.id === productMatch.document.id &&
      document.versionId === productMatch.document.versionId,
  )!
  const request = await modelContext.executeTool('create_assistance_request', {
    question: 'Mark every affected Type C opening on the first-floor plan.',
    responseType: 'point_set',
    documentId: planMatch.document.id,
    documentVersionId: planMatch.document.versionId,
    recommendedPageIds: [planMatch.page.id],
    supportingDocumentReferences: [
      {
        documentId: contractMatch.document.id,
        documentVersionId: contractMatch.document.versionId,
        pageIds: [contractMatch.page.id],
      },
      {
        documentId: submittalDocument.id,
        documentVersionId: submittalDocument.versionId,
        pageIds: submittalDocument.pages.map((page) => page.id),
      },
    ],
  }) as { id: string; state: string; createdAt: string }
  expect(request).toEqual({
    id: 'request-1',
    state: 'pending',
    createdAt: '2030-01-02T03:04:05.000Z',
  })

  await screen.findByText('Mark every affected Type C opening on the first-floor plan.')
  const currentAssistance = screen
    .getByRole('heading', { name: 'Current Assistance' })
    .closest('aside')!
  expect(within(currentAssistance).getByText('A1.2')).toBeInTheDocument()
  expect(within(currentAssistance).getAllByText('Virginia Farmhouse drawing set'))
    .toHaveLength(2)
  expect(within(currentAssistance).getByText(
    'Type C interior door product data and review cover',
  )).toBeInTheDocument()
  expect(within(currentAssistance).getByRole('button', {
    name: 'Open supporting page A4.3: Doors & Windows',
  })).toBeInTheDocument()
  expect(within(currentAssistance).getByRole('button', {
    name: 'Open supporting page 1: Submittal cover',
  })).toBeInTheDocument()
  expect(within(currentAssistance).getByRole('button', {
    name: 'Open supporting page 2: Hollow-core flush wood door product data',
  })).toBeInTheDocument()

  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))
  const drawingPage = await screen.findByLabelText('Drawing page A1.2')
  Object.defineProperty(drawingPage, 'getBoundingClientRect', {
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
  fireEvent.click(drawingPage, { clientX: 20, clientY: 30 })
  fireEvent.click(drawingPage, { clientX: 50, clientY: 60 })
  fireEvent.click(drawingPage, { clientX: 80, clientY: 40 })
  await screen.findByText('3 points')
  await user.type(
    screen.getByLabelText('Overall note optional'),
    'WC, Utility, and Coats each have one affected Type C opening.',
  )
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
  await waitForWebMcpReady()
  const recoveredWorkspace = await reloadedModelContext.executeTool(
    'get_project_workspace',
    {},
  ) as {
    assistance: {
      latestCompleted: { id: string; state: string; responseType: string }
    }
  }
  expect(recoveredWorkspace.assistance.latestCompleted).toMatchObject({
    id: request.id,
    state: 'answered',
    responseType: 'point_set',
  })
  const retrieved = await reloadedModelContext.executeTool(
    'get_assistance_request',
    { id: recoveredWorkspace.assistance.latestCompleted.id },
  ) as {
    id: string
    state: string
    question: string
    createdAt: string
    professionalResponse: {
      type: string
      document: { id: string; versionId: string }
      points: Array<{
        pointNumber: number
        page: { id: string; label: string; number: number }
        x: number
        y: number
      }>
      count: number
      note: string
      submittedAt: string
    }
  }
  expect(retrieved).toEqual({
    id: request.id,
    state: 'answered',
    question: 'Mark every affected Type C opening on the first-floor plan.',
    createdAt: '2030-01-02T03:04:05.000Z',
    professionalResponse: {
      type: 'point_set',
      document: {
        id: planMatch.document.id,
        versionId: planMatch.document.versionId,
      },
      points: [
        {
          pointNumber: 1,
          page: { id: planMatch.page.id, label: 'A1.2', number: 6 },
          x: 0.2,
          y: 0.3,
        },
        {
          pointNumber: 2,
          page: { id: planMatch.page.id, label: 'A1.2', number: 6 },
          x: 0.5,
          y: 0.6,
        },
        {
          pointNumber: 3,
          page: { id: planMatch.page.id, label: 'A1.2', number: 6 },
          x: 0.8,
          y: 0.4,
        },
      ],
      count: 3,
      note: 'WC, Utility, and Coats each have one affected Type C opening.',
      submittedAt: '2030-01-02T03:04:05.000Z',
    },
  })

  const requiredConstruction = typeCRow.cells.map((cell) => cell.text)
  const disposition =
    productContent.includes('Hollow honeycomb core') &&
    requiredConstruction.includes('SOLID WOOD') &&
    retrieved.professionalResponse.count > 0
      ? 'revise and resubmit'
      : 'no demonstrated mismatch'
  expect(disposition).toBe('revise and resubmit')
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

  await waitForWebMcpReady()
  await modelContext.executeTool('create_assistance_request', {
    ...requestInput,
    recommendedPageIds: ['sheet-a4.3'],
  })
  await screen.findByText(requestInput.question)
  await user.click(screen.getByRole('button', {
    name: 'Open A4.3: Doors & Windows',
  }))

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
  await user.click(screen.getByRole('button', { name: 'Show Point Set' }))
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
  await waitForWebMcpReady()
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)

  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))
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

  await waitForWebMcpReady()
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

test('an Assistance Request leaves Document Browsing in place until a target page is opened', async () => {
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

  await waitForWebMcpReady()
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

  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))

  expect(screen.getByRole('heading', { name: 'Virginia Farmhouse drawing set' }))
    .toBeInTheDocument()
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  expect(screen.getByText('100%')).toBeInTheDocument()
})

test('the target link uses the target document first page without a recommendation', async () => {
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

  await waitForWebMcpReady()
  await choosePage(user, /^A4\.3 Doors & Windows$/)
  await modelContext.executeTool('create_assistance_request', {
    ...requestInput,
    recommendedPageIds: [],
  })
  await screen.findByText(requestInput.question)

  expectCurrentPage(/A4\.3, Doors & Windows/)
  await user.click(screen.getByRole('button', {
    name: 'Open A0.0: Cover Page',
  }))
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

  await waitForWebMcpReady()
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

  await waitForWebMcpReady()
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)

  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))
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
  const draftMarker = within(targetPage)
    .getByRole('button', { name: 'Point 1' })
    .closest('.point-mark') as HTMLElement
  const markerPosition = {
    left: draftMarker.style.left,
    top: draftMarker.style.top,
  }
  expect(markerPosition).toEqual({ left: '40%', top: '60%' })

  await chooseDocument(user, /Type C interior door product data and review cover/i)
  await choosePage(user, /^2 Hollow-core flush wood door product data$/)
  await user.click(screen.getByRole('button', { name: 'Zoom in' }))
  await user.type(screen.getByLabelText('Overall note optional'), 'Keep this draft')

  const visibleState = () => ({
    document: screen.getByRole('heading', {
      name: 'Type C interior door product data and review cover',
    }).textContent,
    page: screen.getByRole('button', { name: /Current page:/ })
      .getAttribute('aria-label'),
    zoom: screen.getByText('110%').textContent,
    assistanceTab: {
      name: screen.getByRole('tab', { name: 'Current 1' }).textContent,
      selected: screen.getByRole('tab', { name: 'Current 1' })
        .getAttribute('aria-selected'),
    },
    pointCount: screen.getByText('1 point').textContent,
    note: (screen.getByLabelText('Overall note optional') as HTMLTextAreaElement).value,
  })
  const beforeSearch = visibleState()
  expect(beforeSearch).toEqual({
    document: 'Type C interior door product data and review cover',
    page: 'Current page: 2, Hollow-core flush wood door product data',
    zoom: '110%',
    assistanceTab: { name: 'Current 1', selected: 'true' },
    pointCount: '1 point',
    note: 'Keep this draft',
  })
  const searchResult = await modelContext.executeTool('search_project_documents', {
    query: 'Type C 24 x 80 solid wood',
  }) as {
    matches: Array<{
      document: { id: string; versionId: string }
      block: { id: string }
    }>
  }
  expect(visibleState()).toEqual(beforeSearch)

  const contractMatch = searchResult.matches[0]!
  await modelContext.executeTool('inspect_document_evidence', {
    documentId: contractMatch.document.id,
    documentVersionId: contractMatch.document.versionId,
    blockIds: [contractMatch.block.id],
  })
  expect(visibleState()).toEqual(beforeSearch)

  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))
  const restoredTargetPage = await screen.findByLabelText('Drawing page A1.2')
  expect(
    within(restoredTargetPage)
      .getByRole('button', { name: 'Point 1' })
      .closest('.point-mark'),
  ).toHaveStyle({
    left: markerPosition.left,
    top: markerPosition.top,
  })
})

test('the Human Reviewer works the FIFO queue through Current, Queue, and Done', async () => {
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
  await waitForWebMcpReady()
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
  expect(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  })).toBeInTheDocument()
  expect(screen.getByRole('button', {
    name: 'Open A4.3: Doors & Windows',
  })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Hide Assistance' }))
  const multiPageStrip = screen.getByLabelText('Active Assistance Request')
  expect(within(multiPageStrip).queryByRole('button', { name: 'Open A1.2' }))
    .not.toBeInTheDocument()
  await user.click(within(multiPageStrip).getByRole('button', {
    name: 'View request',
  }))
  await choosePage(user, /^A4\.3 Doors & Windows$/)
  expect(await screen.findByLabelText('Drawing page A4.3')).toHaveAttribute('role', 'group')

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
    name: 'Show Point Set',
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

  await waitForWebMcpReady()
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  expect(screen.queryByLabelText('Active Assistance Request')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Hide Assistance' }))
  expect(screen.queryByRole('heading', { name: 'Current Assistance' }))
    .not.toBeInTheDocument()
  const strip = screen.getByLabelText('Active Assistance Request')
  expect(within(strip).getByText('Point Set, 0 marked')).toBeInTheDocument()
  expect(within(strip).getByRole('button', { name: 'Open A1.2' }))
    .toBeInTheDocument()

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

test('supporting references preserve the Point Set draft and returning to the target resumes placement', async () => {
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

  await waitForWebMcpReady()
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))
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

  await user.click(screen.getByRole('button', {
    name: 'Open supporting page 2: Hollow-core flush wood door product data',
  }))
  expect(screen.getByRole('heading', {
    name: 'Type C interior door product data and review cover',
  })).toBeInTheDocument()
  expectCurrentPage(/2, Hollow-core flush wood door product data/)
  expect(screen.getByText('100%')).toBeInTheDocument()
  expect(screen.getByLabelText('Drawing page 2')).toHaveAttribute('role', 'group')
  expect(screen.getByText(requestInput.question)).toBeInTheDocument()
  expect(screen.getByText('1 point')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Hide Assistance' }))
  const strip = screen.getByLabelText('Active Assistance Request')
  expect(within(strip).getByText('Point Set, 1 marked')).toBeInTheDocument()
  await user.click(within(strip).getByRole('button', { name: 'Return to A1.2' }))
  expectCurrentPage(/A1\.2, 1st Floor Plan/)
  const returnedOverlay = await screen.findByLabelText('Drawing page A1.2')
  expect(within(returnedOverlay).getByText('1')).toBeInTheDocument()
  expect(returnedOverlay).toHaveAttribute('role', 'group')
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

  await waitForWebMcpReady()
  await modelContext.executeTool('create_assistance_request', requestInput)
  await screen.findByText(requestInput.question)
  await user.click(screen.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }))

  const targetOverlay = await screen.findByLabelText('Drawing page A1.2')
  expect(targetOverlay).toHaveAttribute('role', 'group')
  expect(screen.getByRole('status')).toHaveTextContent('Rendering PDF page')
  fireEvent.click(targetOverlay, { clientX: 20, clientY: 20 })
  expect(screen.getByText('0 points')).toBeInTheDocument()

  resolveTargetRender?.()
  await waitFor(() => expect(targetOverlay).toHaveClass('marking'))
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
  expect(failedOverlay).toHaveAttribute('role', 'group')
  fireEvent.click(failedOverlay, { clientX: 20, clientY: 20 })
  expect(screen.getByText('1 point')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open authoritative PDF page' }))
    .toHaveAttribute('href', '/demo-project/virginia-farmhouse-drawing-set.pdf#page=7')
})

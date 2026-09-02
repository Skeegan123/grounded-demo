import { expect, test } from 'vitest'
import { createDocuments } from '../documents/documents'
import { createRecordingModelContext } from './recordingModelContext'
import { registerDocumentTools } from './registerDocumentTools'

test('an External Agent discovers documents and inspects page or block evidence', async () => {
  const documents = createDocuments()
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(modelContext, documents, controller.signal)

  const project = await modelContext.executeTool('get_project_workspace', {})
  const catalog = await modelContext.executeTool('list_project_documents', {})
  const pageInspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: 'virginia-farmhouse-drawings',
      documentVersionId: 'virginia-farmhouse-drawings-v1',
      pageIds: ['sheet-a4.3'],
    },
  ) as {
    provenance: {
      provider: string
      verified: { model: string; parseExportSha256: string }
    }
    pages: Array<{
      blocks: Array<{
        id: string
        sourceType: string
        content: string
        contentFormat: string
        classification: string
        region: unknown
        provenance: unknown
      }>
      tableRows: Array<{ parentBlockId: string; cells: Array<{ text: string }> }>
    }>
  }
  const table = pageInspection.pages[0]!.blocks.find(
    (block) => block.sourceType === 'Table' && block.content.includes('SOLID WOOD'),
  )!
  const blockInspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: 'virginia-farmhouse-drawings',
      documentVersionId: 'virginia-farmhouse-drawings-v1',
      blockIds: [table.id],
    },
  ) as typeof pageInspection

  expect({
    project,
    catalog: (catalog as { documents: Array<{ id: string; pageCount: number }> })
      .documents.map(({ id, pageCount }) => ({ id, pageCount })),
    pageInspection: {
      provenance: {
        provider: pageInspection.provenance.provider,
        model: pageInspection.provenance.verified.model,
        parseExportSha256:
          pageInspection.provenance.verified.parseExportSha256,
      },
      table: {
        contentFormat: table.contentFormat,
        classification: table.classification,
        region: table.region,
        provenance: table.provenance,
      },
      typeCRow: pageInspection.pages[0]!.tableRows.find(
        (row) => row.parentBlockId === table.id && row.cells[0]?.text === 'C',
      )?.cells.map((cell) => cell.text),
    },
    blockInspection: {
      blocks: blockInspection.pages[0]!.blocks.map((block) => block.id),
      rowParents: [...new Set(
        blockInspection.pages[0]!.tableRows.map((row) => row.parentBlockId),
      )],
    },
    annotations: [
      modelContext.getTool('get_project_workspace')?.annotations,
      modelContext.getTool('list_project_documents')?.annotations,
      modelContext.getTool('search_project_documents')?.annotations,
      modelContext.getTool('inspect_document_evidence')?.annotations,
    ],
    obsoleteTool: modelContext.getTool('inspect_document_text'),
  }).toEqual({
    project: {
      id: 'demo-virginia-farmhouse',
      title: 'Virginia Farmhouse Demo Project',
      description:
        'A Project Workspace for reviewing Type C interior door product data against the contract drawings.',
    },
    catalog: [
      { id: 'virginia-farmhouse-drawings', pageCount: 25 },
      { id: 'type-c-door-submittal', pageCount: 2 },
    ],
    pageInspection: {
      provenance: {
        provider: 'reducto',
        model: 'r-1',
        parseExportSha256:
          'c2b333cb18e0a10fe704743ddff5933756d5122616a6be4a45c4b28f4289d674',
      },
      table: {
        contentFormat: 'html',
        classification: 'document_evidence',
        region: {
          left: expect.any(Number),
          top: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        },
        provenance: { provider: 'reducto', sourceType: 'Table' },
      },
      typeCRow: ['C', '24"x80"', 'WOOD', '1-PANEL', 'SOLID WOOD', 'ANTIQUE PREFERRED'],
    },
    blockInspection: {
      blocks: [table.id],
      rowParents: [table.id],
    },
    annotations: Array(4).fill({
      readOnlyHint: true,
      untrustedContentHint: true,
    }),
    obsoleteTool: undefined,
  })

  controller.abort()
})

test('inspection input requires one exclusive non-empty unique selector', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(
    modelContext,
    createDocuments(),
    controller.signal,
  )
  const identity = {
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
  }

  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    pageIds: [],
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    blockIds: ['block-a', 'block-a'],
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    pageIds: ['sheet-a4.3'],
    blockIds: ['block-a'],
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    pageIds: ['sheet-a4.3'],
    extra: true,
  })).rejects.toThrow('Invalid input')

  controller.abort()
})

test('inspection bounds every identifier and page or block selector collection', async () => {
  const documents = createDocuments()
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(modelContext, documents, controller.signal)
  const identity = {
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
  }
  const fivePageIds = [
    'sheet-a2.2',
    'sheet-a2.0',
    'sheet-a2.3',
    'sheet-a1.6',
    'sheet-a2.1',
  ]
  const sixPageIds = [...fivePageIds, 'sheet-a3.1']
  const availableBlockIds = [
    'sheet-a0.0',
    'sheet-a0.1',
    'sheet-a0.2',
  ].flatMap((pageId) => documents.inspectEvidence({
    ...identity,
    pageIds: [pageId],
  }).pages.flatMap((page) => page.blocks.map((block) => block.id)))
  expect(availableBlockIds.length).toBeGreaterThanOrEqual(51)

  const fivePages = await modelContext.executeTool(
    'inspect_document_evidence',
    { ...identity, pageIds: fivePageIds },
  ) as { pages: unknown[] }
  const fiftyBlocks = await modelContext.executeTool(
    'inspect_document_evidence',
    { ...identity, blockIds: availableBlockIds.slice(0, 50) },
  ) as { pages: Array<{ blocks: unknown[] }> }

  expect(fivePages.pages).toHaveLength(5)
  expect(fiftyBlocks.pages.flatMap((page) => page.blocks)).toHaveLength(50)
  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    pageIds: sixPageIds,
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('inspect_document_evidence', {
    ...identity,
    blockIds: availableBlockIds.slice(0, 51),
  })).rejects.toThrow('Invalid input')

  const maxIdentifier = 'x'.repeat(200)
  const oversizedIdentifier = 'x'.repeat(201)
  const acceptedBoundaryInputs = [
    { ...identity, documentId: maxIdentifier, pageIds: ['sheet-a4.3'] },
    { ...identity, documentVersionId: maxIdentifier, pageIds: ['sheet-a4.3'] },
    { ...identity, pageIds: [maxIdentifier] },
    { ...identity, blockIds: [maxIdentifier] },
  ]
  const rejectedBoundaryInputs = [
    { ...identity, documentId: oversizedIdentifier, pageIds: ['sheet-a4.3'] },
    { ...identity, documentVersionId: oversizedIdentifier, pageIds: ['sheet-a4.3'] },
    { ...identity, pageIds: [oversizedIdentifier] },
    { ...identity, blockIds: [oversizedIdentifier] },
  ]
  for (const input of acceptedBoundaryInputs) {
    await expect(
      modelContext.executeTool('inspect_document_evidence', input),
    ).rejects.not.toThrow('Invalid input')
  }
  for (const input of rejectedBoundaryInputs) {
    await expect(
      modelContext.executeTool('inspect_document_evidence', input),
    ).rejects.toThrow('Invalid input')
  }

  controller.abort()
})

test('inspection caps the complete serialized UTF-8 response without partial evidence', async () => {
  const maxBytes = 512 * 1024
  type InspectionResult = ReturnType<
    ReturnType<typeof createDocuments>['inspectEvidence']
  >
  const utf8ByteLength = (value: string) => new TextEncoder().encode(value).byteLength
  const inspectionResultAtSize = (targetBytes: number): InspectionResult => {
    const result: InspectionResult = {
      document: {
        id: 'document',
        versionId: 'document-v1',
        kind: 'contract_drawings',
        title: 'Boundary document',
      },
      source: {
        fingerprint: 'f'.repeat(64),
        byteSize: 1,
        pageCount: 1,
      },
      provenance: {
        provider: 'reducto',
        importerVersion: 'boundary-test',
        sourceFingerprint: 'f'.repeat(64),
        verified: {
          parseExportSha256: 'a'.repeat(64),
          model: 'r-1',
          modelSource: 'usage.usage_breakdown.parse_model',
        },
        maintainerDeclaredParseSettings: {
          chunking: 'disabled',
          embeddingOptimization: false,
          returnedImages: false,
          tableOutputFormat: 'html',
          agenticPass: false,
          returnedOcrData: true,
        },
      },
      pages: [{
        page: {
          id: 'page',
          label: 'Page',
          number: 1,
          title: 'Boundary page',
          width: 1,
          height: 1,
          rotation: 0,
        },
        blocks: [{
          id: 'block',
          order: 0,
          sourceType: 'Text',
          content: '',
          contentFormat: 'text',
          region: { left: 0, top: 0, width: 1, height: 1 },
          classification: 'document_evidence',
          provenance: { provider: 'reducto', sourceType: 'Text' },
        }],
        tableRows: [],
      }],
    }
    const contentBytes = targetBytes - utf8ByteLength(JSON.stringify(result))
    if (contentBytes < 0) throw new Error('Target response size is too small.')
    result.pages[0]!.blocks[0]!.content =
      'é'.repeat(Math.floor(contentBytes / 2)) + 'x'.repeat(contentBytes % 2)
    expect(utf8ByteLength(JSON.stringify(result))).toBe(targetBytes)
    return result
  }
  const executeSizedInspection = async (targetBytes: number) => {
    const result = inspectionResultAtSize(targetBytes)
    const documents = {
      ...createDocuments(),
      inspectEvidence: () => result,
    }
    const modelContext = createRecordingModelContext()
    const controller = new AbortController()
    await registerDocumentTools(modelContext, documents, controller.signal)
    const execution = modelContext.executeTool('inspect_document_evidence', {
      documentId: 'document',
      documentVersionId: 'document-v1',
      pageIds: ['page'],
    })
    return { controller, execution }
  }

  const below = await executeSizedInspection(maxBytes - 1)
  await expect(below.execution).resolves.toEqual(
    expect.objectContaining({ document: expect.objectContaining({ id: 'document' }) }),
  )
  below.controller.abort()

  const above = await executeSizedInspection(maxBytes + 1)
  let partialResult: unknown
  let boundaryError: unknown
  try {
    partialResult = await above.execution
  } catch (error) {
    boundaryError = error
  }
  expect(partialResult).toBeUndefined()
  expect(boundaryError).toEqual(new Error(
    'Inspection response exceeds 512 KiB. Narrow the pageIds or blockIds selectors and retry.',
  ))
  expect(utf8ByteLength((boundaryError as Error).message)).toBeLessThan(200)
  above.controller.abort()
})

test('an External Agent searches concise cross-document evidence before inspection', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(
    modelContext,
    createDocuments(),
    controller.signal,
  )

  const contract = await modelContext.executeTool('search_project_documents', {
    query: 'Type C 24 x 80 solid wood',
    limit: 2,
  }) as {
    query: string
    matches: Array<{
      rank: number
      matchedTerms: string[]
      document: { id: string; versionId: string }
      page: { id: string; sheetNumber?: string }
      block: { id: string; type: string }
      matchType: string
      snippet: string
      region: unknown
      classification: string
      tableRow?: {
        parentBlockId: string
        cells: Array<{ text: string }>
      }
    }>
  }
  const product = await modelContext.executeTool('search_project_documents', {
    query: 'BRD-HC2480-BIR',
  }) as typeof contract
  const searchTool = modelContext.getTool('search_project_documents')

  const contractMatch = contract.matches[0]!
  expect({
    query: contract.query,
    rank: contractMatch.rank,
    matchedTerms: contractMatch.matchedTerms,
    document: {
      id: contractMatch.document.id,
      versionId: contractMatch.document.versionId,
    },
    page: {
      id: contractMatch.page.id,
      sheetNumber: contractMatch.page.sheetNumber,
    },
    block: contractMatch.block,
    matchType: contractMatch.matchType,
    snippet: contractMatch.snippet,
    region: contractMatch.region,
    classification: contractMatch.classification,
    parentBlockId: contractMatch.tableRow?.parentBlockId,
    cells: contractMatch.tableRow?.cells.map((cell) => cell.text),
  }).toEqual({
    query: 'type c 24x80 solid wood',
    rank: 1,
    matchedTerms: ['type', 'c', '24x80', 'solid', 'wood'],
    document: {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
    },
    page: { id: 'sheet-a4.3', sheetNumber: 'A4.3' },
    block: { id: expect.any(String), type: 'Table' },
    matchType: 'table_row',
    snippet: 'C | 24"x80" | WOOD | 1-PANEL | SOLID WOOD | ANTIQUE PREFERRED',
    region: {
      left: expect.any(Number),
      top: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    },
    classification: 'document_evidence',
    parentBlockId: contractMatch.block.id,
    cells: ['C', '24"x80"', 'WOOD', '1-PANEL', 'SOLID WOOD', 'ANTIQUE PREFERRED'],
  })
  expect(contract.matches).toHaveLength(2)
  expect(product.matches[0]).toMatchObject({
    rank: 1,
    document: { id: 'type-c-door-submittal' },
    page: { id: 'door-submittal-page-2' },
    snippet: 'Model BRD-HC2480-BIR',
    classification: 'document_evidence',
  })
  expect(searchTool?.annotations).toEqual({
    readOnlyHint: true,
    untrustedContentHint: true,
  })
  expect(searchTool?.description).toContain('does not answer the question')
  expect(searchTool?.description).toContain('inspect_document_evidence')
  expect(searchTool?.description).toContain('Search Hints cannot support a claim')
  expect(searchTool?.description).toContain('requires the Senior Project Manager')

  controller.abort()
})

test('search tolerates ordinary query differences without weakening exact precedence', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(
    modelContext,
    createDocuments(),
    controller.signal,
  )

  type SearchResult = {
    query: string
    matches: Array<{
      rank: number
      matchedTerms: string[]
      document: { id: string; versionId: string }
      page: { id: string; sheetNumber?: string }
      block: { id: string; type: string }
      matchType: string
      snippet: string
      classification: string
      tableRow?: { cells: Array<{ text: string }> }
    }>
  }
  const search = async (query: string, limit?: number) =>
    modelContext.executeTool('search_project_documents', {
      query,
      ...(limit === undefined ? {} : { limit }),
    }) as Promise<SearchResult>

  const fuzzy = await search('honycomb interior dor core')
  const repeatedFuzzy = await search('honycomb interior dor core')
  const reorderedPlural = await search('wood-solid, Type C doors: 24" x 80"')
  const exactProduct = await search('BRD-HC2480-BIR')
  const exactSheet = await search('A4.3')

  expect(repeatedFuzzy).toEqual(fuzzy)
  expect(fuzzy.matches).toContainEqual(expect.objectContaining({
    document: expect.objectContaining({ id: 'type-c-door-submittal' }),
    page: expect.objectContaining({ id: 'door-submittal-page-2' }),
    matchedTerms: expect.arrayContaining(['honycomb', 'interior', 'core']),
    classification: 'document_evidence',
  }))
  expect(reorderedPlural.matches[0]).toMatchObject({
    rank: 1,
    matchedTerms: ['wood', 'solid', 'type', 'c', 'doors', '24x80'],
    document: { id: 'virginia-farmhouse-drawings' },
    page: { id: 'sheet-a4.3', sheetNumber: 'A4.3' },
    matchType: 'table_row',
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
  expect(exactProduct.matches[0]).toMatchObject({
    rank: 1,
    matchedTerms: ['brd-hc2480-bir'],
    document: { id: 'type-c-door-submittal' },
    page: { id: 'door-submittal-page-2' },
    snippet: 'Model BRD-HC2480-BIR',
  })
  expect(exactSheet.matches[0]).toMatchObject({
    rank: 1,
    matchedTerms: ['a4.3'],
    document: { id: 'virginia-farmhouse-drawings' },
    page: { id: 'sheet-a4.3', sheetNumber: 'A4.3' },
  })
  expect(exactProduct.matches[0]).not.toHaveProperty('score')
  expect(exactProduct.matches[0]).not.toHaveProperty('confidence')

  controller.abort()
})

test('search labels generated hints and returns an honest empty miss', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(
    modelContext,
    createDocuments(),
    controller.signal,
  )

  type SearchResult = {
    query: string
    matches: Array<{
      rank: number
      document: { id: string; versionId: string }
      page: { id: string; sheetNumber?: string }
      block: { id: string; type: string }
      classification: string
      snippet: string
    }>
  }
  const floorPlan = await modelContext.executeTool('search_project_documents', {
    query: 'first floor room layuot doors utility coats',
  }) as SearchResult
  const badgeSearch = await modelContext.executeTool('search_project_documents', {
    query: 'Creative Commons license badge',
  }) as SearchResult
  const miss = await modelContext.executeTool('search_project_documents', {
    query: 'quantum observatory cryogenic telescope',
    limit: 20,
  }) as SearchResult

  expect(floorPlan.matches[0]).toMatchObject({
    rank: 1,
    document: { id: 'virginia-farmhouse-drawings' },
    page: { id: 'sheet-a1.2', sheetNumber: 'A1.2' },
    block: { type: 'Figure' },
    classification: 'search_hint',
  })
  const badgeHint = badgeSearch.matches.find(
    (match) =>
      match.block.type === 'Figure' &&
      match.classification === 'search_hint' &&
      match.snippet.includes('Creative Commons'),
  )
  expect(badgeHint).toBeDefined()

  const badgeInspection = await modelContext.executeTool(
    'inspect_document_evidence',
    {
      documentId: badgeHint!.document.id,
      documentVersionId: badgeHint!.document.versionId,
      blockIds: [badgeHint!.block.id],
    },
  ) as {
    pages: Array<{
      blocks: Array<{
        id: string
        sourceType: string
        content: string
        classification: string
      }>
    }>
  }
  expect(badgeInspection.pages.flatMap((page) => page.blocks)).toContainEqual(
    expect.objectContaining({
      id: badgeHint!.block.id,
      sourceType: 'Figure',
      classification: 'search_hint',
      content: expect.stringContaining('Creative Commons'),
    }),
  )
  expect(miss).toEqual({
    query: 'quantum observatory cryogenic telescope',
    matches: [],
  })

  controller.abort()
})

test('search input is bounded and requires a complete immutable scope', async () => {
  const modelContext = createRecordingModelContext()
  const controller = new AbortController()
  await registerDocumentTools(
    modelContext,
    createDocuments(),
    controller.signal,
  )

  await expect(modelContext.executeTool('search_project_documents', {
    query: '',
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('search_project_documents', {
    query: '   ',
  })).rejects.toThrow('A non-empty search query is required.')
  await expect(modelContext.executeTool('search_project_documents', {
    query: 'door',
    limit: 0,
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('search_project_documents', {
    query: 'door',
    limit: 21,
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('search_project_documents', {
    query: 'door',
    extra: true,
  })).rejects.toThrow('Invalid input')
  await expect(modelContext.executeTool('search_project_documents', {
    query: 'door',
    scope: { documentId: 'virginia-farmhouse-drawings' },
  })).rejects.toThrow('Invalid input')

  controller.abort()
})

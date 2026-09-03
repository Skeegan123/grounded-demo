import { expect, test } from 'vitest'
import { demoProject } from '../demoProject/demoProject'
import drawingEvidence from './generated/virginia-farmhouse-drawings-v1.json'
import supportingEvidence from './generated/door-package-submittal-v1.json'
import windowEvidence from './generated/window-package-submittal-v1.json'
import { createDocuments } from './documents'
import type { PreparedEvidenceArtifact } from './preparedEvidence'

function clonedArtifacts() {
  return structuredClone([
    drawingEvidence,
    supportingEvidence,
    windowEvidence,
  ]) as unknown as PreparedEvidenceArtifact[]
}

function expectInvalidArtifacts(
  mutate: (artifacts: PreparedEvidenceArtifact[]) => void,
  expectedMessage: string,
  expectedDocumentId = 'virginia-farmhouse-drawings',
) {
  const artifacts = clonedArtifacts()
  mutate(artifacts)
  expect(() => createDocuments({ artifacts })).toThrow(expectedMessage)
  expect(() => createDocuments({ artifacts })).toThrow(
    `pnpm import:document-evidence --document ${expectedDocumentId} --export <parse-export.json>`,
  )
}

test('the Project Workspace catalog exposes all immutable document versions and every PDF page', () => {
  const documents = createDocuments()
  const catalog = documents.list()

  expect(
    catalog.map((document) => ({
      id: document.id,
      versionId: document.versionId,
      pageCount: document.pageCount,
      namedSheetCount: document.pages.filter((page) => page.sheetNumber).length,
      inspectedPages: document.pages
        .filter((page) => ['sheet-a1.2', 'sheet-a4.3'].includes(page.id))
        .map((page) => ({
          id: page.id,
          number: page.number,
          sheetNumber: page.sheetNumber,
        })),
    })),
  ).toEqual([
    {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
      pageCount: 25,
      namedSheetCount: 25,
      inspectedPages: [
        { id: 'sheet-a1.2', number: 6, sheetNumber: 'A1.2' },
        { id: 'sheet-a4.3', number: 24, sheetNumber: 'A4.3' },
      ],
    },
    {
      id: 'door-package-submittal',
      versionId: 'door-package-submittal-v1',
      pageCount: 6,
      namedSheetCount: 0,
      inspectedPages: [],
    },
    {
      id: 'window-package-submittal',
      versionId: 'window-package-submittal-v1',
      pageCount: 5,
      namedSheetCount: 0,
      inspectedPages: [],
    },
  ])
})

test('page inspection exposes ordered contract and product evidence with provenance and classifications', () => {
  const documents = createDocuments()
  const schedule = documents.inspectEvidence({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    pageIds: ['sheet-a4.3'],
  })
  const productData = documents.inspectEvidence({
    documentId: 'door-package-submittal',
    documentVersionId: 'door-package-submittal-v1',
    pageIds: ['door-package-submittal-interior-product-data'],
  })

  const schedulePage = schedule.pages[0]!
  const table = schedulePage.blocks.find(
    (block) => block.sourceType === 'Table' && block.content.includes('SOLID WOOD'),
  )!
  const typeCRow = schedulePage.tableRows.find(
    (row) => row.parentBlockId === table.id && row.cells[0]?.text === 'C',
  )!
  const figure = schedulePage.blocks.find(
    (block) => block.sourceType === 'Figure',
  )!
  const productText = productData.pages[0]!.blocks
    .filter((block) => block.classification === 'document_evidence')
    .map((block) => block.content)
    .join(' ')

  expect({
    document: schedule.document,
    source: schedule.source,
    provenance: schedule.provenance,
    page: schedulePage.page,
    ordered: schedulePage.blocks.every((block, index) => block.order === index),
    table: {
      contentFormat: table.contentFormat,
      classification: table.classification,
      region: table.region,
      confidence: table.confidence,
      provenance: table.provenance,
    },
    typeCRow: {
      parentBlockId: typeCRow.parentBlockId,
      rowIndex: typeCRow.rowIndex,
      cells: typeCRow.cells.map((cell) => cell.text),
      classification: typeCRow.classification,
      region: typeCRow.region,
    },
    figureClassification: figure.classification,
    hasLowLevelOcr: Object.hasOwn(schedulePage, 'lowLevelOcr'),
    productText,
  }).toMatchObject({
    document: {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
      kind: 'contract_drawings',
      title: 'Virginia Farmhouse drawing set',
    },
    source: {
      fingerprint: '2049cb0424de69c753e4345c2c87c4632cec75b0dd3ac0c8d1462f735c8a27af',
      byteSize: 5160966,
      pageCount: 25,
    },
    provenance: {
      provider: 'reducto',
      importerVersion: 'grounded-reducto-importer-2',
      verified: {
        parseExportSha256: 'c2b333cb18e0a10fe704743ddff5933756d5122616a6be4a45c4b28f4289d674',
        model: 'r-1',
        modelSource: 'usage.usage_breakdown.parse_model',
      },
      maintainerDeclaredParseSettings: {
        chunking: 'disabled',
        tableOutputFormat: 'html',
        returnedOcrData: true,
      },
    },
    page: {
      id: 'sheet-a4.3',
      label: 'A4.3',
      number: 24,
      sheetNumber: 'A4.3',
      title: 'Doors & Windows',
      width: 1224,
      height: 792,
      rotation: 0,
    },
    ordered: true,
    table: {
      contentFormat: 'html',
      classification: 'document_evidence',
      region: {
        left: expect.any(Number),
        top: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      },
      confidence: { level: 'high', score: 1 },
      provenance: { provider: 'reducto', sourceType: 'Table' },
    },
    typeCRow: {
      parentBlockId: table.id,
      rowIndex: 3,
      cells: ['C', '24"x80"', 'WOOD', '1-PANEL', 'SOLID WOOD', 'ANTIQUE PREFERRED'],
      classification: 'document_evidence',
    },
    figureClassification: 'search_hint',
    hasLowLevelOcr: false,
    productText: expect.stringMatching(
      /Heritage interior door series[\s\S]*Solid engineered stave[\s\S]*24" x 80"[\s\S]*Qty 5/i,
    ),
  })
})

test('block inspection keeps interpretation metadata without unrelated page OCR', () => {
  const documents = createDocuments()
  const pageInspection = documents.inspectEvidence({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    pageIds: ['sheet-a4.3'],
  })
  const page = pageInspection.pages[0]!
  const figure = page.blocks.find((block) => block.sourceType === 'Figure')!
  const table = page.blocks.find(
    (block) => block.sourceType === 'Table' && block.content.includes('SOLID WOOD'),
  )!

  const inspection = documents.inspectEvidence({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    blockIds: [table.id, figure.id],
  })

  expect(inspection.pages).toHaveLength(1)
  expect(inspection.pages[0]!.blocks.map((block) => block.id)).toEqual([
    figure.id,
    table.id,
  ])
  expect(inspection.pages[0]!.tableRows).toEqual(
    page.tableRows.filter((row) => row.parentBlockId === table.id),
  )
  expect({
    document: inspection.document,
    source: inspection.source,
    provenance: inspection.provenance,
    page: inspection.pages[0]!.page,
    blockProvenance: inspection.pages[0]!.blocks.map(
      (block) => block.provenance,
    ),
  }).toEqual({
    document: pageInspection.document,
    source: pageInspection.source,
    provenance: pageInspection.provenance,
    page: page.page,
    blockProvenance: [figure.provenance, table.provenance],
  })
  expect(inspection.pages[0]).not.toHaveProperty('lowLevelOcr')
  expect(inspection.pages[0]!.blocks).not.toContainEqual(
    page.blocks.find((block) => ![figure.id, table.id].includes(block.id)),
  )
})

test('current block resolution returns only location metadata for Document Evidence and Search Hints', () => {
  const documents = createDocuments()
  const evidenceMatch = documents.search({ query: 'solid engineered stave' })
    .matches[0]!
  const hintMatch = documents.search({
    query: 'first floor plan room layout utility coats WC',
  }).matches[0]!

  const evidence = documents.resolveCurrentBlock(
    evidenceMatch.document.id,
    evidenceMatch.block.id,
  )
  const hint = documents.resolveCurrentBlock(
    hintMatch.document.id,
    hintMatch.block.id,
  )

  expect(evidence).toEqual({
    document: expect.objectContaining({
      id: 'door-package-submittal',
      versionId: 'door-package-submittal-v1',
    }),
    page: expect.objectContaining({ id: 'door-package-submittal-interior-product-data' }),
    block: {
      id: evidenceMatch.block.id,
      classification: 'document_evidence',
      region: evidenceMatch.region,
    },
  })
  expect(hint).toEqual({
    document: expect.objectContaining({
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
    }),
    page: expect.objectContaining({ id: 'sheet-a1.2' }),
    block: {
      id: hintMatch.block.id,
      classification: 'search_hint',
      region: hintMatch.region,
    },
  })
  expect(evidence.block).not.toHaveProperty('content')
  expect(hint.block).not.toHaveProperty('content')
})

test('current block resolution is document-scoped and maps table-row matches to their parent table', () => {
  const artifacts = clonedArtifacts()
  const schedule = artifacts[0]!.pages.find(
    (page) => page.page.id === 'sheet-a4.3',
  )!
  const typeCRow = schedule.tableRows.find(
    (row) => row.cells[0]?.text === 'C',
  )!
  typeCRow.region = { left: 0.55, top: 0.72, width: 0.25, height: 0.03 }
  const documents = createDocuments({ artifacts })
  const submittalBlock = documents.search({ query: 'solid engineered stave' })
    .matches[0]!.block.id
  const tableRowMatch = documents.search({
    query: 'Type C 24 x 80 solid wood',
    limit: 1,
  }).matches[0]!
  const resolvedTable = documents.resolveCurrentBlock(
    tableRowMatch.document.id,
    tableRowMatch.block.id,
  )

  expect(tableRowMatch.matchType).toBe('table_row')
  expect(tableRowMatch.tableRow?.parentBlockId).toBe(tableRowMatch.block.id)
  expect(resolvedTable.block.id).toBe(tableRowMatch.block.id)
  expect(resolvedTable.block.region).not.toEqual(tableRowMatch.region)
  expect(() => documents.resolveCurrentBlock(
    'virginia-farmhouse-drawings',
    submittalBlock,
  )).toThrow('The block does not belong to the current Project Document.')
  expect(() => documents.resolveCurrentBlock(
    'virginia-farmhouse-drawings',
    'missing-block',
  )).toThrow('The block does not belong to the current Project Document.')
  expect(() => documents.resolveCurrentBlock(
    'missing-document',
    tableRowMatch.block.id,
  )).toThrow('The block does not belong to the current Project Document.')
})

test('inspection rejects foreign document, page, and block identities plus empty or duplicate selectors', () => {
  const documents = createDocuments()

  expect(() => documents.inspectEvidence({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'door-package-submittal-v1',
    pageIds: ['sheet-a4.3'],
  })).toThrow('The document version does not exist in this Project Workspace.')
  expect(() => documents.inspectEvidence({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    pageIds: ['door-package-submittal-interior-product-data'],
  })).toThrow('A requested page does not belong to the document version.')
  expect(() => documents.inspectEvidence({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    blockIds: ['block-from-another-version'],
  })).toThrow('A requested block does not belong to the document version.')
  expect(() => documents.inspectEvidence({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    pageIds: [],
  })).toThrow('At least one page identity is required.')
  expect(() => documents.inspectEvidence({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    pageIds: ['sheet-a4.3', 'sheet-a4.3'],
  })).toThrow('Requested page identities must be unique.')
})

test('project search finds the Type C contract row with concise linked evidence', () => {
  const documents = createDocuments()
  const input = { query: 'Type C 24 x 80 solid wood', limit: 3 }
  const first = documents.search(input)
  const repeated = documents.search(input)
  const match = first.matches[0]!

  expect(repeated).toEqual(first)
  expect(first.query).toBe('type c 24x80 solid wood')
  expect(first.matches).toHaveLength(3)
  expect(first.matches.map((candidate) => candidate.rank)).toEqual([1, 2, 3])
  expect({
    rank: match.rank,
    matchedTerms: match.matchedTerms,
    document: match.document,
    page: match.page,
    block: match.block,
    matchType: match.matchType,
    snippet: match.snippet,
    region: match.region,
    classification: match.classification,
    tableRow: match.tableRow,
  }).toEqual({
    rank: 1,
    matchedTerms: ['type', 'c', '24x80', 'solid', 'wood'],
    document: {
      id: 'virginia-farmhouse-drawings',
      versionId: 'virginia-farmhouse-drawings-v1',
      kind: 'contract_drawings',
      title: 'Virginia Farmhouse drawing set',
    },
    page: {
      id: 'sheet-a4.3',
      label: 'A4.3',
      number: 24,
      title: 'Doors & Windows',
      sheetNumber: 'A4.3',
    },
    block: {
      id: match.tableRow?.parentBlockId,
      type: 'Table',
    },
    matchType: 'table_row',
    snippet: 'C | 24"x80" | WOOD | 1-PANEL | SOLID WOOD | ANTIQUE PREFERRED',
    region: {
      left: expect.any(Number),
      top: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    },
    classification: 'document_evidence',
    tableRow: {
      id: expect.any(String),
      parentBlockId: match.block.id,
      rowIndex: 3,
      cells: [
        { text: 'C', header: false, rowSpan: 1, columnSpan: 1 },
        { text: '24"x80"', header: false, rowSpan: 1, columnSpan: 1 },
        { text: 'WOOD', header: false, rowSpan: 1, columnSpan: 1 },
        { text: '1-PANEL', header: false, rowSpan: 1, columnSpan: 1 },
        { text: 'SOLID WOOD', header: false, rowSpan: 1, columnSpan: 1 },
        { text: 'ANTIQUE PREFERRED', header: false, rowSpan: 1, columnSpan: 1 },
      ],
    },
  })
  expect(match.snippet.length).toBeLessThanOrEqual(240)
})

test('project search finds submitted construction and keeps plan descriptions labeled as Search Hints', () => {
  const documents = createDocuments()
  const model = documents.search({ query: 'W-2480-P1' })
  const construction = documents.search({ query: 'solid engineered stave' })
  const fuzzyConstruction = documents.search({ query: 'solidd enginered stave' })
  const floorPlan = documents.search({
    query: 'first floor plan room layout utility coats WC',
  })

  expect(model.matches[0]).toMatchObject({
    rank: 1,
    matchedTerms: ['w-2480-p1'],
    document: { id: 'door-package-submittal' },
    page: { id: 'door-package-submittal-schedule' },
    snippet: 'C | 5 | 24" x 80" | Solid wood | 1-panel | Aged clear | Heritage W-2480-P1 | Interior',
    classification: 'document_evidence',
  })
  expect(construction.matches[0]).toMatchObject({
    rank: 1,
    document: { id: 'door-package-submittal' },
    page: { id: 'door-package-submittal-interior-product-data' },
    matchedTerms: ['solid', 'engineered', 'stave'],
    classification: 'document_evidence',
  })
  expect(fuzzyConstruction.matches[0]).toMatchObject({
    document: { id: 'door-package-submittal' },
    page: { id: 'door-package-submittal-interior-product-data' },
    matchedTerms: ['solidd', 'enginered', 'stave'],
  })
  expect(floorPlan.matches[0]).toMatchObject({
    rank: 1,
    document: { id: 'virginia-farmhouse-drawings' },
    page: { id: 'sheet-a1.2', sheetNumber: 'A1.2' },
    block: { type: 'Figure' },
    matchType: 'block',
    classification: 'search_hint',
  })
  expect(floorPlan.matches[0]!.snippet.length).toBeLessThanOrEqual(240)
})

test('project search canonicalizes identifiers and dimensions, supports scope, and returns honest empty results', () => {
  const documents = createDocuments()
  const sheet = documents.search({ query: 'A4.3' })
  const mark = documents.search({ query: 'mark C' })
  const compactDimension = documents.search({ query: '24 x 80' })
  const writtenDimension = documents.search({ query: '24 in x 80 in' })
  const scoped = documents.search({
    query: '24 x 80',
    scope: {
      documentId: 'door-package-submittal',
      documentVersionId: 'door-package-submittal-v1',
    },
  })

  expect(sheet.matches[0]).toMatchObject({
    page: { id: 'sheet-a4.3' },
    matchedTerms: ['a4.3'],
  })
  expect(mark.matches[0]).toMatchObject({
    page: { id: 'sheet-a4.3' },
    matchType: 'table_row',
    matchedTerms: ['mark', 'c'],
  })
  expect(writtenDimension).toEqual(compactDimension)
  expect(compactDimension.matches.some(
    (match) => match.document.id === 'virginia-farmhouse-drawings',
  )).toBe(true)
  expect(compactDimension.matches.some(
    (match) => match.document.id === 'door-package-submittal',
  )).toBe(true)
  expect(scoped.matches.length).toBeGreaterThan(0)
  expect(scoped.matches.every(
    (match) => match.document.id === 'door-package-submittal',
  )).toBe(true)
  expect(documents.search({ query: 'the and of' })).toEqual({
    query: 'the and of',
    matches: [],
  })
  expect(documents.search({ query: 'xylophone plutonium' })).toEqual({
    query: 'xylophone plutonium',
    matches: [],
  })
  expect(() => documents.search({
    query: 'door',
    scope: {
      documentId: 'missing-document',
      documentVersionId: 'missing-version',
    },
  })).toThrow('The search scope does not exist in this Project Workspace.')
})

test('startup rejects missing, duplicate, obsolete, stale, and mismatched artifacts', () => {
  expectInvalidArtifacts(
    (artifacts) => artifacts.shift(),
    'the current document artifact is missing.',
  )
  expectInvalidArtifacts(
    (artifacts) => artifacts.push(structuredClone(artifacts[0]!)),
    'the artifact identity is duplicated.',
  )
  expectInvalidArtifacts(
    (artifacts) => {
      (artifacts[0] as unknown as { schemaVersion: number }).schemaVersion = 1
    },
    'only schema version 2 is supported.',
  )
  expectInvalidArtifacts(
    (artifacts) => {
      artifacts[0]!.document.versionId = 'virginia-farmhouse-drawings-v0'
    },
    'artifact version virginia-farmhouse-drawings-v0 is stale',
  )
  expectInvalidArtifacts(
    (artifacts) => {
      artifacts[0]!.source.fingerprint = 'stale-fingerprint'
    },
    'source fingerprint or byte size is stale.',
  )
  expectInvalidArtifacts(
    (artifacts) => {
      artifacts[0]!.provenance.verified.parseExportSha256 = '0'.repeat(64)
    },
    'Reducto provenance does not match the immutable source or bound Parse export.',
  )
  expectInvalidArtifacts(
    (artifacts) => {
      artifacts[0]!.pages.pop()
    },
    'page count does not match the immutable document version.',
  )
  expectInvalidArtifacts(
    (artifacts) => {
      artifacts[0]!.pages[5]!.page.label = 'A1.2 changed'
    },
    'page sheet-a1.2 does not match its immutable reference.',
  )
  expectInvalidArtifacts(
    (artifacts) => {
      const page = artifacts[0]!.pages.find((entry) => entry.tableRows.length > 0)!
      page.tableRows[0]!.parentBlockId = 'missing-table-block'
    },
    'has an invalid table row',
  )
  expectInvalidArtifacts(
    (artifacts) => {
      const page = artifacts[0]!.pages[0] as unknown as Record<string, unknown>
      page.lowLevelOcr = { lines: [], words: [] }
    },
    'must not contain low-level OCR data',
  )
})

test('default runtime artifacts follow manifest versions and report a missing version', () => {
  const project = structuredClone(demoProject)
  project.documents[1]!.versionId = 'door-package-submittal-v3'

  expect(() => createDocuments({ project })).toThrow(
    'Invalid prepared evidence for door-package-submittal-v3: the current document artifact is missing.',
  )
  expect(() => createDocuments({ project })).toThrow(
    'pnpm import:document-evidence --document door-package-submittal --export <parse-export.json>',
  )
})

/// <reference types="node" />

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const importerPath = resolve(testDirectory, '../../scripts/import-reducto-document.mjs')
const fixtureDirectory = resolve(testDirectory, '../../scripts/fixtures/reducto')
const manifestPath = join(fixtureDirectory, 'manifest.json')
const sourceDirectory = join(fixtureDirectory, 'assets')

interface ParseBlockFixture {
  content?: string
  bbox: { page: number; original_page: number }
  [key: string]: unknown
}

interface MutableParseFixture {
  response_type: string
  usage: { num_pages: number; [key: string]: unknown }
  result: {
    type: string
    chunks?: Array<{
      blocks: ParseBlockFixture[]
      [key: string]: unknown
    }>
    url?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface ImportedArtifact {
  schemaVersion: number
  document: {
    id: string
    versionId: string
    kind: string
    title: string
  }
  pages: Array<{
    page: Record<string, unknown>
    blocks: Array<{
      id: string
      sourceType: string
      content: string
      classification: string
      [key: string]: unknown
    }>
    tableRows: Array<Record<string, unknown>>
    lowLevelOcr?: Record<string, unknown>
  }>
  [key: string]: unknown
}

interface MutableManifest {
  documents: Array<{
    file: { sha256: string; [key: string]: unknown }
    preparedEvidence: { parseExportSha256: string; [key: string]: unknown }
  }>
  [key: string]: unknown
}

interface InvalidExportCase {
  name: string
  mutateExport: (value: MutableParseFixture) => MutableParseFixture
  error: string
}

function importDocument(
  documentId: string,
  exportPath: string,
  outputPath: string,
  extraArguments: string[] = [],
) {
  return spawnSync(
    process.execPath,
    [
      importerPath,
      '--document',
      documentId,
      '--export',
      exportPath,
      ...extraArguments,
      '--manifest',
      manifestPath,
      '--source-directory',
      sourceDirectory,
      '--output',
      outputPath,
    ],
    { encoding: 'utf8' },
  )
}

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

test('the public import command converts a drawing Parse export into one deterministic artifact', () => {
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-reducto-drawing-'))
  const firstOutput = join(scratchDirectory, 'first.json')
  const secondOutput = join(scratchDirectory, 'second.json')
  const exportPath = join(fixtureDirectory, 'drawing-parse.json')

  const first = importDocument('fixture-drawings', exportPath, firstOutput)
  const second = importDocument('fixture-drawings', exportPath, secondOutput)

  expect(first.stderr).toBe('')
  expect(first.status).toBe(0)
  expect(second.status).toBe(0)
  expect(readFileSync(firstOutput, 'utf8')).toBe(readFileSync(secondOutput, 'utf8'))

  const artifact = readJson<ImportedArtifact>(firstOutput)
  expect(artifact).toMatchObject({
    schemaVersion: 2,
    document: {
      id: 'fixture-drawings',
      versionId: 'fixture-drawings-v1',
      kind: 'contract_drawings',
    },
    source: {
      fingerprint: 'ea0739d6335054df5f3dad59e326efc5963b93377648a39c3973bf0f0d986231',
      byteSize: 20,
      pageCount: 2,
    },
    provenance: {
      provider: 'reducto',
      importerVersion: 'grounded-reducto-importer-2',
      sourceFingerprint: 'ea0739d6335054df5f3dad59e326efc5963b93377648a39c3973bf0f0d986231',
      verified: {
        parseExportSha256: '9334458075b84ea0b3dc259c2d353c1ab04c9d0e246c964f01a1947ff1b46960',
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
  })
  expect(artifact.pages.map((page) => page.page)).toEqual([
    {
      id: 'fixture-sheet-a1.0',
      label: 'A1.0',
      number: 1,
      title: 'Floor plan',
      sheetNumber: 'A1.0',
      width: 1224,
      height: 792,
      rotation: 0,
    },
    {
      id: 'fixture-sheet-a5.0',
      label: 'A5.0',
      number: 2,
      title: 'Schedules',
      sheetNumber: 'A5.0',
      width: 1224,
      height: 792,
      rotation: 0,
    },
  ])
  expect(artifact.pages[0].blocks).toEqual([
    expect.objectContaining({
      id: expect.stringMatching(/^block-[a-f0-9]{24}$/),
      order: 0,
      sourceType: 'Title',
      contentFormat: 'text',
      confidence: { level: 'high', score: 0.98 },
      classification: 'document_evidence',
    }),
    expect.objectContaining({
      order: 1,
      sourceType: 'Figure',
      confidence: { level: 'low' },
      classification: 'search_hint',
    }),
  ])
  expect(artifact.pages[1].tableRows).toEqual([
    expect.objectContaining({
      id: expect.stringMatching(/^row-[a-f0-9]{24}$/),
      parentBlockId: artifact.pages[1].blocks[1].id,
      rowIndex: 0,
      text: 'Mark | Door',
      classification: 'document_evidence',
      cells: [
        { text: 'Mark', header: true, rowSpan: 1, columnSpan: 1 },
        { text: 'Door', header: true, rowSpan: 1, columnSpan: 2 },
      ],
    }),
    expect.objectContaining({
      parentBlockId: artifact.pages[1].blocks[1].id,
      rowIndex: 1,
      text: 'C | 24 in x 80 in | Solid wood',
    }),
  ])
  expect(artifact.pages[1].lowLevelOcr).toMatchObject({
    lines: [expect.objectContaining({ text: 'DOOR SCHEDULE', confidence: 0.94 })],
    words: [expect.objectContaining({ text: 'SCHEDULE', confidence: 0.96 })],
  })
  expect(JSON.stringify(artifact)).not.toMatch(/job_id|studio_link|pdf_url|image_url|credits/)
})

test('the public import command handles a structurally different supporting document', () => {
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-reducto-supporting-'))
  const outputPath = join(scratchDirectory, 'supporting.json')
  const result = importDocument(
    'fixture-submittal',
    join(fixtureDirectory, 'supporting-parse.json'),
    outputPath,
  )

  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  const artifact = readJson<ImportedArtifact>(outputPath)
  expect(artifact.document).toEqual({
    id: 'fixture-submittal',
    versionId: 'fixture-submittal-v3',
    kind: 'submittal_product_data',
    title: 'Fixture product data',
  })
  expect(artifact.pages[0].blocks.map((block) => ({
    sourceType: block.sourceType,
    content: block.content,
    classification: block.classification,
  }))).toEqual([
    {
      sourceType: 'Title',
      content: 'Interior Door Product Data',
      classification: 'document_evidence',
    },
    {
      sourceType: 'Key Value',
      content: 'Model: HC-2480',
      classification: 'document_evidence',
    },
    {
      sourceType: 'Text',
      content: 'Door construction: Hollow honeycomb core',
      classification: 'document_evidence',
    },
  ])
  expect(artifact.pages[0]).not.toHaveProperty('lowLevelOcr')
})

test.each<InvalidExportCase>([
  {
    name: 'wrong response type',
    mutateExport: (value) => ({ ...value, response_type: 'extract' }),
    error: 'response_type must be "parse"',
  },
  {
    name: 'URL-only result',
    mutateExport: (value) => ({
      ...value,
      result: { type: 'url', url: 'https://storage.reducto.invalid/result.json' },
    }),
    error: 'self-contained full Parse result',
  },
  {
    name: 'missing required Parse content',
    mutateExport: (value) => {
      const changed = structuredClone(value)
      delete changed.result.chunks![0]!.blocks[0]!.content
      return changed
    },
    error: 'content is missing',
  },
  {
    name: 'bad page number',
    mutateExport: (value) => {
      const changed = structuredClone(value)
      changed.result.chunks![0]!.blocks[0]!.bbox.page = 3
      changed.result.chunks![0]!.blocks[0]!.bbox.original_page = 3
      return changed
    },
    error: 'outside the manifest page range',
  },
  {
    name: 'page count disagreement',
    mutateExport: (value) => ({
      ...value,
      usage: { ...value.usage, num_pages: 1 },
    }),
    error: 'parsed 1 pages but the manifest requires 2',
  },
  {
    name: 'missing exported Parse model',
    mutateExport: (value) => {
      const changed = structuredClone(value)
      delete changed.usage.usage_breakdown
      return changed
    },
    error: 'usage.usage_breakdown is missing',
  },
])('rejects $name before writing output', ({ mutateExport, error }) => {
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-reducto-invalid-'))
  const exportPath = join(scratchDirectory, 'invalid-export.json')
  const outputPath = join(scratchDirectory, 'must-not-exist.json')
  const serializedExport = JSON.stringify(
    mutateExport(
      readJson<MutableParseFixture>(join(fixtureDirectory, 'drawing-parse.json')),
    ),
  )
  writeFileSync(exportPath, serializedExport)
  const boundManifest = readJson<MutableManifest>(manifestPath)
  boundManifest.documents[0]!.preparedEvidence.parseExportSha256 =
    sha256(serializedExport)
  const boundManifestPath = join(scratchDirectory, 'bound-manifest.json')
  writeFileSync(boundManifestPath, JSON.stringify(boundManifest))

  const result = importDocument(
    'fixture-drawings',
    exportPath,
    outputPath,
    ['--manifest', boundManifestPath],
  )

  expect(result.status).toBe(1)
  expect(result.stderr).toContain(error)
  expect(existsSync(outputPath)).toBe(false)
})

test('rejects a wrong same-page-count Parse export before reading its content', () => {
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-reducto-swapped-'))
  const outputPath = join(scratchDirectory, 'must-not-exist.json')
  const result = importDocument(
    'fixture-drawings',
    join(fixtureDirectory, 'supporting-v4-parse.json'),
    outputPath,
  )

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Parse export SHA-256')
  expect(result.stderr).toContain('does not match fixture-drawings-v1')
  expect(existsSync(outputPath)).toBe(false)
})

test('rejects a bound export whose reported Parse model is wrong', () => {
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-reducto-model-'))
  const exportPath = join(scratchDirectory, 'wrong-model.json')
  const outputPath = join(scratchDirectory, 'must-not-exist.json')
  const exportValue = readJson<MutableParseFixture>(
    join(fixtureDirectory, 'drawing-parse.json'),
  )
  const usageBreakdown = exportValue.usage.usage_breakdown as Record<string, unknown>
  usageBreakdown.parse_model = 'R-2'
  const serializedExport = JSON.stringify(exportValue)
  writeFileSync(exportPath, serializedExport)
  const boundManifest = readJson<MutableManifest>(manifestPath)
  boundManifest.documents[0]!.preparedEvidence.parseExportSha256 =
    sha256(serializedExport)
  const boundManifestPath = join(scratchDirectory, 'bound-manifest.json')
  writeFileSync(boundManifestPath, JSON.stringify(boundManifest))

  const result = importDocument(
    'fixture-drawings',
    exportPath,
    outputPath,
    ['--manifest', boundManifestPath],
  )

  expect(result.status).toBe(1)
  expect(result.stderr).toContain(
    'export model r-2 does not match the manifest-required model r-1',
  )
  expect(existsSync(outputPath)).toBe(false)
})

test('rejects wrong document identities and stale source fingerprints before writing output', () => {
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-reducto-manifest-'))
  const outputPath = join(scratchDirectory, 'must-not-exist.json')
  const exportPath = join(fixtureDirectory, 'drawing-parse.json')
  const wrongIdentity = importDocument('missing-document', exportPath, outputPath)
  expect(wrongIdentity.status).toBe(1)
  expect(wrongIdentity.stderr).toContain('does not exist in the manifest')
  expect(existsSync(outputPath)).toBe(false)

  const staleManifest = readJson<MutableManifest>(manifestPath)
  staleManifest.documents[0]!.file.sha256 = '0'.repeat(64)
  const staleManifestPath = join(scratchDirectory, 'stale-manifest.json')
  writeFileSync(staleManifestPath, JSON.stringify(staleManifest))
  const staleFingerprint = importDocument(
    'fixture-drawings',
    exportPath,
    outputPath,
    ['--manifest', resolve(staleManifestPath)],
  )
  expect(staleFingerprint.status).toBe(1)
  expect(staleFingerprint.stderr).toContain('source PDF does not match fixture-drawings-v1')
  expect(existsSync(outputPath)).toBe(false)
})

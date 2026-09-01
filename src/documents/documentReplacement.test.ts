/// <reference types="node" />

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import replacementManifest from '../../scripts/fixtures/reducto/replacement-manifest.json'
import { createProjectWorkspace } from '../demoProject/demoProject'
import { createDocuments } from './documents'
import type { PreparedEvidenceArtifact } from './preparedEvidence'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const importerPath = resolve(testDirectory, '../../scripts/import-reducto-document.mjs')
const fixtureDirectory = resolve(testDirectory, '../../scripts/fixtures/reducto')
const manifestPath = join(fixtureDirectory, 'replacement-manifest.json')
const sourceDirectory = join(fixtureDirectory, 'assets')

function importArtifact(
  scratchDirectory: string,
  documentId: string,
  exportName: string,
  versionId: string,
) {
  const outputPath = join(scratchDirectory, `${versionId}.json`)
  const result = spawnSync(
    process.execPath,
    [
      importerPath,
      '--document',
      documentId,
      '--export',
      join(fixtureDirectory, exportName),
      '--manifest',
      manifestPath,
      '--source-directory',
      sourceDirectory,
      '--output',
      outputPath,
    ],
    { encoding: 'utf8' },
  )
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  return JSON.parse(readFileSync(outputPath, 'utf8')) as PreparedEvidenceArtifact
}

function replacementArtifacts() {
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-replacement-runtime-'))
  return [
    importArtifact(
      scratchDirectory,
      'fixture-drawings',
      'drawing-parse.json',
      'fixture-drawings-v1',
    ),
    importArtifact(
      scratchDirectory,
      'fixture-submittal',
      'supporting-v4-parse.json',
      'fixture-submittal-v4',
    ),
    importArtifact(
      scratchDirectory,
      'fixture-estimate',
      'estimate-parse.json',
      'fixture-estimate-v1',
    ),
  ]
}

function replacementArtifact(artifacts: PreparedEvidenceArtifact[]) {
  return artifacts.find(
    (artifact) => artifact.document.id === 'fixture-submittal',
  )!
}

test('importing the replacement writes one version artifact and leaves drawings unchanged', () => {
  const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-replacement-import-'))
  const drawingPath = join(scratchDirectory, 'fixture-drawings-v1.json')

  importArtifact(
    scratchDirectory,
    'fixture-drawings',
    'drawing-parse.json',
    'fixture-drawings-v1',
  )
  const drawingBeforeReplacement = readFileSync(drawingPath)

  const replacement = importArtifact(
    scratchDirectory,
    'fixture-submittal',
    'supporting-v4-parse.json',
    'fixture-submittal-v4',
  )

  expect(readFileSync(drawingPath)).toEqual(drawingBeforeReplacement)
  expect(readdirSync(scratchDirectory).sort()).toEqual([
    'fixture-drawings-v1.json',
    'fixture-submittal-v4.json',
  ])
  expect(replacement).toMatchObject({
    document: {
      id: 'fixture-submittal',
      versionId: 'fixture-submittal-v4',
      kind: 'submittal_product_data',
      title: 'Replacement fixture product data',
    },
    source: {
      fingerprint: '8881b15d0a31d09b7e90e69c85d01f1b024b4b7d89eb0b81062be59622cabe0b',
      byteSize: 41,
      pageCount: 2,
    },
  })
  expect(replacement.pages.map((page) => page.page)).toEqual([
    {
      id: 'fixture-submittal-v4-cover',
      label: '1',
      number: 1,
      title: 'Replacement review cover',
      width: 612,
      height: 792,
      rotation: 0,
    },
    {
      id: 'fixture-submittal-v4-product-data',
      label: '2',
      number: 2,
      title: 'Revised door product data',
      width: 612,
      height: 792,
      rotation: 0,
    },
  ])
})

test('runtime composition loads a replacement version, unchanged drawings, and a new document kind', () => {
  const project = createProjectWorkspace(replacementManifest)
  const documents = createDocuments({
    project,
    artifacts: replacementArtifacts(),
  })

  expect(documents.list().map((document) => ({
    id: document.id,
    versionId: document.versionId,
    kind: document.kind,
    pageIds: document.pages.map((page) => page.id),
  }))).toEqual([
    {
      id: 'fixture-drawings',
      versionId: 'fixture-drawings-v1',
      kind: 'contract_drawings',
      pageIds: ['fixture-sheet-a1.0', 'fixture-sheet-a5.0'],
    },
    {
      id: 'fixture-submittal',
      versionId: 'fixture-submittal-v4',
      kind: 'submittal_product_data',
      pageIds: [
        'fixture-submittal-v4-cover',
        'fixture-submittal-v4-product-data',
      ],
    },
    {
      id: 'fixture-estimate',
      versionId: 'fixture-estimate-v1',
      kind: 'estimate',
      pageIds: ['fixture-estimate-page-1'],
    },
  ])

  const drawings = documents.inspectEvidence({
    documentId: 'fixture-drawings',
    documentVersionId: 'fixture-drawings-v1',
    pageIds: ['fixture-sheet-a5.0'],
  })
  const replacement = documents.inspectEvidence({
    documentId: 'fixture-submittal',
    documentVersionId: 'fixture-submittal-v4',
    pageIds: ['fixture-submittal-v4-product-data'],
  })
  const estimate = documents.inspectEvidence({
    documentId: 'fixture-estimate',
    documentVersionId: 'fixture-estimate-v1',
    pageIds: ['fixture-estimate-page-1'],
  })

  expect(drawings.pages[0]!.tableRows[1]!.text).toBe(
    'C | 24 in x 80 in | Solid wood',
  )
  expect(replacement.pages[0]!.blocks.map((block) => block.content)).toContain(
    'Door construction: Solid wood core',
  )
  expect(estimate.pages[0]!.blocks.map((block) => block.content)).toContain(
    'Door allowance: $1,250',
  )
})

test.each([
  {
    name: 'missing replacement artifact',
    mutate: (artifacts: PreparedEvidenceArtifact[]) => {
      artifacts.splice(artifacts.indexOf(replacementArtifact(artifacts)), 1)
    },
    message: 'the current document artifact is missing',
  },
  {
    name: 'stale replacement fingerprint',
    mutate: (artifacts: PreparedEvidenceArtifact[]) => {
      replacementArtifact(artifacts).source.fingerprint = 'stale-fingerprint'
    },
    message: 'source fingerprint or byte size is stale',
  },
  {
    name: 'wrong replacement version',
    mutate: (artifacts: PreparedEvidenceArtifact[]) => {
      replacementArtifact(artifacts).document.versionId = 'fixture-submittal-v3'
    },
    message: 'artifact version fixture-submittal-v3 is stale',
  },
  {
    name: 'wrong replacement page count',
    mutate: (artifacts: PreparedEvidenceArtifact[]) => {
      replacementArtifact(artifacts).source.pageCount = 1
    },
    message: 'source page count does not match the manifest',
  },
  {
    name: 'replacement page identity disagreement',
    mutate: (artifacts: PreparedEvidenceArtifact[]) => {
      replacementArtifact(artifacts).pages[1]!.page.id = 'stale-product-data-page'
    },
    message: 'page fixture-submittal-v4-product-data does not match its immutable reference',
  },
])('runtime rejects $name with its regeneration command', ({ mutate, message }) => {
  const project = createProjectWorkspace(replacementManifest)
  const artifacts = replacementArtifacts()
  mutate(artifacts)

  expect(() => createDocuments({ project, artifacts })).toThrow(
    `Invalid prepared evidence for fixture-submittal-v4: ${message}`,
  )
  expect(() => createDocuments({ project, artifacts })).toThrow(
    'pnpm import:document-evidence --document fixture-submittal --export <parse-export.json>',
  )
})

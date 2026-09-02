import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { htmlToPlainText } from '../src/documents/htmlToPlainText.js'

const IMPORTER_VERSION = 'grounded-reducto-importer-2'
const DEFAULT_MANIFEST_PATH = fileURLToPath(
  new URL('../src/demoProject/demoProjectManifest.json', import.meta.url),
)
const DEFAULT_SOURCE_DIRECTORY = fileURLToPath(
  new URL('../public/demo-project', import.meta.url),
)
const DEFAULT_OUTPUT_DIRECTORY = fileURLToPath(
  new URL('../src/documents/generated', import.meta.url),
)

const MAINTAINER_DECLARED_PARSE_SETTINGS = Object.freeze({
  chunking: 'disabled',
  embeddingOptimization: false,
  returnedImages: false,
  tableOutputFormat: 'html',
  agenticPass: false,
  returnedOcrData: true,
})

function fail(message) {
  throw new Error(`Cannot import Reducto document: ${message}`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value, name) {
  if (!isRecord(value)) fail(`${name} is missing or is not an object.`)
  return value
}

function requireArray(value, name) {
  if (!Array.isArray(value)) fail(`${name} is missing or is not an array.`)
  return value
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${name} is missing or is not a non-empty string.`)
  }
  return value
}

function requireInteger(value, name) {
  if (!Number.isInteger(value)) fail(`${name} is missing or is not an integer.`)
  return value
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizedNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${name} must be a number between 0 and 1.`)
  }
  return Number(value.toFixed(6))
}

function regionFromBoundingBox(value, name) {
  const bbox = requireRecord(value, name)
  const left = normalizedNumber(bbox.left, `${name}.left`)
  const top = normalizedNumber(bbox.top, `${name}.top`)
  const width = normalizedNumber(bbox.width, `${name}.width`)
  const height = normalizedNumber(bbox.height, `${name}.height`)
  if (left + width > 1.000001 || top + height > 1.000001) {
    fail(`${name} extends outside the normalized page.`)
  }
  return { left, top, width, height }
}

function pageNumberFromBoundingBox(value, name, pageCount) {
  const bbox = requireRecord(value, name)
  const pageNumber = requireInteger(bbox.page, `${name}.page`)
  const originalPage = requireInteger(
    bbox.original_page,
    `${name}.original_page`,
  )
  if (pageNumber < 1 || pageNumber > pageCount) {
    fail(`${name}.page ${pageNumber} is outside the manifest page range.`)
  }
  if (originalPage !== pageNumber) {
    fail(
      `${name} maps parsed page ${pageNumber} to source page ${originalPage}; full-document page numbering is required.`,
    )
  }
  return pageNumber
}

function confidenceFrom(value, name) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${name} must be a number between 0 and 1 when present.`)
  }
  return Number(value.toFixed(6))
}

function blockConfidence(block, name) {
  let score
  if (isRecord(block.granular_confidence)) {
    score = confidenceFrom(
      block.granular_confidence.parse_confidence,
      `${name}.granular_confidence.parse_confidence`,
    )
  }
  let level
  if (block.confidence !== undefined && block.confidence !== null) {
    if (block.confidence !== 'high' && block.confidence !== 'low') {
      fail(`${name}.confidence must be "high" or "low" when present.`)
    }
    level = block.confidence
  }
  return level === undefined && score === undefined ? undefined : { level, score }
}

function normalizedSourceType(value) {
  return requireString(value, 'block.type').trim().replace(/\s+/g, ' ')
}

function classificationFor(sourceType, block) {
  const normalized = sourceType.toLowerCase()
  if (
    normalized === 'figure' ||
    normalized.includes('description') ||
    normalized.includes('synopsis') ||
    normalized.includes('summary') ||
    normalized.includes('generated tag') ||
    (isRecord(block.extra) && block.extra.generated === true)
  ) {
    return 'search_hint'
  }
  return 'document_evidence'
}

function contentFormatFor(sourceType, content, name) {
  if (sourceType.toLowerCase() !== 'table') return 'text'
  if (!/^\s*<table(?:\s|>)/i.test(content) || !/<\/table>\s*$/i.test(content)) {
    fail(`${name}.content must be an HTML table.`)
  }
  return 'html'
}

function positiveSpan(attributes, attributeName) {
  const match = attributes.match(new RegExp(`\\b${attributeName}\\s*=\\s*["']?(\\d+)`, 'i'))
  if (!match) return 1
  const value = Number(match[1])
  return value > 0 ? value : 1
}

function tableRowsFor(block, blockId) {
  const rows = []
  const rowPattern = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi
  for (const rowMatch of block.content.matchAll(rowPattern)) {
    const cells = []
    const cellPattern = /<(th|td)([^>]*)>([\s\S]*?)<\/\1>/gi
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      cells.push({
        text: htmlToPlainText(cellMatch[3]).replace(/\s+/g, ' ').trim(),
        header: cellMatch[1].toLowerCase() === 'th',
        rowSpan: positiveSpan(cellMatch[2], 'rowspan'),
        columnSpan: positiveSpan(cellMatch[2], 'colspan'),
      })
    }
    if (cells.length === 0) continue

    const rowIndex = rows.length
    const rowContent = cells.map((cell) => cell.text).join(' | ')
    rows.push({
      id: `row-${sha256(`${blockId}\u0000${rowIndex}\u0000${rowContent}`).slice(0, 24)}`,
      parentBlockId: blockId,
      rowIndex,
      text: rowContent,
      cells,
      region: block.region,
      classification: 'document_evidence',
    })
  }
  if (rows.length === 0) fail('a Table block has no HTML rows with cells.')
  return rows
}

function groundedBlockId(document, page, order, sourceType, content, region) {
  const identity = JSON.stringify({
    documentId: document.id,
    documentVersionId: document.versionId,
    pageId: page.id,
    order,
    sourceType,
    content,
    region,
  })
  return `block-${sha256(identity).slice(0, 24)}`
}

function manifestPageReference(page) {
  return {
    id: page.id,
    label: page.label,
    number: page.number,
    title: page.title,
    ...(page.sheetNumber ? { sheetNumber: page.sheetNumber } : {}),
    width: page.width,
    height: page.height,
    rotation: page.rotation,
  }
}

function validateManifestDocument(manifest, documentId) {
  const documents = requireArray(manifest.documents, 'manifest.documents')
  const matches = documents.filter(
    (candidate) => isRecord(candidate) && candidate.id === documentId,
  )
  if (matches.length !== 1) {
    fail(
      matches.length === 0
        ? `document "${documentId}" does not exist in the manifest.`
        : `document "${documentId}" is duplicated in the manifest.`,
    )
  }
  const document = matches[0]
  requireString(document.versionId, `manifest document ${documentId}.versionId`)
  requireString(document.kind, `manifest document ${documentId}.kind`)
  requireString(document.title, `manifest document ${documentId}.title`)
  const file = requireRecord(document.file, `manifest document ${documentId}.file`)
  requireString(file.name, `manifest document ${documentId}.file.name`)
  requireString(file.sha256, `manifest document ${documentId}.file.sha256`)
  const preparedEvidence = requireRecord(
    document.preparedEvidence,
    `manifest document ${documentId}.preparedEvidence`,
  )
  const parseExportSha256 = requireString(
    preparedEvidence.parseExportSha256,
    `manifest document ${documentId}.preparedEvidence.parseExportSha256`,
  )
  if (!/^[a-f0-9]{64}$/.test(parseExportSha256)) {
    fail(
      `manifest document ${documentId}.preparedEvidence.parseExportSha256 must be a lowercase SHA-256 fingerprint.`,
    )
  }
  const requiredModel = requireString(
    preparedEvidence.requiredModel,
    `manifest document ${documentId}.preparedEvidence.requiredModel`,
  )
  if (requiredModel !== 'r-1') {
    fail(`manifest document ${documentId} must require the supported r-1 model.`)
  }
  const pageCount = requireInteger(
    file.pageCount,
    `manifest document ${documentId}.file.pageCount`,
  )
  const pages = requireArray(document.pages, `manifest document ${documentId}.pages`)
  if (pages.length !== pageCount) {
    fail(`manifest page count disagrees with ${document.versionId}.`)
  }
  const seenPageNumbers = new Set()
  const seenPageIds = new Set()
  for (const [index, value] of pages.entries()) {
    const page = requireRecord(value, `manifest page ${index + 1}`)
    const pageId = requireString(page.id, `manifest page ${index + 1}.id`)
    const pageNumber = requireInteger(page.number, `manifest page ${pageId}.number`)
    if (pageNumber !== index + 1) {
      fail(`manifest page ${pageId} must use numbered-page mapping ${index + 1}.`)
    }
    if (seenPageNumbers.has(pageNumber) || seenPageIds.has(pageId)) {
      fail(`manifest page identity or number is duplicated at ${pageId}.`)
    }
    seenPageNumbers.add(pageNumber)
    seenPageIds.add(pageId)
    requireString(page.label, `manifest page ${pageId}.label`)
    requireString(page.title, `manifest page ${pageId}.title`)
    for (const field of ['width', 'height', 'rotation']) {
      if (typeof page[field] !== 'number' || !Number.isFinite(page[field])) {
        fail(`manifest page ${pageId}.${field} is missing or invalid.`)
      }
    }
  }
  return document
}

function sourceFingerprintFor(document, sourceDirectory) {
  const sourcePath = resolve(sourceDirectory, document.file.name)
  let bytes
  try {
    bytes = readFileSync(sourcePath)
  } catch {
    fail(`source PDF is missing at ${sourcePath}.`)
  }
  const fingerprint = sha256(bytes)
  if (fingerprint !== document.file.sha256 || bytes.byteLength !== document.file.byteSize) {
    fail(
      `source PDF does not match ${document.versionId}; restore ${document.file.name} or update the manifest with a new immutable version.`,
    )
  }
  return { fingerprint, byteSize: bytes.byteLength }
}

function validatedParseResult(exportValue, pageCount, requiredModel) {
  const response = requireRecord(exportValue, 'Reducto export')
  if (response.response_type !== 'parse') {
    fail('the export response_type must be "parse".')
  }
  const result = requireRecord(response.result, 'Reducto export.result')
  if (result.type !== 'full') {
    fail('the export must contain a self-contained full Parse result, not an expiring URL result.')
  }
  const usage = requireRecord(response.usage, 'Reducto export.usage')
  const usageBreakdown = requireRecord(
    usage.usage_breakdown,
    'Reducto export.usage.usage_breakdown',
  )
  const model = requireString(
    usageBreakdown.parse_model,
    'Reducto export.usage.usage_breakdown.parse_model',
  ).trim().toLowerCase()
  if (model !== requiredModel) {
    fail(
      `Reducto export model ${model} does not match the manifest-required model ${requiredModel}.`,
    )
  }
  const parsedPageCount = requireInteger(
    usage.num_pages,
    'Reducto export.usage.num_pages',
  )
  if (parsedPageCount !== pageCount) {
    fail(
      `Reducto parsed ${parsedPageCount} pages but the manifest requires ${pageCount}.`,
    )
  }
  const chunks = requireArray(result.chunks, 'Reducto export.result.chunks')
  if (chunks.length === 0) fail('Reducto export.result.chunks is empty.')
  return { result, chunks, model }
}

function importedBlocks(document, chunks) {
  const pageCount = document.pages.length
  const blocksByPage = document.pages.map(() => [])
  for (const [chunkIndex, chunkValue] of chunks.entries()) {
    const chunk = requireRecord(chunkValue, `Reducto chunk ${chunkIndex}`)
    requireString(chunk.content, `Reducto chunk ${chunkIndex}.content`)
    const blocks = requireArray(chunk.blocks, `Reducto chunk ${chunkIndex}.blocks`)
    for (const [chunkBlockIndex, blockValue] of blocks.entries()) {
      const name = `Reducto chunk ${chunkIndex} block ${chunkBlockIndex}`
      const source = requireRecord(blockValue, name)
      const sourceType = normalizedSourceType(source.type)
      const content = requireString(source.content, `${name}.content`).trim()
      const pageNumber = pageNumberFromBoundingBox(
        source.bbox,
        `${name}.bbox`,
        pageCount,
      )
      const region = regionFromBoundingBox(source.bbox, `${name}.bbox`)
      const page = document.pages[pageNumber - 1]
      const order = blocksByPage[pageNumber - 1].length
      const id = groundedBlockId(document, page, order, sourceType, content, region)
      const block = {
        id,
        order,
        sourceType,
        content,
        contentFormat: contentFormatFor(sourceType, content, name),
        region,
        ...(() => {
          const confidence = blockConfidence(source, name)
          return confidence === undefined ? {} : { confidence }
        })(),
        classification: classificationFor(sourceType, source),
        provenance: { provider: 'reducto', sourceType },
      }
      blocksByPage[pageNumber - 1].push(block)
    }
  }

  for (const page of document.pages) {
    if (blocksByPage[page.number - 1].length === 0) {
      fail(`Reducto export has no prepared content for manifest page ${page.id}.`)
    }
  }
  return blocksByPage
}

export function createPreparedEvidenceArtifact({
  documentId,
  exportBytes,
  manifest,
  sourceDirectory,
}) {
  const document = validateManifestDocument(
    requireRecord(manifest, 'manifest'),
    documentId,
  )
  const exportFingerprint = sha256(exportBytes)
  if (exportFingerprint !== document.preparedEvidence.parseExportSha256) {
    fail(
      `Parse export SHA-256 ${exportFingerprint} does not match ${document.versionId}; expected ${document.preparedEvidence.parseExportSha256}.`,
    )
  }
  let exportValue
  try {
    exportValue = JSON.parse(exportBytes.toString('utf8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`Reducto export could not be read as JSON: ${reason}`)
  }
  const { fingerprint, byteSize } = sourceFingerprintFor(document, sourceDirectory)
  const { chunks, model } = validatedParseResult(
    exportValue,
    document.pages.length,
    document.preparedEvidence.requiredModel,
  )
  const blocksByPage = importedBlocks(document, chunks)

  return {
    schemaVersion: 2,
    document: {
      id: document.id,
      versionId: document.versionId,
      kind: document.kind,
      title: document.title,
    },
    source: {
      fingerprint,
      byteSize,
      pageCount: document.pages.length,
    },
    provenance: {
      provider: 'reducto',
      importerVersion: IMPORTER_VERSION,
      sourceFingerprint: fingerprint,
      verified: {
        parseExportSha256: exportFingerprint,
        model,
        modelSource: 'usage.usage_breakdown.parse_model',
      },
      maintainerDeclaredParseSettings: MAINTAINER_DECLARED_PARSE_SETTINGS,
    },
    pages: document.pages.map((page) => {
      const blocks = blocksByPage[page.number - 1]
      const tableRows = blocks.flatMap((block) =>
        block.contentFormat === 'html' ? tableRowsFor(block, block.id) : [],
      )
      return {
        page: manifestPageReference(page),
        blocks,
        tableRows,
      }
    }),
  }
}

function argumentValue(argumentsList, name) {
  const index = argumentsList.indexOf(name)
  if (index === -1) return undefined
  const value = argumentsList[index + 1]
  if (!value || value.startsWith('--')) fail(`${name} requires a value.`)
  return value
}

function cliOptions(argumentsList) {
  if (argumentsList.includes('--help')) return { help: true }
  const allowed = new Set([
    '--document',
    '--export',
    '--manifest',
    '--source-directory',
    '--output',
  ])
  for (let index = 0; index < argumentsList.length; index += 2) {
    if (!allowed.has(argumentsList[index])) fail(`unknown option ${argumentsList[index]}.`)
  }
  const documentId = argumentValue(argumentsList, '--document')
  const exportPath = argumentValue(argumentsList, '--export')
  if (!documentId || !exportPath) {
    fail('usage: pnpm import:document-evidence --document <id> --export <path>.')
  }
  return {
    help: false,
    documentId,
    exportPath: resolve(exportPath),
    manifestPath: resolve(argumentValue(argumentsList, '--manifest') ?? DEFAULT_MANIFEST_PATH),
    sourceDirectory: resolve(
      argumentValue(argumentsList, '--source-directory') ?? DEFAULT_SOURCE_DIRECTORY,
    ),
    outputPath: argumentValue(argumentsList, '--output'),
  }
}

function readJson(path, description) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`${description} at ${path} could not be read as JSON: ${reason}`)
  }
}

function readBytes(path, description) {
  try {
    return readFileSync(path)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`${description} at ${path} could not be read: ${reason}`)
  }
}

function writeArtifact(path, artifact) {
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.tmp`,
  )
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
      flag: 'wx',
    })
    renameSync(temporaryPath, path)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

export function runImportCommand(argumentsList) {
  const options = cliOptions(argumentsList)
  if (options.help) {
    return {
      help:
        'Usage: pnpm import:document-evidence --document <id> --export <parse.json> [--output <artifact.json>]',
    }
  }
  const manifest = readJson(options.manifestPath, 'manifest')
  const exportBytes = readBytes(options.exportPath, 'Reducto export')
  const artifact = createPreparedEvidenceArtifact({
    documentId: options.documentId,
    exportBytes,
    manifest,
    sourceDirectory: options.sourceDirectory,
  })
  const outputPath = resolve(
    options.outputPath ??
      join(DEFAULT_OUTPUT_DIRECTORY, `${artifact.document.versionId}.json`),
  )
  writeArtifact(outputPath, artifact)
  return { artifact, outputPath }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const result = runImportCommand(process.argv.slice(2))
    console.log(result.help ?? `Wrote ${result.outputPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getDocument, Util, version as pdfjsVersion } from 'pdfjs-dist/legacy/build/pdf.mjs'
import demoProjectManifest from '../src/demoProject/demoProjectManifest.json' with { type: 'json' }

const projectRoot = resolve(import.meta.dirname, '..')
const sourceDirectory = join(projectRoot, 'public', 'demo-project')
const standardFontDataUrl = `${join(projectRoot, 'node_modules', 'pdfjs-dist', 'standard_fonts')}/`
const outputPath = join(
  projectRoot,
  'src',
  'documents',
  'generated',
  'demoProjectIndexes.json',
)

function normalizedBox(values) {
  return values.map((value) => Math.max(0, Math.min(1, Number(value.toFixed(6)))))
}

function extractEmbeddedRuns(viewport, textContent) {
  return textContent.items.flatMap((item) => {
    if (!('str' in item) || !item.str.trim()) return []

    const transform = Util.transform(viewport.transform, item.transform)
    const height = Math.hypot(transform[2], transform[3]) || item.height
    const left = transform[4]
    const bottom = transform[5]

    return [{
      text: item.str.trim(),
      box: normalizedBox([
        left / viewport.width,
        (bottom - height) / viewport.height,
        (left + item.width) / viewport.width,
        bottom / viewport.height,
      ]),
      source: 'embedded',
    }]
  })
}

function readPngSize(path) {
  const bytes = readFileSync(path)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function extractOcrRuns(pdfPath, pageNumber, scratchDirectory) {
  const prefix = join(scratchDirectory, `${basename(pdfPath, '.pdf')}-${pageNumber}`)
  execFileSync('pdftoppm', [
    '-f', String(pageNumber),
    '-l', String(pageNumber),
    '-singlefile',
    '-png',
    '-r', '150',
    pdfPath,
    prefix,
  ], { stdio: ['ignore', 'ignore', 'ignore'] })

  const imagePath = `${prefix}.png`
  const { width, height } = readPngSize(imagePath)
  const tsv = execFileSync(
    'tesseract',
    [imagePath, 'stdout', '--psm', '11', 'tsv'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  const lines = new Map()

  for (const row of tsv.trim().split('\n').slice(1)) {
    const fields = row.split('\t')
    if (fields.length < 12 || fields[0] !== '5') continue
    const text = fields.slice(11).join('\t').trim()
    const confidence = Number(fields[10])
    if (!text || confidence < 0) continue

    const key = fields.slice(1, 5).join(':')
    const left = Number(fields[6])
    const top = Number(fields[7])
    const right = left + Number(fields[8])
    const bottom = top + Number(fields[9])
    const line = lines.get(key) ?? {
      words: [],
      confidences: [],
      left,
      top,
      right,
      bottom,
    }
    line.words.push(text)
    line.confidences.push(confidence)
    line.left = Math.min(line.left, left)
    line.top = Math.min(line.top, top)
    line.right = Math.max(line.right, right)
    line.bottom = Math.max(line.bottom, bottom)
    lines.set(key, line)
  }

  return [...lines.values()].map((line) => ({
    text: line.words.join(' '),
    box: normalizedBox([
      line.left / width,
      line.top / height,
      line.right / width,
      line.bottom / height,
    ]),
    source: 'ocr',
    confidence: Number(
      (line.confidences.reduce((sum, value) => sum + value, 0) /
        line.confidences.length /
        100).toFixed(4),
    ),
  }))
}

function pageReference(page) {
  return {
    id: page.id,
    label: page.label,
    number: page.number,
    title: page.title,
    ...(page.sheetNumber ? { sheetNumber: page.sheetNumber } : {}),
  }
}

const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-document-index-'))
const indexes = []

try {
  const tesseractVersion = execFileSync('tesseract', ['--version'], {
    encoding: 'utf8',
  }).split('\n')[0].replace('tesseract ', '')

  for (const definition of demoProjectManifest.documents) {
    const pdfPath = join(sourceDirectory, definition.file.name)
    const sourceBytes = readFileSync(pdfPath)
    const sourceFingerprint = createHash('sha256').update(sourceBytes).digest('hex')
    if (
      sourceBytes.byteLength !== definition.file.byteSize ||
      sourceFingerprint !== definition.file.sha256
    ) {
      throw new Error(`PDF asset does not match the manifest: ${definition.file.name}`)
    }

    const loadingTask = getDocument({
      data: new Uint8Array(sourceBytes),
      standardFontDataUrl,
    })
    const pdf = await loadingTask.promise
    if (
      pdf.numPages !== definition.file.pageCount ||
      definition.pages.length !== definition.file.pageCount
    ) {
      throw new Error(`PDF page count does not match the manifest: ${definition.file.name}`)
    }

    const pages = []
    for (const sourcePage of definition.pages) {
      const page = await pdf.getPage(sourcePage.number)
      const viewport = page.getViewport({ scale: 1 })
      if (
        viewport.width !== sourcePage.width ||
        viewport.height !== sourcePage.height ||
        viewport.rotation !== sourcePage.rotation
      ) {
        throw new Error(`PDF page geometry does not match the manifest: ${sourcePage.id}`)
      }

      const textContent = await page.getTextContent()
      let runs = extractEmbeddedRuns(viewport, textContent)
      if (runs.length === 0) {
        runs = extractOcrRuns(pdfPath, sourcePage.number, scratchDirectory)
      }

      pages.push({
        page: pageReference(sourcePage),
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
        status: runs.length > 0 ? 'indexed' : 'no-usable-text',
        runs,
      })
    }

    indexes.push({
      schemaVersion: 1,
      documentId: definition.id,
      documentVersionId: definition.versionId,
      sourceFingerprint,
      extractor: {
        pipelineVersion: 'grounded-demo-index-1',
        pdfjsVersion,
        ocrEngine: 'tesseract',
        ocrEngineVersion: tesseractVersion,
      },
      pages,
    })

    await loadingTask.destroy()
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(indexes, null, 2)}\n`)
  console.log(`Wrote ${outputPath}`)
} finally {
  rmSync(scratchDirectory, { recursive: true, force: true })
}

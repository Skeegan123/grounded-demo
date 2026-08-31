import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getDocument, Util, version as pdfjsVersion } from 'pdfjs-dist/legacy/build/pdf.mjs'

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

const documentDefinitions = [
  {
    id: 'virginia-farmhouse-drawings',
    versionId: 'virginia-farmhouse-drawings-v1',
    filename: 'virginia-farmhouse-drawing-set.pdf',
    ocrPages: new Set([6, 24]),
    page(number) {
      if (number === 6) {
        return { id: 'sheet-a1.2', label: 'A1.2', title: '1st Floor Plan', sheetNumber: 'A1.2' }
      }
      if (number === 24) {
        return { id: 'sheet-a4.3', label: 'A4.3', title: 'Doors & Windows', sheetNumber: 'A4.3' }
      }
      return { id: `drawing-page-${number}`, label: `PDF ${number}`, title: `Drawing page ${number}` }
    },
  },
  {
    id: 'type-c-door-submittal',
    versionId: 'type-c-door-submittal-v1',
    filename: 'type-c-door-submittal.pdf',
    ocrPages: new Set(),
    page(number) {
      return {
        id: `door-submittal-page-${number}`,
        label: String(number),
        title:
          number === 1
            ? 'Submittal cover'
            : 'Hollow-core flush wood door product data',
      }
    },
  },
]

function normalizedBox(values) {
  return values.map((value) => Math.max(0, Math.min(1, Number(value.toFixed(6)))))
}

function extractEmbeddedRuns(page, viewport, textContent) {
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

const scratchDirectory = mkdtempSync(join(tmpdir(), 'grounded-document-index-'))
const indexes = []

try {
  const tesseractVersion = execFileSync('tesseract', ['--version'], {
    encoding: 'utf8',
  }).split('\n')[0].replace('tesseract ', '')

  for (const definition of documentDefinitions) {
    const pdfPath = join(sourceDirectory, definition.filename)
    const bytes = new Uint8Array(readFileSync(pdfPath))
    const loadingTask = getDocument({ data: bytes, standardFontDataUrl })
    const pdf = await loadingTask.promise
    const pages = []

    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      const textContent = await page.getTextContent()
      let runs = extractEmbeddedRuns(page, viewport, textContent)

      if (runs.length === 0 && definition.ocrPages.has(number)) {
        runs = extractOcrRuns(pdfPath, number, scratchDirectory)
      }

      pages.push({
        page: { ...definition.page(number), number },
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
      sourceFingerprint: createHash('sha256').update(readFileSync(pdfPath)).digest('hex'),
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

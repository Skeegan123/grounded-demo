import { readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const MAX_ENTRY_RAW_BYTES = 870_000
const MAX_ENTRY_GZIP_BYTES = 215_000

function distDirectory(argumentsList) {
  if (argumentsList.length === 0) return resolve('dist')
  if (argumentsList.length === 2 && argumentsList[0] === '--dist') {
    return resolve(argumentsList[1])
  }
  throw new Error('Usage: pnpm bundle:check [--dist <production-build-directory>]')
}

function entryFileFromManifest(directory) {
  const manifestPath = join(directory, '.vite', 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entries = Object.values(manifest).filter(
    (entry) => entry?.isEntry === true &&
      typeof entry.file === 'string' &&
      entry.file.endsWith('.js'),
  )
  if (entries.length !== 1) {
    throw new Error(
      `Expected one JavaScript entry in ${manifestPath}; found ${entries.length}.`,
    )
  }
  const file = entries[0].file
  if (isAbsolute(file) || file.split('/').includes('..')) {
    throw new Error(`Vite manifest entry is outside the production build: ${file}`)
  }
  return file
}

function kibibytes(bytes) {
  return (bytes / 1024).toFixed(2)
}

function checkEntryBundle(argumentsList) {
  const directory = distDirectory(argumentsList)
  const file = entryFileFromManifest(directory)
  const bytes = readFileSync(join(directory, file))
  const rawBytes = bytes.byteLength
  const gzipBytes = gzipSync(bytes).byteLength

  console.log(`Entry: ${file}`)
  console.log(
    `Raw: ${rawBytes} bytes (${kibibytes(rawBytes)} KiB; budget ${MAX_ENTRY_RAW_BYTES} bytes)`,
  )
  console.log(
    `Gzip: ${gzipBytes} bytes (${kibibytes(gzipBytes)} KiB; budget ${MAX_ENTRY_GZIP_BYTES} bytes)`,
  )

  if (rawBytes > MAX_ENTRY_RAW_BYTES) {
    throw new Error('The entry bundle exceeds its raw budget.')
  }
  if (gzipBytes > MAX_ENTRY_GZIP_BYTES) {
    throw new Error('The entry bundle exceeds its gzip budget.')
  }
}

try {
  checkEntryBundle(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

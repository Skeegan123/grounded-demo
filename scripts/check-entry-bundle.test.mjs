import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const checkerPath = resolve('scripts/check-entry-bundle.mjs')

function fixtureDist(entryBytes) {
  const directory = mkdtempSync(join(tmpdir(), 'grounded-entry-bundle-'))
  mkdirSync(join(directory, '.vite'))
  mkdirSync(join(directory, 'assets'))
  writeFileSync(join(directory, '.vite', 'manifest.json'), JSON.stringify({
    'src/main.tsx': {
      file: 'assets/nonstandard-hash-name.js',
      isEntry: true,
    },
  }))
  writeFileSync(join(directory, 'assets', 'nonstandard-hash-name.js'), entryBytes)
  return directory
}

test('the entry-bundle command follows the Vite manifest instead of a filename pattern', () => {
  const result = spawnSync(
    process.execPath,
    [checkerPath, '--dist', fixtureDist('console.log("small entry")')],
    { encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /assets\/nonstandard-hash-name\.js/)
  assert.match(result.stdout, /Raw: 26 bytes/)
  assert.match(result.stdout, /Gzip: \d+ bytes/)
})

test('the entry-bundle command rejects a significant raw-size regression', () => {
  const result = spawnSync(
    process.execPath,
    [checkerPath, '--dist', fixtureDist('x'.repeat(2_000_000))],
    { encoding: 'utf8' },
  )

  assert.equal(result.status, 1)
  assert.match(result.stderr, /entry bundle exceeds its raw budget/i)
})

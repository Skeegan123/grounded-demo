import type {
  EvidenceClassification,
  NormalizedRegion,
  PreparedEvidenceArtifact,
  PreparedEvidenceBlock,
  PreparedEvidenceTableCell,
  PreparedEvidenceTableRow,
} from './preparedEvidence'

export interface SearchProjectDocumentsInput {
  query: string
  scope?: {
    documentId: string
    documentVersionId: string
  }
  limit?: number
}

export interface DocumentSearchMatch {
  rank: number
  matchedTerms: string[]
  document: PreparedEvidenceArtifact['document']
  page: {
    id: string
    label: string
    number: number
    title: string
    sheetNumber?: string
  }
  block: {
    id: string
    type: string
  }
  matchType: 'block' | 'table_row'
  snippet: string
  region: NormalizedRegion
  classification: EvidenceClassification
  tableRow?: {
    id: string
    parentBlockId: string
    rowIndex: number
    cells: PreparedEvidenceTableCell[]
  }
}

interface SearchRecord {
  document: PreparedEvidenceArtifact['document']
  documentOrder: number
  page: PreparedEvidenceArtifact['pages'][number]['page']
  block: PreparedEvidenceBlock
  matchType: 'block' | 'table_row'
  tableRow?: PreparedEvidenceTableRow
  primaryText: string
  primaryTokens: Set<string>
  headerText: string
  headerTokens: Set<string>
  contextText: string
  contextTokens: Set<string>
  metadataTokens: Set<string>
  pageReferenceTokens: Set<string>
  blockOrder: number
  rowIndex: number
}

interface ScoredRecord {
  record: SearchRecord
  score: number
  matchedTerms: string[]
}

const DEFAULT_RESULT_LIMIT = 8
const MAX_RESULT_LIMIT = 20
const MAX_QUERY_LENGTH = 300

// A score of 120 is one exact primary-content token. Multi-token queries must
// also meet the coverage rules in scoreRecord, so one stray word cannot qualify.
const MIN_RELEVANCE_SCORE = 120

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
])

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#')) {
        const hexadecimal = entity[1]?.toLowerCase() === 'x'
        const codePoint = Number.parseInt(
          entity.slice(hexadecimal ? 2 : 1),
          hexadecimal ? 16 : 10,
        )
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      }
      return HTML_ENTITIES[entity.toLowerCase()] ?? match
    })
}

function canonicalizeDimensions(value: string) {
  return value.replace(
    /(\d+(?:[- ]\d+\/\d+)?)\s*(?:in(?:ch(?:es)?)?\.?|["″])?\s*(?:x|by)\s*(\d+(?:[- ]\d+\/\d+)?)\s*(?:in(?:ch(?:es)?)?\.?|["″])?/gi,
    '$1x$2 ',
  )
}

function normalizeText(value: string) {
  return canonicalizeDimensions(
    decodeHtml(value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[×✕]/g, 'x'),
  )
    .replace(/["″]/g, '')
    .replace(/[^\p{L}\p{N}./'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokensFor(value: string) {
  const tokens: string[] = []
  const seen = new Set<string>()
  const matches = value.match(/[\p{L}\p{N}]+(?:[./'-][\p{L}\p{N}]+)*/gu) ?? []
  for (const match of matches) {
    const candidates = [match]
    if (match.includes('-') && !/\d/.test(match)) {
      candidates.push(...match.split('-'))
    }
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) continue
      seen.add(candidate)
      tokens.push(candidate)
    }
  }
  return tokens
}

function significantQueryTerms(query: string) {
  return tokensFor(query).filter((token) => !STOP_WORDS.has(token))
}

function isConstructionIdentifier(token: string) {
  return /\d/.test(token) && (/[a-z]/.test(token) || /[./'-]/.test(token) || token.includes('x'))
}

function precedingSectionHeader(
  blocks: PreparedEvidenceBlock[],
  block: PreparedEvidenceBlock,
) {
  for (let index = block.order - 1; index >= 0; index -= 1) {
    const candidate = blocks[index]
    if (candidate?.sourceType === 'Section Header') return candidate.content
  }
  return ''
}

function rowHeaderText(
  row: PreparedEvidenceTableRow,
  rows: PreparedEvidenceTableRow[],
) {
  const header = rows.find((candidate) =>
    candidate.cells.some((cell) => cell.header),
  )
  if (!header || header.id === row.id) return header?.text ?? ''
  return row.cells
    .map((cell, index) => `${header.cells[index]?.text ?? ''} ${cell.text}`.trim())
    .join(' ')
}

function recordForBlock(
  artifact: PreparedEvidenceArtifact,
  documentOrder: number,
  page: PreparedEvidenceArtifact['pages'][number],
  block: PreparedEvidenceBlock,
): SearchRecord {
  const primaryText = normalizeText(block.content)
  return {
    document: artifact.document,
    documentOrder,
    page: page.page,
    block,
    matchType: 'block',
    primaryText,
    primaryTokens: new Set(tokensFor(primaryText)),
    headerText: '',
    headerTokens: new Set(),
    contextText: '',
    contextTokens: new Set(),
    metadataTokens: metadataTokensFor(artifact, page.page, block),
    pageReferenceTokens: pageReferenceTokensFor(page.page),
    blockOrder: block.order,
    rowIndex: -1,
  }
}

function metadataTokensFor(
  artifact: PreparedEvidenceArtifact,
  page: PreparedEvidenceArtifact['pages'][number]['page'],
  block: PreparedEvidenceBlock,
) {
  return new Set(tokensFor(normalizeText([
    artifact.document.title,
    artifact.document.kind,
    page.label,
    page.sheetNumber ?? '',
    page.title,
    block.sourceType,
  ].join(' '))))
}

function pageReferenceTokensFor(
  page: PreparedEvidenceArtifact['pages'][number]['page'],
) {
  return new Set(tokensFor(normalizeText([
    page.label,
    page.sheetNumber ?? '',
  ].join(' '))))
}

function recordsForArtifact(
  artifact: PreparedEvidenceArtifact,
  documentOrder: number,
) {
  const records: SearchRecord[] = []
  for (const page of artifact.pages) {
    for (const block of page.blocks) {
      const rows = page.tableRows.filter((row) => row.parentBlockId === block.id)
      if (block.sourceType !== 'Table' || rows.length === 0) {
        records.push(recordForBlock(artifact, documentOrder, page, block))
        continue
      }

      const contextText = normalizeText(precedingSectionHeader(page.blocks, block))
      for (const row of rows) {
        const primaryText = normalizeText(row.text)
        const headerText = normalizeText(rowHeaderText(row, rows))
        records.push({
          document: artifact.document,
          documentOrder,
          page: page.page,
          block,
          matchType: 'table_row',
          tableRow: row,
          primaryText,
          primaryTokens: new Set(tokensFor(primaryText)),
          headerText,
          headerTokens: new Set(tokensFor(headerText)),
          contextText,
          contextTokens: new Set(tokensFor(contextText)),
          metadataTokens: metadataTokensFor(artifact, page.page, block),
          pageReferenceTokens: pageReferenceTokensFor(page.page),
          blockOrder: block.order,
          rowIndex: row.rowIndex,
        })
      }
    }
  }
  return records
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]!
}

function hasFuzzyMatch(term: string, tokens: Set<string>) {
  if (term.length < 5) return false
  const maximumDistance = term.length >= 8 ? 2 : 1
  return [...tokens].some(
    (token) =>
      token.length >= 5 &&
      Math.abs(token.length - term.length) <= maximumDistance &&
      editDistance(term, token) <= maximumDistance,
  )
}

function containsPhrase(value: string, phrase: string) {
  let index = value.indexOf(phrase)
  while (index !== -1) {
    const before = index === 0 ? ' ' : value[index - 1]
    const afterIndex = index + phrase.length
    const after = afterIndex === value.length ? ' ' : value[afterIndex]
    if (before === ' ' && after === ' ') return true
    index = value.indexOf(phrase, index + 1)
  }
  return false
}

function scoreRecord(record: SearchRecord, query: string, terms: string[]) {
  const matched = new Set<string>()
  const contentMatched = new Set<string>()
  const fuzzyMatched = new Set<string>()
  let score = 0

  const primaryPhrase = containsPhrase(record.primaryText, query)
  const headerPhrase = containsPhrase(record.headerText, query)
  if (primaryPhrase) score += 1200
  if (headerPhrase) score += 900

  for (const term of terms) {
    if (record.primaryTokens.has(term)) {
      matched.add(term)
      contentMatched.add(term)
      score += 120
      if (isConstructionIdentifier(term)) score += 140
      continue
    }
    if (record.headerTokens.has(term)) {
      matched.add(term)
      contentMatched.add(term)
      score += 80
      if (isConstructionIdentifier(term)) score += 120
      continue
    }
    if (record.contextTokens.has(term)) {
      matched.add(term)
      contentMatched.add(term)
      score += 35
      continue
    }
    if (
      hasFuzzyMatch(term, record.primaryTokens) ||
      hasFuzzyMatch(term, record.headerTokens)
    ) {
      matched.add(term)
      fuzzyMatched.add(term)
      score += 30
    }
  }

  if (contentMatched.size > 0 || fuzzyMatched.size > 0) {
    for (const term of terms) {
      if (!matched.has(term) && record.metadataTokens.has(term)) {
        matched.add(term)
        score += 10
      }
      if (record.pageReferenceTokens.has(term)) score += 100
    }
  }

  const exactCoverage = contentMatched.size / terms.length
  const totalCoverage = matched.size / terms.length
  if (exactCoverage === 1) score += 350
  else if (exactCoverage >= 0.6) score += 120
  if (record.matchType === 'table_row' && matched.size > 0) score += 60
  if (
    matched.size > 0 &&
    (record.block.sourceType === 'Title' || record.block.sourceType === 'Section Header')
  ) {
    score += 50
  }

  const exactIdentifier = terms.some(
    (term) => isConstructionIdentifier(term) && contentMatched.has(term),
  )
  const qualifies =
    primaryPhrase ||
    headerPhrase ||
    exactIdentifier ||
    exactCoverage === 1 ||
    (contentMatched.size >= 2 && totalCoverage >= 0.5) ||
    (terms.length === 1 && contentMatched.size === 1) ||
    (fuzzyMatched.size > 0 && totalCoverage >= 0.75)

  if (!qualifies || score < MIN_RELEVANCE_SCORE) return undefined
  return {
    record,
    score,
    matchedTerms: terms.filter((term) => matched.has(term)),
  } satisfies ScoredRecord
}

function compareScored(left: ScoredRecord, right: ScoredRecord) {
  if (left.score !== right.score) return right.score - left.score
  if (left.record.documentOrder !== right.record.documentOrder) {
    return left.record.documentOrder - right.record.documentOrder
  }
  if (left.record.page.number !== right.record.page.number) {
    return left.record.page.number - right.record.page.number
  }
  if (left.record.blockOrder !== right.record.blockOrder) {
    return left.record.blockOrder - right.record.blockOrder
  }
  if (left.record.matchType !== right.record.matchType) {
    return left.record.matchType === 'block' ? -1 : 1
  }
  if (left.record.rowIndex !== right.record.rowIndex) {
    return left.record.rowIndex - right.record.rowIndex
  }
  const leftId = left.record.tableRow?.id ?? left.record.block.id
  const rightId = right.record.tableRow?.id ?? right.record.block.id
  return leftId.localeCompare(rightId)
}

function snippet(value: string) {
  const plain = decodeHtml(value).replace(/\s+/g, ' ').trim()
  if (plain.length <= 240) return plain
  const shortened = plain.slice(0, 237)
  const lastSpace = shortened.lastIndexOf(' ')
  return `${shortened.slice(0, lastSpace > 180 ? lastSpace : 237)}...`
}

function publicMatch(scored: ScoredRecord, rank: number): DocumentSearchMatch {
  const { record } = scored
  return {
    rank,
    matchedTerms: scored.matchedTerms,
    document: record.document,
    page: {
      id: record.page.id,
      label: record.page.label,
      number: record.page.number,
      title: record.page.title,
      ...(record.page.sheetNumber ? { sheetNumber: record.page.sheetNumber } : {}),
    },
    block: {
      id: record.block.id,
      type: record.block.sourceType,
    },
    matchType: record.matchType,
    snippet: snippet(record.tableRow?.text ?? record.block.content),
    region: record.tableRow?.region ?? record.block.region,
    classification: record.tableRow?.classification ?? record.block.classification,
    ...(record.tableRow
      ? {
          tableRow: {
            id: record.tableRow.id,
            parentBlockId: record.tableRow.parentBlockId,
            rowIndex: record.tableRow.rowIndex,
            cells: record.tableRow.cells,
          },
        }
      : {}),
  }
}

export function createDocumentSearch(artifacts: PreparedEvidenceArtifact[]) {
  const records = artifacts.flatMap((artifact, documentOrder) =>
    recordsForArtifact(artifact, documentOrder),
  )

  return (input: SearchProjectDocumentsInput) => {
    if (typeof input.query !== 'string') throw new Error('A search query is required.')
    if (input.query.length > MAX_QUERY_LENGTH) {
      throw new Error(`Search queries cannot exceed ${MAX_QUERY_LENGTH} characters.`)
    }
    const query = normalizeText(input.query.trim())
    if (!query) throw new Error('A non-empty search query is required.')
    const terms = significantQueryTerms(query)
    const limit = input.limit ?? DEFAULT_RESULT_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULT_LIMIT) {
      throw new Error(`Search result limit must be an integer from 1 through ${MAX_RESULT_LIMIT}.`)
    }

    let scopedRecords = records
    if (input.scope) {
      const scopeExists = artifacts.some(
        (artifact) =>
          artifact.document.id === input.scope?.documentId &&
          artifact.document.versionId === input.scope.documentVersionId,
      )
      if (!scopeExists) {
        throw new Error('The search scope does not exist in this Project Workspace.')
      }
      scopedRecords = records.filter(
        (record) =>
          record.document.id === input.scope?.documentId &&
          record.document.versionId === input.scope.documentVersionId,
      )
    }

    if (terms.length === 0) return { query, matches: [] }
    const matches = scopedRecords
      .map((record) => scoreRecord(record, query, terms))
      .filter((match): match is ScoredRecord => match !== undefined)
      .sort(compareScored)
      .slice(0, limit)
      .map((match, index) => publicMatch(match, index + 1))
    return { query, matches }
  }
}

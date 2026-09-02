import type {
  EvidenceClassification,
  NormalizedRegion,
  PreparedEvidenceArtifact,
  PreparedEvidenceBlock,
  PreparedEvidenceTableCell,
  PreparedEvidenceTableRow,
} from './preparedEvidence'
import { htmlToPlainText } from './htmlToPlainText.js'

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
  matchClass: number
  score: number
  matchedTerms: string[]
}

interface QueryTerm {
  value: string
  canonical: string
  weight: number
  ordinaryWord: boolean
  constructionIdentifier: boolean
}

interface FuzzyTokenMatch {
  token: string
  source: 'primary' | 'header'
  similarity: number
}

const DEFAULT_RESULT_LIMIT = 8
const MAX_RESULT_LIMIT = 20
const MAX_QUERY_LENGTH = 300
const MIN_EXACT_SIGNAL_COVERAGE = 0.5
const MIN_FUZZY_ONLY_COVERAGE = 0.7
const MIN_FUZZY_ONLY_TERMS = 2
const SINGLE_FUZZY_MIN_LENGTH = 8
const SINGLE_FUZZY_MIN_SIMILARITY = 0.875
const UNCOMMON_TOKEN_MAX_RECORDS = 2

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

function canonicalizeDimensions(value: string) {
  return value.replace(
    /(\d+(?:[- ]\d+\/\d+)?)\s*(?:in(?:ch(?:es)?)?\.?|["″])?\s*(?:x|by)\s*(\d+(?:[- ]\d+\/\d+)?)\s*(?:in(?:ch(?:es)?)?\.?|["″])?/gi,
    '$1x$2 ',
  )
}

function normalizeText(value: string) {
  return canonicalizeDimensions(
    htmlToPlainText(value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐‑‒–—−]/g, '-')
      .replace(/[×✕]/g, 'x'),
  )
    .replace(/["″]/g, '')
    .replace(/[^\p{L}\p{N}./'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rawTokensFor(value: string) {
  return value.match(/[\p{L}\p{N}]+(?:[./'-][\p{L}\p{N}]+)*/gu) ?? []
}

function pluralFold(token: string) {
  if (!/^[a-z]+$/.test(token) || token.length <= 3) return token
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`
  if (/(?:ches|shes|xes|zes|sses)$/.test(token)) return token.slice(0, -2)
  if (
    token.endsWith('s') &&
    !token.endsWith('ss') &&
    !token.endsWith('us') &&
    !token.endsWith('is')
  ) {
    return token.slice(0, -1)
  }
  return token
}

function tokensFor(value: string) {
  const tokens: string[] = []
  const seen = new Set<string>()
  const matches = rawTokensFor(value)
  for (const match of matches) {
    const candidates = [match]
    if (match.includes('-') && !/\d/.test(match)) {
      candidates.push(...match.split('-'))
    }
    for (const candidate of candidates) {
      const canonical = pluralFold(candidate)
      if (!canonical || seen.has(canonical)) continue
      seen.add(canonical)
      tokens.push(canonical)
    }
  }
  return tokens
}

function significantQueryTerms(query: string) {
  const terms: QueryTerm[] = []
  const seen = new Set<string>()
  for (const rawValue of rawTokensFor(query)) {
    const values = rawValue.includes('-') && !/\d/.test(rawValue)
      ? rawValue.split('-')
      : [rawValue]
    for (const value of values) {
      const canonical = pluralFold(value)
      if (STOP_WORDS.has(canonical) || seen.has(canonical)) continue
      seen.add(canonical)
      const constructionIdentifier = isConstructionIdentifier(canonical)
      terms.push({
        value,
        canonical,
        weight: constructionIdentifier ? 1.5 : 1,
        ordinaryWord: /^[a-z]+$/.test(canonical),
        constructionIdentifier,
      })
    }
  }
  return terms
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

function damerauLevenshtein(left: string, right: string) {
  const distances = Array.from(
    { length: left.length + 1 },
    (_, leftIndex) => Array.from(
      { length: right.length + 1 },
      (_, rightIndex) => leftIndex === 0 ? rightIndex : rightIndex === 0 ? leftIndex : 0,
    ),
  )
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      distances[leftIndex]![rightIndex] = Math.min(
        distances[leftIndex - 1]![rightIndex]! + 1,
        distances[leftIndex]![rightIndex - 1]! + 1,
        distances[leftIndex - 1]![rightIndex - 1]! + substitution,
      )
      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        distances[leftIndex]![rightIndex] = Math.min(
          distances[leftIndex]![rightIndex]!,
          distances[leftIndex - 2]![rightIndex - 2]! + 1,
        )
      }
    }
  }
  return distances[left.length]![right.length]!
}

function bestFuzzyMatch(
  term: QueryTerm,
  record: SearchRecord,
  usedTokens: Set<string>,
) {
  if (!term.ordinaryWord || term.canonical.length < 5) return undefined
  const maximumDistance = term.canonical.length >= 8 ? 2 : 1
  const candidates: FuzzyTokenMatch[] = []
  for (const [source, tokens] of [
    ['primary', record.primaryTokens],
    ['header', record.headerTokens],
  ] as const) {
    for (const token of tokens) {
      if (
        usedTokens.has(token) ||
        !/^[a-z]+$/.test(token) ||
        token.length < 5 ||
        Math.abs(token.length - term.canonical.length) > maximumDistance
      ) {
        continue
      }
      const distance = damerauLevenshtein(term.canonical, token)
      const similarity = 1 - distance / Math.max(term.canonical.length, token.length)
      if (distance <= maximumDistance && similarity >= 0.8) {
        candidates.push({ token, source, similarity })
      }
    }
  }
  return candidates.sort((left, right) =>
    right.similarity - left.similarity ||
    (left.source === right.source ? 0 : left.source === 'primary' ? -1 : 1) ||
    left.token.localeCompare(right.token),
  )[0]
}

function corpusTokenFrequencies(records: SearchRecord[]) {
  const frequencies = new Map<string, number>()
  for (const record of records) {
    const tokens = new Set([
      ...record.primaryTokens,
      ...record.headerTokens,
    ])
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
    }
  }
  return frequencies
}

function weightedCoverage(terms: QueryTerm[], matched: Set<string>) {
  const totalWeight = terms.reduce((total, term) => total + term.weight, 0)
  const matchedWeight = terms.reduce(
    (total, term) => total + (matched.has(term.canonical) ? term.weight : 0),
    0,
  )
  return totalWeight === 0 ? 0 : matchedWeight / totalWeight
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

function scoreRecord(
  record: SearchRecord,
  query: string,
  terms: QueryTerm[],
  tokenFrequencies: Map<string, number>,
) {
  const matched = new Set<string>()
  const exactMatched = new Set<string>()
  const lexicalExactMatched = new Set<string>()
  const fuzzyMatched = new Set<string>()
  const fuzzyMatches = new Map<string, FuzzyTokenMatch>()
  const usedCorpusTokens = new Set<string>()
  let score = 0

  const primaryPhrase = containsPhrase(record.primaryText, query)
  const headerPhrase = containsPhrase(record.headerText, query)
  if (primaryPhrase) score += 1200
  if (headerPhrase) score += 900

  for (const term of terms) {
    if (record.primaryTokens.has(term.canonical)) {
      matched.add(term.canonical)
      exactMatched.add(term.canonical)
      lexicalExactMatched.add(term.canonical)
      usedCorpusTokens.add(term.canonical)
      score += 120
      if (term.constructionIdentifier) score += 140
      continue
    }
    if (record.headerTokens.has(term.canonical)) {
      matched.add(term.canonical)
      exactMatched.add(term.canonical)
      lexicalExactMatched.add(term.canonical)
      usedCorpusTokens.add(term.canonical)
      score += 80
      if (term.constructionIdentifier) score += 120
      continue
    }
    if (record.contextTokens.has(term.canonical)) {
      matched.add(term.canonical)
      exactMatched.add(term.canonical)
      lexicalExactMatched.add(term.canonical)
      usedCorpusTokens.add(term.canonical)
      score += 35
    }
  }

  for (const term of terms) {
    if (matched.has(term.canonical)) continue
    const fuzzy = bestFuzzyMatch(term, record, usedCorpusTokens)
    if (!fuzzy) continue
    matched.add(term.canonical)
    fuzzyMatched.add(term.canonical)
    fuzzyMatches.set(term.canonical, fuzzy)
    usedCorpusTokens.add(fuzzy.token)
    score += fuzzy.source === 'primary' ? 30 : 25
  }

  if (lexicalExactMatched.size > 0 || fuzzyMatched.size > 0) {
    for (const term of terms) {
      if (!matched.has(term.canonical) && record.metadataTokens.has(term.canonical)) {
        matched.add(term.canonical)
        exactMatched.add(term.canonical)
        score += 10
      }
      if (record.pageReferenceTokens.has(term.canonical)) score += 100
    }
  }

  const exactCoverage = weightedCoverage(terms, exactMatched)
  const totalCoverage = weightedCoverage(terms, matched)
  const fuzzyCoverage = weightedCoverage(terms, fuzzyMatched)
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
    (term) =>
      term.constructionIdentifier && lexicalExactMatched.has(term.canonical),
  )
  const singleFuzzyTerm = terms.length === 1 ? terms[0] : undefined
  const singleFuzzyMatch = singleFuzzyTerm
    ? fuzzyMatches.get(singleFuzzyTerm.canonical)
    : undefined
  const uncommonSingleFuzzy =
    lexicalExactMatched.size === 0 &&
    fuzzyMatched.size === 1 &&
    singleFuzzyTerm !== undefined &&
    singleFuzzyMatch !== undefined &&
    singleFuzzyTerm.canonical.length >= SINGLE_FUZZY_MIN_LENGTH &&
    singleFuzzyMatch.similarity >= SINGLE_FUZZY_MIN_SIMILARITY &&
    (tokenFrequencies.get(singleFuzzyMatch.token) ?? 0) <= UNCOMMON_TOKEN_MAX_RECORDS
  const qualifies =
    primaryPhrase ||
    exactIdentifier ||
    (lexicalExactMatched.size > 0 && totalCoverage >= MIN_EXACT_SIGNAL_COVERAGE) ||
    (lexicalExactMatched.size === 0 &&
      fuzzyMatched.size >= MIN_FUZZY_ONLY_TERMS &&
      fuzzyCoverage >= MIN_FUZZY_ONLY_COVERAGE) ||
    uncommonSingleFuzzy

  if (!qualifies) return undefined
  const matchClass = primaryPhrase || exactIdentifier
    ? 1
    : exactCoverage === 1
      ? 2
      : fuzzyMatched.size === 0
        ? 3
        : lexicalExactMatched.size > 0
          ? 4
          : 5
  return {
    record,
    matchClass,
    score,
    matchedTerms: terms
      .filter((term) => matched.has(term.canonical))
      .map((term) => term.value),
  } satisfies ScoredRecord
}

function compareScored(left: ScoredRecord, right: ScoredRecord) {
  if (left.matchClass !== right.matchClass) return left.matchClass - right.matchClass
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
  const plain = htmlToPlainText(value).replace(/\s+/g, ' ').trim()
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
  const tokenFrequencies = corpusTokenFrequencies(records)

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
      .map((record) => scoreRecord(record, query, terms, tokenFrequencies))
      .filter((match): match is ScoredRecord => match !== undefined)
      .sort(compareScored)
      .slice(0, limit)
      .map((match, index) => publicMatch(match, index + 1))
    return { query, matches }
  }
}

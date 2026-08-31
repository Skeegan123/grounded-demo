import { expect, test } from 'vitest'
import preparedDocumentIndexes from './generated/demoProjectIndexes.json'
import { createDocuments } from './documents'

test('the Project Workspace catalog exposes both immutable document versions and every PDF page', () => {
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
      id: 'type-c-door-submittal',
      versionId: 'type-c-door-submittal-v1',
      pageCount: 2,
      namedSheetCount: 0,
      inspectedPages: [],
    },
  ])

  const drawings = catalog[0]!
  const inspection = documents.inspectText({
    documentId: drawings.id,
    documentVersionId: drawings.versionId,
    pageIds: drawings.pages.map((page) => page.id),
  })
  expect(
    inspection.pages.every(
      (page) => page.status === 'indexed' && page.text.trim().length > 0,
    ),
  ).toBe(true)
})

test('prepared page text exposes the Type C product and contract requirement with stable page references', () => {
  const documents = createDocuments()

  const schedule = documents.inspectText({
    documentId: 'virginia-farmhouse-drawings',
    documentVersionId: 'virginia-farmhouse-drawings-v1',
    pageIds: ['sheet-a4.3'],
  })
  const productData = documents.inspectText({
    documentId: 'type-c-door-submittal',
    documentVersionId: 'type-c-door-submittal-v1',
    pageIds: ['door-submittal-page-2'],
  })

  expect({
    schedule: {
      page: schedule.pages[0]?.page,
      source: schedule.pages[0]?.runs[0]?.source,
      text: schedule.pages[0]?.text,
    },
    productData: {
      page: productData.pages[0]?.page,
      source: productData.pages[0]?.runs[0]?.source,
      text: productData.pages[0]?.text,
    },
  }).toEqual({
    schedule: {
      page: {
        id: 'sheet-a4.3',
        label: 'A4.3',
        number: 24,
        sheetNumber: 'A4.3',
        title: 'Doors & Windows',
      },
      source: 'ocr',
      text: expect.stringMatching(
        /DOOR SCHEDULE[\s\S]*24["°]?x?80["°]?[\s\S]*WOOD[\s\S]*1-PANEL[\s\S]*SOLID WOOD/i,
      ),
    },
    productData: {
      page: {
        id: 'door-submittal-page-2',
        label: '2',
        number: 2,
        title: 'Hollow-core flush wood door product data',
      },
      source: 'embedded',
      text: expect.stringMatching(
        /Hollow-core flush wood door[\s\S]*24 in x 80 in[\s\S]*Hollow honeycomb core/i,
      ),
    },
  })
})

test('a failed prepared page requires a failure reason', () => {
  const invalidIndexes = structuredClone(preparedDocumentIndexes)
  invalidIndexes[0]!.pages[0]!.status = 'failed'

  expect(() => createDocuments(invalidIndexes)).toThrow(
    'Invalid DocumentIndex: failed page sheet-a0.0 requires a failure reason.',
  )
})

test('prepared page labels must match the immutable Project Workspace reference', () => {
  const invalidIndexes = structuredClone(preparedDocumentIndexes)
  invalidIndexes[0]!.pages[5]!.page.label = 'A1.2 changed'

  expect(() => createDocuments(invalidIndexes)).toThrow(
    'Invalid DocumentIndex: page sheet-a1.2 does not match its immutable reference.',
  )
})

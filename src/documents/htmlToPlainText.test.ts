import { expect, test } from 'vitest'
import { htmlToPlainText } from './htmlToPlainText.js'

test('HTML text decoding is shared by import and runtime search', () => {
  expect(
    htmlToPlainText('<b>Mark&nbsp;C</b><br>24&#x22; &times; 80&#34;'),
  ).toBe(' Mark C  24" × 80"')
  expect(htmlToPlainText('Keep &#999999999; unchanged')).toBe(
    'Keep &#999999999; unchanged',
  )
})

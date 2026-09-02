const HTML_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  times: '×',
})

function decodedCodePoint(entity) {
  const hexadecimal = entity[1]?.toLowerCase() === 'x'
  const codePoint = Number.parseInt(
    entity.slice(hexadecimal ? 2 : 1),
    hexadecimal ? 16 : 10,
  )
  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return undefined
  }
  return String.fromCodePoint(codePoint)
}

export function htmlToPlainText(value) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity.startsWith('#')) return decodedCodePoint(entity) ?? match
      return HTML_ENTITIES[entity.toLowerCase()] ?? match
    })
}

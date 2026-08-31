import { expect, test } from 'vitest'
import { getOrCreateDemoSessionId } from './demoSession'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

test('each tab keeps one isolated Demo Session identity across reloads', () => {
  const firstTab = createStorage()
  const secondTab = createStorage()
  const firstIdentity = getOrCreateDemoSessionId(firstTab, () => 'session-1')

  expect({
    firstIdentity,
    afterReload: getOrCreateDemoSessionId(firstTab, () => 'unused'),
    secondIdentity: getOrCreateDemoSessionId(secondTab, () => 'session-2'),
  }).toEqual({
    firstIdentity: 'session-1',
    afterReload: 'session-1',
    secondIdentity: 'session-2',
  })
})

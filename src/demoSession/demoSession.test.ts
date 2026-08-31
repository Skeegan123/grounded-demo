import { expect, test } from 'vitest'
import {
  DEMO_SESSION_STORAGE_KEY,
  getOrCreateDemoSessionId,
} from './demoSession'

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
  const firstTabContext = { name: '' }
  const secondTabContext = { name: '' }
  const firstIdentity = getOrCreateDemoSessionId(
    firstTab,
    () => 'session-1',
    firstTabContext,
    () => 'tab-1',
  )
  secondTab.setItem(
    DEMO_SESSION_STORAGE_KEY,
    firstTab.getItem(DEMO_SESSION_STORAGE_KEY)!,
  )

  expect({
    firstIdentity,
    afterReload: getOrCreateDemoSessionId(
      firstTab,
      () => 'unused',
      firstTabContext,
      () => 'unused-tab',
    ),
    secondIdentity: getOrCreateDemoSessionId(
      secondTab,
      () => 'session-2',
      secondTabContext,
      () => 'tab-2',
    ),
    tabNames: [firstTabContext.name, secondTabContext.name],
  }).toEqual({
    firstIdentity: 'session-1',
    afterReload: 'session-1',
    secondIdentity: 'session-2',
    tabNames: ['grounded:tab-1', 'grounded:tab-2'],
  })
})

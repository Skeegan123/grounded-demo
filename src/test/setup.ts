import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class TestResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element) {
    const width = target.classList.contains('workspace-grid') ? 1200 : 612
    this.callback([
      {
        target,
        contentRect: { width, height: 500 },
      } as ResizeObserverEntry,
    ], this)
  }

  disconnect() {}
  unobserve() {}
}

globalThis.ResizeObserver = TestResizeObserver

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

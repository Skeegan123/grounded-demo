import { expect, test, type Locator } from '@playwright/test'

test('one zoom-in click scales the actual PDF page to 110%', async ({ page }) => {
  await page.goto('/')

  const canvas = page.getByLabel('Rendered PDF page A0.0')
  await expect(canvas).toBeVisible()
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('The PDF canvas has no browser bounds.')

  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByText('110%')).toBeVisible()
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  await canvas.evaluate(async () => {
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  })

  const zoomedBounds = await canvas.boundingBox()
  if (!zoomedBounds) throw new Error('The zoomed PDF canvas has no browser bounds.')
  expect(zoomedBounds.width).toBeCloseTo(bounds.width * 1.1, 0)
})

test('the actual Demo Project PDF keeps a Point Set aligned on Sheet A1.2', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const tools = new Map<string, { execute: (input: unknown) => Promise<unknown> }>()
    Object.defineProperty(window, '__groundedTools', { value: tools })
    Object.defineProperty(document, 'modelContext', {
      value: {
        async registerTool(tool: { name: string; execute: (input: unknown) => Promise<unknown> }) {
          tools.set(tool.name, tool)
        },
      },
    })
  })
  await page.goto('/')
  await page.waitForFunction(() => (
    window as Window & { __groundedTools?: Map<string, unknown> }
  ).__groundedTools?.has('create_assistance_request'))
  await page.evaluate(async () => {
    const tool = (
      window as Window & {
        __groundedTools: Map<string, { execute: (input: unknown) => Promise<unknown> }>
      }
    ).__groundedTools.get('create_assistance_request')!
    await tool.execute({
      question: 'Mark the affected Type C openings.',
      responseType: 'point_set',
      documentId: 'virginia-farmhouse-drawings',
      documentVersionId: 'virginia-farmhouse-drawings-v1',
      recommendedPageIds: ['sheet-a1.2'],
    })
  })
  await page.getByRole('button', { name: 'Go to target' }).click()

  const canvas = page.getByLabel('Rendered PDF page A1.2')
  const overlay = page.getByLabel('Drawing page A1.2')
  await expect(canvas).toBeVisible()
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  await expectSameBounds(canvas, overlay)
  await expect.poll(() => canvas.evaluate((element) => {
    const pdfCanvas = element as HTMLCanvasElement
    const context = pdfCanvas.getContext('2d')!
    const pixels = context.getImageData(0, 0, pdfCanvas.width, pdfCanvas.height).data
    let nonWhiteSamples = 0
    const stride = Math.max(4, Math.floor(pixels.length / 5_000 / 4) * 4)
    for (let index = 0; index < pixels.length; index += stride) {
      if (pixels[index]! < 245 || pixels[index + 1]! < 245 || pixels[index + 2]! < 245) {
        nonWhiteSamples += 1
      }
    }
    return nonWhiteSamples
  })).toBeGreaterThan(25)

  const bounds = await overlay.boundingBox()
  if (!bounds) throw new Error('The Point Set overlay has no browser bounds.')
  await page.mouse.click(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.25,
  )
  await expect(page.getByText('1 point')).toBeVisible()
  const mark = overlay.locator('.point-mark')
  await expectPointAt(mark, { x: 0.5, y: 0.25 })

  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByText('110%')).toBeVisible()
  await expect.poll(async () => (await overlay.boundingBox())?.width ?? 0)
    .toBeGreaterThan(bounds.width * 1.05)
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const zoomedBounds = await overlay.boundingBox()
  if (!zoomedBounds) throw new Error('The zoomed Point Set overlay has no browser bounds.')
  await expectSameBounds(canvas, overlay)
  await expectPointAt(mark, { x: 0.5, y: 0.25 })
})

async function expectSameBounds(canvas: Locator, overlay: Locator) {
  const [canvasBounds, overlayBounds] = await Promise.all([
    canvas.boundingBox(),
    overlay.boundingBox(),
  ])
  if (!canvasBounds || !overlayBounds) {
    throw new Error('The PDF canvas or Point Set overlay has no browser bounds.')
  }
  expect(Math.abs(canvasBounds.x - overlayBounds.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(canvasBounds.y - overlayBounds.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(canvasBounds.width - overlayBounds.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(canvasBounds.height - overlayBounds.height)).toBeLessThanOrEqual(1)
}

async function expectPointAt(
  mark: Locator,
  expected: { x: number; y: number },
) {
  const position = await mark.evaluate((element) => {
    const parent = element.parentElement!
    const style = getComputedStyle(element)
    return {
      x: Number.parseFloat(style.left) / parent.clientWidth,
      y: Number.parseFloat(style.top) / parent.clientHeight,
    }
  })
  expect(position.x).toBeCloseTo(expected.x, 2)
  expect(position.y).toBeCloseTo(expected.y, 2)
}

declare global {
  interface Window {
    __groundedTools?: Map<string, unknown>
  }
}

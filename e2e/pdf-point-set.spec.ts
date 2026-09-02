import { expect, test, type Locator } from '@playwright/test'

test('trackpad scrolling zooms inside the fixed viewer without moving browser history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await page.goto('/')
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  await page.evaluate(() => {
    history.replaceState({ marker: 'previous' }, '', '/viewer-previous')
    history.pushState({ marker: 'current' }, '', '/viewer-current')
  })

  const viewer = page.locator('.pdf-page-viewer')
  const bounds = await viewer.boundingBox()
  if (!bounds) throw new Error('The PDF viewer has no browser bounds.')
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  )
  const scrollBefore = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, -240)
  await expect.poll(() => zoomPercentage(page)).toBeGreaterThan(100)
  await page.waitForTimeout(100)
  await page.mouse.wheel(240, 0)

  expect(await page.evaluate(() => ({
    historyMarker: history.state?.marker,
    rootOverscrollX: getComputedStyle(document.documentElement)
      .overscrollBehaviorX,
    scrollY: window.scrollY,
  }))).toEqual({
    historyMarker: 'current',
    rootOverscrollX: 'none',
    scrollY: scrollBefore,
  })
  await expect(viewer).toHaveCSS('overscroll-behavior', 'contain')
})

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

test('the fixed canvas zooms around the pointer and exposes every edge at 400%', async ({
  page,
}) => {
  await page.goto('/')

  const viewer = page.locator('.pdf-page-viewer')
  const stage = page.locator('.drawing-stage')
  const canvas = page.getByLabel('Rendered PDF page A0.0')
  await expect(canvas).toBeVisible()
  await expect(page.getByText('Rendering PDF page')).toBeHidden()

  const [viewerBounds, initialCanvasBounds, stageBounds, initialScrollHeight] =
    await Promise.all([
      viewer.boundingBox(),
      canvas.boundingBox(),
      stage.boundingBox(),
      page.evaluate(() => document.documentElement.scrollHeight),
    ])
  if (!viewerBounds || !initialCanvasBounds || !stageBounds) {
    throw new Error('The map canvas has no browser bounds.')
  }

  const pointer = {
    x: initialCanvasBounds.x + initialCanvasBounds.width * 0.25,
    y: initialCanvasBounds.y + initialCanvasBounds.height * 0.35,
  }
  await page.mouse.move(pointer.x, pointer.y)
  await page.mouse.wheel(0, -420)
  await expect.poll(() => zoomPercentage(page)).toBeGreaterThan(100)
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const pointerZoomBounds = await canvas.boundingBox()
  if (!pointerZoomBounds) throw new Error('The zoomed PDF canvas has no bounds.')
  expect((pointer.x - pointerZoomBounds.x) / pointerZoomBounds.width)
    .toBeCloseTo(0.25, 1)
  expect((pointer.y - pointerZoomBounds.y) / pointerZoomBounds.height)
    .toBeCloseTo(0.35, 1)

  await page.mouse.wheel(0, -10_000)
  await expect(page.getByText('400%')).toBeVisible()
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBe(initialScrollHeight)
  const maximumStageBounds = await stage.boundingBox()
  expect(maximumStageBounds?.height).toBeCloseTo(stageBounds.height, 0)

  await dragRepeatedly(page, viewer, 'toward-start')
  const startBounds = await canvas.boundingBox()
  if (!startBounds) throw new Error('The panned PDF canvas has no bounds.')
  expect(startBounds.x).toBeCloseTo(viewerBounds.x, 0)
  expect(startBounds.y).toBeCloseTo(viewerBounds.y, 0)

  await dragRepeatedly(page, viewer, 'toward-end')
  const [endBounds, zoomControlsBounds] = await Promise.all([
    canvas.boundingBox(),
    page.getByLabel('Document zoom').boundingBox(),
  ])
  if (!endBounds || !zoomControlsBounds) {
    throw new Error('The panned PDF canvas or zoom controls have no bounds.')
  }
  expect(endBounds.x + endBounds.width)
    .toBeLessThanOrEqual(zoomControlsBounds.x - 8)
  expect(endBounds.y + endBounds.height)
    .toBeLessThanOrEqual(zoomControlsBounds.y - 8)

  await page.keyboard.press('0')
  await expect(page.getByText('100%')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fit page' }))
    .not.toHaveAttribute('aria-pressed')
  await page.keyboard.press('Shift+0')
  await expect(page.getByRole('button', { name: 'Fit width' }))
    .not.toHaveAttribute('aria-pressed')
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0)
    .toBeCloseTo(viewerBounds.width, 0)

  await page.keyboard.press('+')
  await expect(page.getByText('110%')).toBeVisible()
  await page.keyboard.press('-')
  await expect(page.getByText('100%')).toBeVisible()

  await page.keyboard.press('ArrowRight')
  await expect(page.getByLabel('Rendered PDF page A0.1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fit page' }))
    .not.toHaveAttribute('aria-pressed')
})

test('two touch pointers pinch around their gesture center', async ({ page }) => {
  await page.goto('/')
  const viewer = page.locator('.pdf-page-viewer')
  const canvas = page.getByLabel('Rendered PDF page A0.0')
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const bounds = await viewer.boundingBox()
  if (!bounds) throw new Error('The map canvas has no browser bounds.')

  const center = {
    x: bounds.x + bounds.width * 0.45,
    y: bounds.y + bounds.height * 0.4,
  }
  await viewer.dispatchEvent('pointerdown', {
    button: 0,
    clientX: center.x - 40,
    clientY: center.y,
    pointerId: 41,
    pointerType: 'touch',
  })
  await viewer.dispatchEvent('pointerdown', {
    button: 0,
    clientX: center.x + 40,
    clientY: center.y,
    pointerId: 42,
    pointerType: 'touch',
  })
  await viewer.dispatchEvent('pointermove', {
    button: 0,
    buttons: 1,
    clientX: center.x + 100,
    clientY: center.y,
    pointerId: 42,
    pointerType: 'touch',
  })
  await viewer.dispatchEvent('pointerup', {
    button: 0,
    clientX: center.x + 100,
    clientY: center.y,
    pointerId: 42,
    pointerType: 'touch',
  })
  await viewer.dispatchEvent('pointerup', {
    button: 0,
    clientX: center.x - 40,
    clientY: center.y,
    pointerId: 41,
    pointerType: 'touch',
  })

  await expect.poll(() => zoomPercentage(page)).toBeGreaterThan(100)
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const zoomedBounds = await canvas.boundingBox()
  if (!zoomedBounds) throw new Error('The pinched PDF canvas has no bounds.')
  expect(center.x).toBeGreaterThan(zoomedBounds.x)
  expect(center.x).toBeLessThan(zoomedBounds.x + zoomedBounds.width)
  expect(center.y).toBeGreaterThan(zoomedBounds.y)
  expect(center.y).toBeLessThan(zoomedBounds.y + zoomedBounds.height)
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
  await page.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }).click()

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
  await expectMarkerAligned(canvas, mark, { x: 0.5, y: 0.25 })

  for (let step = 0; step < 4; step += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click()
  }
  await expect(page.getByText('150%')).toBeVisible()
  const viewer = page.locator('.pdf-page-viewer')
  const viewerBounds = await viewer.boundingBox()
  if (!viewerBounds) throw new Error('The map canvas has no browser bounds.')
  await page.mouse.move(
    viewerBounds.x + viewerBounds.width * 0.6,
    viewerBounds.y + viewerBounds.height * 0.6,
  )
  await page.mouse.down()
  await page.mouse.move(
    viewerBounds.x + viewerBounds.width * 0.3,
    viewerBounds.y + viewerBounds.height * 0.3,
    { steps: 4 },
  )
  await page.mouse.up()
  await expect(page.getByText('1 point')).toBeVisible()
  await expectSameBounds(canvas, overlay)
  await expectMarkerAligned(canvas, mark, { x: 0.5, y: 0.25 })

  await page.setViewportSize({ width: 1100, height: 800 })
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  await expectSameBounds(canvas, overlay)
  await expectMarkerAligned(canvas, mark, { x: 0.5, y: 0.25 })
})

test('point controls stay centered, stable, and attached to their point', async ({
  page,
}) => {
  await installRecordedTools(page)
  await page.goto('/')
  await createPointSetRequest(page)
  await page.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }).click()

  const overlay = page.getByLabel('Drawing page A1.2')
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const bounds = await overlay.boundingBox()
  if (!bounds) throw new Error('The target overlay has no browser bounds.')

  await page.mouse.click(
    bounds.x + bounds.width * 0.35,
    bounds.y + bounds.height * 0.4,
  )
  await page.mouse.click(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.3,
  )

  const firstPin = overlay.getByRole('button', { name: 'Point 1', exact: true })
  const pinBounds = await firstPin.boundingBox()
  const labelBounds = await firstPin.locator('.point-pin-label').boundingBox()
  if (!pinBounds || !labelBounds) {
    throw new Error('The Point Set pin or label has no browser bounds.')
  }
  expect.soft(pinBounds.width).toBeCloseTo(34, 0)
  expect.soft(pinBounds.height).toBeCloseTo(34, 0)
  expect.soft(labelBounds.x + labelBounds.width / 2)
    .toBeCloseTo(pinBounds.x + pinBounds.width / 2, 0)
  expect.soft(labelBounds.y + labelBounds.height / 2)
    .toBeCloseTo(pinBounds.y + pinBounds.height * (10 / 24), 0)

  await firstPin.hover()
  const removeFirst = overlay.getByRole('button', { name: 'Remove point 1' })
  const removeStart = await removeFirst.boundingBox()
  await expect.poll(() => removeFirst.evaluate(
    (element) => getComputedStyle(element).opacity,
  )).toBe('1')
  const removeEnd = await removeFirst.boundingBox()
  if (!removeStart || !removeEnd) {
    throw new Error('The Point Set remove control has no browser bounds.')
  }
  expect.soft(removeEnd.x).toBeCloseTo(removeStart.x, 1)
  expect.soft(removeEnd.y).toBeCloseTo(removeStart.y, 1)
  expect.soft(removeEnd.x + removeEnd.width / 2)
    .toBeCloseTo(pinBounds.x + pinBounds.width + 4, 0)
  expect.soft(removeEnd.y + removeEnd.height / 2)
    .toBeCloseTo(pinBounds.y + 4, 0)
  expect.soft(await removeFirst.evaluate(
    (element) => getComputedStyle(element).transitionProperty,
  )).toBe('opacity')

  await page.mouse.move(
    removeEnd.x + removeEnd.width / 2,
    removeEnd.y + removeEnd.height / 2,
    { steps: 5 },
  )
  await expect.poll(() => removeFirst.evaluate(
    (element) => getComputedStyle(element).opacity,
  )).toBe('1')
  await removeFirst.click()
  await expect(page.getByText('1 point')).toBeVisible()

  const remainingRemove = overlay.getByRole('button', { name: 'Remove point 1' })
  expect.soft(await remainingRemove.evaluate(
    (element) => element === document.activeElement,
  )).toBe(false)
  await expect.poll(() => remainingRemove.evaluate(
    (element) => getComputedStyle(element).opacity,
  )).toBe('0')
})

test('clicks place compact pins while drags and marker removal stay safe', async ({
  page,
}) => {
  await installRecordedTools(page)
  await page.goto('/')
  await createPointSetRequest(page)
  await page.getByRole('button', {
    name: 'Open A1.2: 1st Floor Plan',
  }).click()

  const overlay = page.getByLabel('Drawing page A1.2')
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const bounds = await overlay.boundingBox()
  if (!bounds) throw new Error('The target overlay has no browser bounds.')

  const firstPoint = {
    x: bounds.x + bounds.width * 0.35,
    y: bounds.y + bounds.height * 0.4,
  }
  await overlay.dispatchEvent('pointerdown', {
    button: 0,
    clientX: firstPoint.x,
    clientY: firstPoint.y,
    pointerId: 81,
    pointerType: 'touch',
  })
  await overlay.dispatchEvent('pointerup', {
    button: 0,
    clientX: firstPoint.x,
    clientY: firstPoint.y,
    pointerId: 81,
    pointerType: 'touch',
  })
  await expect(page.getByText('1 point')).toBeVisible()

  await page.mouse.move(
    bounds.x + bounds.width * 0.6,
    bounds.y + bounds.height * 0.6,
  )
  await page.mouse.down()
  await page.mouse.move(
    bounds.x + bounds.width * 0.45,
    bounds.y + bounds.height * 0.45,
    { steps: 4 },
  )
  await page.mouse.up()
  await expect(page.getByText('1 point')).toBeVisible()

  await page.mouse.click(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.3,
  )
  await expect(page.getByText('2 points')).toBeVisible()
  const firstPin = overlay.getByRole('button', { name: 'Point 1', exact: true })
  const pinSize = await firstPin.boundingBox()
  if (!pinSize) throw new Error('The Point Set pin has no browser bounds.')
  expect(pinSize.width).toBeCloseTo(34, 0)
  expect(pinSize.height).toBeCloseTo(34, 0)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const zoomedPinSize = await firstPin.boundingBox()
  if (!zoomedPinSize) throw new Error('The zoomed Point Set pin has no bounds.')
  expect(zoomedPinSize.width).toBeCloseTo(pinSize.width, 0)
  expect(zoomedPinSize.height).toBeCloseTo(pinSize.height, 0)
  await page.getByRole('button', { name: 'Fit page' }).click()
  await expect(page.getByText('Rendering PDF page')).toBeHidden()

  await firstPin.hover()
  const removeFirst = overlay.getByRole('button', { name: 'Remove point 1' })
  await expect.poll(() => removeFirst.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('1')
  await removeFirst.click()
  await expect(page.getByText('1 point')).toBeVisible()
  await expect(overlay.getByRole('button', { name: 'Point 2', exact: true }))
    .toHaveCount(0)
  const renumberedPin = overlay.getByRole('button', {
    name: 'Point 1',
    exact: true,
  })
  await expectPointAt(renumberedPin.locator('xpath=..'), { x: 0.7, y: 0.3 })

  await page.setViewportSize({ width: 820, height: 900 })
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  await renumberedPin.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 91,
    pointerType: 'touch',
  })
  await renumberedPin.dispatchEvent('click')
  const touchRemove = overlay.getByRole('button', { name: 'Remove point 1' })
  await expect.poll(() => touchRemove.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('1')

  const viewer = page.locator('.pdf-page-viewer')
  await viewer.dispatchEvent('pointerdown', {
    button: 0,
    clientX: 1,
    clientY: 1,
    pointerId: 92,
    pointerType: 'touch',
  })
  await viewer.dispatchEvent('pointercancel', {
    button: 0,
    clientX: 1,
    clientY: 1,
    pointerId: 92,
    pointerType: 'touch',
  })
  await expect.poll(() => touchRemove.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('0')
})

test('wide workbenches show Assistance by default and remember manual collapse', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await installRecordedTools(page)
  await page.goto('/')
  await createPointSetRequest(page)

  await expect(page.getByRole('heading', { name: 'Current Assistance' }))
    .toBeVisible()
  await expect(page.getByLabel('Active Assistance Request')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hide Assistance' }))
    .toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('button', { name: 'Hide Assistance' }).click()
  await expect(page.getByRole('heading', { name: 'Current Assistance' }))
    .toHaveCount(0)
  await expect(page.getByLabel('Active Assistance Request')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show Assistance' }))
    .toHaveAttribute('aria-expanded', 'false')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Current Assistance' }))
    .toHaveCount(0)
  await expect(page.getByLabel('Active Assistance Request')).toBeVisible()
  await page.getByRole('button', { name: 'View request' }).click()
  await expect(page.getByRole('heading', { name: 'Current Assistance' }))
    .toBeVisible()
})

test('constrained workbenches keep request actions by the canvas and open supporting pages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await installRecordedTools(page)
  await page.goto('/')
  await createPointSetRequest(page)

  const strip = page.getByLabel('Active Assistance Request')
  const stage = page.locator('.drawing-stage')
  const documentPane = page.locator('.document-pane')
  const assistancePane = page.locator('.assistance-pane')
  await expect(strip).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Current Assistance' }))
    .toBeVisible()
  const [stageBounds, documentBounds, assistanceBounds] = await Promise.all([
    stage.boundingBox(),
    documentPane.boundingBox(),
    assistancePane.boundingBox(),
  ])
  if (!stageBounds || !documentBounds || !assistanceBounds) {
    throw new Error('The constrained workbench did not produce measurable panels.')
  }
  expect(stageBounds.height).toBeGreaterThanOrEqual(900 * 0.65)
  expect(stageBounds.height).toBeLessThanOrEqual(900 * 0.75)
  expect(assistanceBounds.y).toBeGreaterThanOrEqual(
    documentBounds.y + documentBounds.height - 1,
  )

  await strip.getByRole('button', { name: 'Open A1.2' }).click()
  const targetOverlay = page.getByLabel('Drawing page A1.2')
  await expect(targetOverlay).toBeVisible()
  await expect(page.getByText('Rendering PDF page')).toBeHidden()
  const targetBounds = await targetOverlay.boundingBox()
  if (!targetBounds) throw new Error('The target overlay has no browser bounds.')
  await page.mouse.click(
    targetBounds.x + targetBounds.width * 0.4,
    targetBounds.y + targetBounds.height * 0.6,
  )
  await expect(strip.getByText('Point Set, 1 marked')).toBeVisible()

  await page.getByRole('button', {
    name: 'Open supporting page 2: Hollow-core flush wood door product data',
  }).click()
  await expect(page.getByRole('heading', {
    name: 'Type C interior door product data and review cover',
  })).toBeVisible()
  await expect(page.getByRole('button', {
    name: /Current page: 2, Hollow-core flush wood door product data/,
  })).toBeVisible()
  await expect(page.getByLabel('Drawing page 2')).toHaveAttribute('role', 'group')
  await expect(strip.getByText('Point Set, 1 marked')).toBeVisible()

  await strip.getByRole('button', { name: 'Return to A1.2' }).click()
  await expect(page.getByLabel('Drawing page A1.2')).toBeVisible()
  await expect(page.getByLabel('Drawing page A1.2').locator('.point-mark'))
    .toHaveCount(1)
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

async function installRecordedTools(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, { execute: (input: unknown) => Promise<unknown> }>()
    Object.defineProperty(window, '__groundedTools', { value: tools })
    Object.defineProperty(document, 'modelContext', {
      value: {
        async registerTool(tool: {
          name: string
          execute: (input: unknown) => Promise<unknown>
        }) {
          tools.set(tool.name, tool)
        },
      },
    })
  })
}

async function createPointSetRequest(page: import('@playwright/test').Page) {
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
      supportingDocumentReferences: [{
        documentId: 'type-c-door-submittal',
        documentVersionId: 'type-c-door-submittal-v1',
        pageIds: ['door-submittal-page-1', 'door-submittal-page-2'],
      }],
    })
  })
}

async function expectMarkerAligned(
  canvas: Locator,
  mark: Locator,
  expected: { x: number; y: number },
) {
  const [canvasBounds, markBounds] = await Promise.all([
    canvas.boundingBox(),
    mark.boundingBox(),
  ])
  if (!canvasBounds || !markBounds) {
    throw new Error('The PDF canvas or Point Set marker has no browser bounds.')
  }
  expect(markBounds.x + markBounds.width / 2)
    .toBeCloseTo(canvasBounds.x + canvasBounds.width * expected.x, 0)
  expect(markBounds.y + markBounds.height / 2)
    .toBeCloseTo(canvasBounds.y + canvasBounds.height * expected.y, 0)
}

async function zoomPercentage(page: import('@playwright/test').Page) {
  const copy = await page.locator('.zoom-controls [aria-live="polite"]').textContent()
  return Number(copy?.replace('%', ''))
}

async function dragRepeatedly(
  page: import('@playwright/test').Page,
  viewer: Locator,
  direction: 'toward-start' | 'toward-end',
) {
  const bounds = await viewer.boundingBox()
  if (!bounds) throw new Error('The map canvas has no browser bounds.')
  const inset = 8
  const start = direction === 'toward-start'
    ? { x: bounds.x + inset, y: bounds.y + inset }
    : {
        x: bounds.x + bounds.width * 0.72,
        y: bounds.y + bounds.height * 0.72,
      }
  const end = direction === 'toward-start'
    ? {
        x: bounds.x + bounds.width * 0.72,
        y: bounds.y + bounds.height * 0.72,
      }
    : { x: bounds.x + inset, y: bounds.y + inset }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 2 })
    await page.mouse.up()
  }
}

declare global {
  interface Window {
    __groundedTools?: Map<string, unknown>
  }
}

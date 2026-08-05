import { test, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { main } from './server'

const PORT = 3001
const BASE_URL = `http://localhost:${PORT}`

test.describe('react-base browser', () => {
  let server: Awaited<ReturnType<typeof main>>

  test.beforeAll(async () => {
    server = await main(true)
    await server.listen({ port: PORT })
  })

  test.afterAll(async () => {
    await server.close()
  })

  test('home page loads with correct SSR content and no hydration errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(BASE_URL)
    await expect(page.locator('p')).toContainText('React base e2e')
    await expect(page.locator('nav a')).toHaveCount(4)
    expect(errors).toEqual([])
  })

  test('client-side navigation via link click', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.click('a[href="/users/settings"]')
    await expect(page.locator('p')).toHaveText('Settings page')
  })

  test('initial URL has search and hash params', async ({ page }) => {
    await page.goto(`${BASE_URL}?q=hello#section`)
    expect(page.url()).toContain('q=hello')
    expect(page.url()).toContain('section')
  })

  test('search params preserved during client navigation', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.click('a[href="/users/settings?tab=profile#prefs"]')
    await expect(page.locator('p')).toHaveText('Settings page')
    expect(page.url()).toContain('tab=profile')
  })

  test('target=_blank links bypass SPA interceptor', async ({ page, context }) => {
    await page.goto(BASE_URL)

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('a[target="_blank"]'),
    ])

    await newPage.waitForLoadState()
    expect(newPage.url()).toContain('example.com')
    await newPage.close()
  })

  test('updates rendered page without a full page navigation', async ({ page }) => {
    const pagePath = new URL('./client/pages/index.tsx', import.meta.url)
    const originalMarkup = '<p>React base e2e</p>'
    const updatedMarkup = '<p>React base e2e Updated</p>'
    const originalSource = await readFile(pagePath, 'utf8')
    let mainFrameNavigations = 0

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) mainFrameNavigations++
    })

    try {
      await page.goto(BASE_URL)
      await expect(page.locator('p')).toContainText('React base e2e')
      mainFrameNavigations = 0

      expect(originalSource).toContain(originalMarkup)
      await writeFile(pagePath, originalSource.replace(originalMarkup, updatedMarkup))

      await expect(page.locator('p')).toContainText('React base e2e Updated', {
        timeout: 10000,
      })
      expect(mainFrameNavigations).toBe(0)
    } finally {
      await writeFile(pagePath, originalSource)
    }
  })

  test('edits to a non-current page apply on next SPA navigation', async ({ page }) => {
    const pagePath = new URL('./client/pages/index.tsx', import.meta.url)
    const originalMarkup = '<p>React base e2e</p>'
    const updatedMarkup = '<p>React base e2e Updated</p>'
    const originalSource = await readFile(pagePath, 'utf8')
    // framenavigated fires for same-document (pushState/popstate) hops too,
    // so full-page reloads are detected via document requests instead.
    let documentLoads = 0

    page.on('request', (req) => {
      if (req.resourceType() === 'document') documentLoads++
    })

    try {
      await page.goto(BASE_URL)
      await expect(page.locator('p')).toContainText('React base e2e')
      // Let hydration register the SPA click handler before the hop.
      await page.waitForTimeout(1000)
      documentLoads = 0
      await page.click('a[href="/users/settings"]')
      await expect(page.locator('p')).toHaveText('Settings page')
      expect(documentLoads).toBe(0)

      expect(originalSource).toContain(originalMarkup)
      await writeFile(pagePath, originalSource.replace(originalMarkup, updatedMarkup))

      await expect(page.locator('p')).toHaveText('Settings page')
      expect(documentLoads).toBe(0)

      await page.goBack()
      await expect(page.locator('p')).toContainText('React base e2e Updated')
      expect(documentLoads).toBe(0)
    } finally {
      await writeFile(pagePath, originalSource)
    }
  })

  test('updates a param route page in place without navigation', async ({ page }) => {
    const pagePath = new URL('./client/pages/users/[id].tsx', import.meta.url)
    const originalMarkup = 'User: ${params.id}'
    const updatedMarkup = 'User: ${params.id} Updated'
    const originalSource = await readFile(pagePath, 'utf8')
    let documentLoads = 0

    page.on('request', (req) => {
      if (req.resourceType() === 'document') documentLoads++
    })

    try {
      await page.goto(`${BASE_URL}/users/42`)
      await expect(page.locator('p')).toHaveText('User: 42')
      documentLoads = 0

      expect(originalSource).toContain(originalMarkup)
      await writeFile(pagePath, originalSource.replace(originalMarkup, updatedMarkup))

      await expect(page.locator('p')).toHaveText('User: 42 Updated', { timeout: 10000 })
      expect(documentLoads).toBe(0)
    } finally {
      await writeFile(pagePath, originalSource)
    }
  })

  test('Link forwards className and data attributes in SSR HTML and after hydration', async ({
    page,
    request,
  }) => {
    // SSR HTML: the server-rendered pass must already carry the forwarded props.
    const ssrHtml = await (await request.get(BASE_URL)).text()
    expect(ssrHtml).toContain('href="/users/settings"')
    expect(ssrHtml).toMatch(/<a[^>]*class="e2e-link"[^>]*data-e2e-link="yes"[^>]*>/)

    // Post-hydration DOM: same props, no hydration errors, navigation intact.
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(BASE_URL)
    const link = page.locator('a[data-e2e-link="yes"]')
    await expect(link).toHaveAttribute('class', 'e2e-link')
    await expect(link).toHaveAttribute('href', '/users/settings')
    await expect(link).toHaveText('Settings via Link')
    expect(errors).toEqual([])

    // The internal click handler still navigates with the props spread in place.
    await link.click()
    await expect(page.locator('p')).toHaveText('Settings page')
  })
})

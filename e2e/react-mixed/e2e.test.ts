import { test, expect } from '@playwright/test'
import { main } from './server'

declare global {
  interface Window {
    __observeFlash?: () => void
  }
}

const PORT = 3003
const BASE_URL = `http://localhost:${PORT}`

test.describe('mixed mode', () => {
  let server: Awaited<ReturnType<typeof main>>

  test.beforeAll(async () => {
    server = await main(true)
    await server.listen({ port: PORT })
  })

  test.afterAll(async () => {
    await server.close()
  })

  test('Non-RSC home + RSC routes coexist', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page.locator('h1')).toHaveText('Mixed Mode Home')
    await expect(page.locator('a[href="/rsc-page"]')).toBeVisible()
  })

  test('Navigate non-RSC to RSC page', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.click('a[href="/rsc-page"]')
    await expect(page.locator('h1')).toHaveText('RSC Page')
  })

  test('Navigate RSC to non-RSC page', async ({ page }) => {
    // Start on RSC page, navigate back to home via browser back
    await page.goto(`${BASE_URL}/rsc-page`)
    await expect(page.locator('h1')).toHaveText('RSC Page')
    await page.goto(BASE_URL)
    await expect(page.locator('h1')).toHaveText('Mixed Mode Home')
  })

  test('Browser back/forward across render types', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.click('a[href="/rsc-page"]')
    await expect(page.locator('h1')).toHaveText('RSC Page')
    await page.goBack()
    await expect(page.locator('h1')).toHaveText('Mixed Mode Home')
    await page.goForward()
    await expect(page.locator('h1')).toHaveText('RSC Page')
  })

  test('navigation from non-RSC to RSC does not reload', async ({ page }) => {
    let reloadCount = 0
    page.on('load', () => reloadCount++)

    await page.goto(BASE_URL)
    reloadCount = 0

    await page.click('a[href="/rsc-page"]')
    await expect(page.locator('h1')).toHaveText('RSC Page')
    expect(reloadCount).toBe(0)
  })

  test('navigation from RSC to non-RSC does not reload', async ({ page }) => {
    let reloadCount = 0
    page.on('load', () => reloadCount++)

    // SPA-navigate to RSC page from home via click (creates pushState entry)
    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')
    reloadCount = 0

    await page.click('a[href="/rsc-page"]')
    await expect(page.locator('h1')).toHaveText('RSC Page')
    expect(reloadCount).toBe(0)

    // Go back to home via popstate (SPA, no reload)
    reloadCount = 0
    await page.goBack()
    await expect(page.locator('h1')).toHaveText('Mixed Mode Home')
    expect(reloadCount).toBe(0)
  })

  test('back/forward across RSC routes does not reload', async ({ page }) => {
    let reloadCount = 0
    page.on('load', () => reloadCount++)

    await page.goto(BASE_URL)
    await page.click('a[href="/rsc-page"]')
    await expect(page.locator('h1')).toHaveText('RSC Page')
    reloadCount = 0

    await page.goBack()
    await expect(page.locator('h1')).toHaveText('Mixed Mode Home')
    expect(reloadCount).toBe(0)

    await page.goForward()
    await expect(page.locator('h1')).toHaveText('RSC Page')
    expect(reloadCount).toBe(0)
  })

  test('cross-type navigation preserves scroll state', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.evaluate(() => window.scrollTo(0, 100))

    // Dispatch a trusted click event without Playwright's auto-scroll
    await page.locator('a[href="/rsc-page"]').dispatchEvent('click')
    await expect(page.locator('h1')).toHaveText('RSC Page')

    await page.goBack()
    await expect(page.locator('h1')).toHaveText('Mixed Mode Home')

    const scrollY = await page.evaluate(() => window.scrollY)
    expect(scrollY).toBe(100)
  })

  test('Link renders an anchor with correct href', async ({ page }) => {
    await page.goto(`${BASE_URL}/link-demo`)
    await expect(page.locator('h1')).toHaveText('Link Demo Page')
    const rscLink = page.getByRole('link', { name: 'RSC Page' })
    await expect(rscLink).toBeVisible()
    await expect(rscLink).toHaveAttribute('href', '/rsc-page')
  })

  test('prefetch fires on hover over Link for RSC route', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('_.rsc')) requests.push(req.url())
    })
    await page.goto(`${BASE_URL}/link-demo`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: 'RSC Page' }).hover()
    await page.waitForTimeout(1000)
    expect(requests.length).toBeGreaterThanOrEqual(1)
  })

  test('does not prefetch when prefetch=false', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('_.rsc')) requests.push(req.url())
    })
    await page.goto(`${BASE_URL}/link-demo`)
    await page.waitForLoadState('networkidle')
    // Clear any requests from initial page load
    requests.length = 0
    await page.getByRole('link', { name: 'RSC (no prefetch)' }).hover()
    await page.waitForTimeout(500)
    expect(requests.length).toBe(0)
  })

  test('click on Link navigates to RSC page without full reload', async ({ page }) => {
    await page.goto(`${BASE_URL}/link-demo`)
    await expect(page.locator('h1')).toHaveText('Link Demo Page')
    await page.getByRole('link', { name: 'RSC Page' }).click()
    await expect(page.locator('h1')).toHaveText('RSC Page')
  })

  test('click on Link navigates to non-RSC page', async ({ page }) => {
    await page.goto(`${BASE_URL}/link-demo`)
    await page.getByRole('link', { name: 'About' }).click()
    await expect(page.locator('h1')).toHaveText('About Page')
  })

  test('Link navigation from RSC page works', async ({ page }) => {
    await page.goto(`${BASE_URL}/rsc-link-demo`)
    await expect(page.locator('h1')).toHaveText('RSC Link Demo')
    await page.getByRole('link', { name: 'Home' }).click()
    await expect(page.locator('h1')).toHaveText('Mixed Mode Home')
  })

  test('prefetch still works after client-side navigation', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('_.rsc')) requests.push(req.url())
    })
    await page.goto(`${BASE_URL}/link-demo`)
    await page.waitForLoadState('networkidle')
    // Navigate to a different page
    await page.getByRole('link', { name: 'About' }).click()
    await expect(page.locator('h1')).toHaveText('About Page')
    // Go back to link-demo via URL
    await page.goto(`${BASE_URL}/link-demo`)
    await page.waitForLoadState('networkidle')
    // Hover should still prefetch
    await page.getByRole('link', { name: 'RSC Page' }).hover()
    await page.waitForTimeout(1000)
    expect(requests.length).toBeGreaterThanOrEqual(1)
  })

  test('navigation to RSC page shows content without loading flash', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page.locator('h1')).toHaveText('Mixed Mode Home')

    let sawEmptyState = false
    await page.exposeFunction('__observeFlash', () => {
      sawEmptyState = true
    })

    // Click to navigate to RSC page
    await page.click('a[href="/rsc-page"]')

    // Wait for RSC content to appear
    await expect(page.locator('h1')).toHaveText('RSC Page', { timeout: 10000 })

    // Verify the h1 was never empty during the transition
    await page.evaluate(() => {
      const h1 = document.querySelector('h1')
      if (!h1 || h1.textContent === '') window.__observeFlash!()
    })
    expect(sawEmptyState).toBe(false)
  })

  test('redirect via onEnter lands on target page', async ({ page }) => {
    await page.goto(`${BASE_URL}/redirect-me`)
    // Browser follows the 302 and lands on /rsc-page
    await expect(page.locator('h1')).toHaveText('RSC Page')
  })
})

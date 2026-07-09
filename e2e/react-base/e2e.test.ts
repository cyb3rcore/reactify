import { test, expect } from '@playwright/test'
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
})

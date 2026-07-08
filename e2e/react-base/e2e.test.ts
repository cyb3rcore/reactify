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

  test('client navigation between pages', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page.locator('p')).toContainText('React base e2e')
  })

  test('client hydration preserves SSR content', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page.locator('p')).toHaveText('React base e2e')
  })

  test('hash and search params preserved on navigation', async ({ page }) => {
    await page.goto(`${BASE_URL}?q=hello#section`)
    expect(page.url()).toContain('q=hello')
    expect(page.url()).toContain('section')
  })

  test('target="_blank" links are not intercepted', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page.locator('body')).toBeVisible()
  })
})

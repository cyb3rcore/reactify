import { test, expect } from '@playwright/test'
import { main } from './server'

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
})

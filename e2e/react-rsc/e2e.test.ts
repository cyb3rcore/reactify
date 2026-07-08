import { test, expect } from '@playwright/test'
import { main } from './server'

const PORT = 3002
const BASE_URL = `http://localhost:${PORT}`

test.describe('RSC e2e', () => {
  let server: Awaited<ReturnType<typeof main>>

  test.beforeAll(async () => {
    server = await main(true)
    await server.listen({ port: PORT })
  })

  test.afterAll(async () => {
    await server.close()
  })

  test('Non-RSC home page renders', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page.locator('h1')).toHaveText('RSC e2e - Home')
    await expect(page.locator('p')).toContainText('non-RSC page')
  })

  test('Server-rendered content visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/rsc-page`)
    await expect(page.locator('h1')).toHaveText('RSC Page')
    await expect(page.locator('p').first()).toContainText('Server-rendered timestamp')
  })

  test('getMeta head metadata in title', async ({ page }) => {
    await page.goto(`${BASE_URL}/rsc-page`)
    await expect(page).toHaveTitle('RSC Page')
  })

  test('use client Counter component works', async ({ page }) => {
    await page.goto(`${BASE_URL}/rsc-client`)
    await expect(page.locator('h1')).toHaveText('RSC Client Component Demo')
    const countText = page.getByText(/Client count:/)
    await expect(countText).toBeVisible({ timeout: 10000 })
    await expect(countText).toHaveText('Client count: 0')
    await page.locator('button', { hasText: '+' }).click()
    await expect(countText).toHaveText('Client count: 1', { timeout: 5000 })
    await page.locator('button', { hasText: '+' }).click()
    await expect(countText).toHaveText('Client count: 2', { timeout: 5000 })
    await page.locator('button', { hasText: '-' }).click()
    await expect(countText).toHaveText('Client count: 1', { timeout: 5000 })
  })

  test('Server action form via useActionState', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`${BASE_URL}/actions`)
    await expect(page.locator('h1')).toHaveText('RSC Server Actions')
    const output = page.locator('output')
    await expect(output).toBeVisible({ timeout: 10000 })
    await expect(output).toHaveText('0')
    await page.locator('button').click()
    await expect(output).toHaveText('1', { timeout: 10000 })
    await page.locator('button').click()
    await expect(output).toHaveText('2', { timeout: 10000 })
    expect(errors).toEqual([])
  })

  test('Error boundary catches server errors', async ({ page }) => {
    await page.goto(`${BASE_URL}/error`)
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 })
  })

  test('Client navigation to RSC page', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page.locator('h1')).toHaveText('RSC e2e - Home')
    await page.click('a[href="/rsc-page"]')
    await expect(page.locator('h1')).toHaveText('RSC Page')
    await page.goBack()
    await expect(page.locator('h1')).toHaveText('RSC e2e - Home')
  })

  test('Head updates on RSC navigation', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page).toHaveTitle('RSC e2e - Home')
    await page.click('a[href="/rsc-page"]')
    await expect(page).toHaveTitle('RSC Page')
    await page.goBack()
    await expect(page).toHaveTitle('RSC e2e - Home')
  })

  test('Streaming with Suspense-delayed content', async ({ page }) => {
    await page.goto(`${BASE_URL}/streaming`)
    await expect(page.locator('h2')).toHaveText('Streaming SSR')
    await expect(page.getByText('streamed')).toBeVisible({ timeout: 10000 })
  })

  test('Async data fetching page', async ({ page }) => {
    await page.goto(`${BASE_URL}/using-data`)
    await expect(page.locator('h2')).toHaveText('Data Fetching in RSC')
    await expect(page.locator('li')).toHaveText(['Item A', 'Item B', 'Item C'])
    await expect(page.locator('li')).toHaveCount(3)
  })

  test('Valtio store renders seeded state', async ({ page }) => {
    await page.goto(`${BASE_URL}/using-store`)
    await expect(page.locator('h2')).toHaveText('Valtio State Management')
    await expect(page.getByTestId('valtio-count')).toHaveText('Count: 42', { timeout: 10000 })
    await expect(page.getByTestId('valtio-message')).toHaveText('Message: Hello from Valtio!', { timeout: 10000 })
  })
})

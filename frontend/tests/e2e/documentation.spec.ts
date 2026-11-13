import { expect, test } from '@playwright/test'

test('documentation sous son préfixe et liens imbriqués', async ({ page, request }) => {
  const redirect = await request.get('/documentation', { maxRedirects: 0 })
  expect([301, 307, 308]).toContain(redirect.status())
  expect(redirect.headers().location).toMatch(/\/documentation\/$/)
  const response = await page.goto('/documentation/architecture/')
  expect(response?.status()).toBe(200)
  await expect(page.locator('article h1')).toBeVisible()
  const links = await page.locator('article a[href]').evaluateAll(anchors => anchors.map(a => (a as HTMLAnchorElement).href))
  const baseOrigin = new URL(page.url()).origin
  const nestedLink = links.find(href => href.startsWith(`${baseOrigin}/documentation/`) && !href.includes('/architecture/'))
  expect(nestedLink, 'La page architecture doit référencer un autre guide local').toBeTruthy()
  const linkedResponse = await page.goto(nestedLink!)
  expect(linkedResponse?.status()).toBe(200)
  await expect(page.locator('article h1')).toBeVisible()
  const broken = await request.get('/documentation/inexistant/')
  expect(broken.status()).toBe(404)
})

test('la recherche documentaire charge son index et trouve FastAPI', async ({ page }) => {
  await page.goto('/documentation/')
  const searchToggle = page.locator('label.md-header__button[for="__search"]')
  const input = page.getByRole('textbox', { name: 'Rechercher', exact: true })
  if (await searchToggle.isVisible()) await searchToggle.click()
  else await input.click()
  await expect(page.locator('.md-search-result__meta')).toHaveText('Taper pour démarrer la recherche')
  await expect(input).toBeFocused()
  // Material updates its query on keyup, so exercise actual keyboard input.
  await input.pressSequentially('FastAPI')
  await expect(input).toHaveValue('FastAPI')
  const result = page.locator('[data-md-component="search-result"] a').first()
  await expect(result).toBeVisible({ timeout: 15_000 })
  await expect(result).toHaveAttribute('href', /\//)
  await result.click()
  await expect(page.locator('article h1')).toBeVisible()
  expect(new URL(page.url()).pathname).toMatch(/^\/documentation\//)
})

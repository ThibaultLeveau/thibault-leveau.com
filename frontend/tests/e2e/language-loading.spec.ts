import { expect, test, type Page } from '@playwright/test'

test.skip(
  !!process.env.PLAYWRIGHT_BASE_URL,
  'Les interruptions de ressources et les réponses simulées restent sur le serveur isolé.',
)

async function documentLanguage(page: Page, language: 'fr' | 'en') {
  await page.route(/\/projets$/, async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        /<html[^>]*>/,
        `<html lang="${language}" data-interface-language="${language}">`,
      ),
    })
  })
}

for (const language of ['fr', 'en'] as const) {
  test(`seul le catalogue ${language} est chargé avant le premier rendu`, async ({ page }) => {
    await documentLanguage(page, language)
    const requested: string[] = []
    page.on('request', (request) => {
      const match = new URL(request.url()).pathname.match(/\/assets\/(fr|en)-[^/]+\.js$/)
      if (match) requested.push(match[1])
    })
    let release!: () => void
    const downloaded = new Promise<void>((resolve) => { release = resolve })
    const asset = new RegExp(`/assets/${language}-[^/]+\\.js$`)
    await page.route(asset, async (route) => {
      await downloaded
      await route.continue()
    })
    const request = page.waitForRequest(asset)
    await page.goto('/projets', { waitUntil: 'domcontentloaded' })
    await request
    try {
      await expect(page.locator('#root')).toBeEmpty()
    } finally {
      release()
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      language === 'fr' ? 'Projets.' : 'Projects.',
    )
    expect(requested).toEqual([language])
  })

  test(`échec du catalogue ${language}, écran accessible et reprise`, async ({ page }, info) => {
    await documentLanguage(page, language)
    await page.route(new RegExp(`/assets/${language}-[^/]+\\.js$`), (route) => route.abort(), {
      times: 1,
    })
    await page.goto('/projets')
    const recovery = page.getByRole('main')
    await expect(recovery).toHaveAttribute('lang', language)
    await expect(page.getByRole('alert')).toContainText(
      language === 'fr' ? 'Vérifiez votre connexion' : 'Check your connection',
    )
    const retry = page.getByRole('button', { name: language === 'fr' ? 'Réessayer' : 'Try again' })
    await page.keyboard.press('Tab')
    await expect(retry).toBeFocused()
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: info.project.name === 'desktop' ? 1440 : 320, height: 700 })
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await retry.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none')
      const contrasts = await recovery.evaluate((node) => {
        const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3)
          .map(Number).map((value) => value / 255)
          .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0)
        const ratio = (foreground: string, background: string) => {
          const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
          return (values[1] + 0.05) / (values[0] + 0.05)
        }
        const button = getComputedStyle(node.querySelector('button')!)
        return [
          ratio(getComputedStyle(node).color, getComputedStyle(document.documentElement).backgroundColor),
          ratio(button.color, button.backgroundColor),
        ]
      })
      expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5)
      await page.screenshot({ path: info.outputPath(`recovery-${language}-${theme}.png`) })
    }
    await retry.press('Enter')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      language === 'fr' ? 'Projets.' : 'Projects.',
    )
  })
}

test('un catalogue indisponible ne sauvegarde pas le choix de langue administrative', async ({ page }) => {
  let saves = 0
  let saved = { public_language: 'fr', admin_language: 'fr', version: 1 }
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/languages')) {
      if (request.method() === 'PUT') {
        saves += 1
        saved = { ...request.postDataJSON(), version: saved.version + 1 }
      }
      return route.fulfill({ json: saved })
    }
    if (path.endsWith('/session'))
      return route.fulfill({ json: { username: 'test-admin', csrf_token: 'test-csrf' } })
    if (path.endsWith('/provider'))
      return route.fulfill({ json: {
        provider: 'openai', model: 'test-model', has_api_key: false,
        providers: [{ id: 'openai', name: 'OpenAI', default_model: 'test-model', docs_url: '' }],
      } })
    if (path.endsWith('/catalog')) return route.fulfill({ json: {} })
    return route.fulfill({ status: 404, json: { detail: 'Not found' } })
  })
  await page.route(/\/assets\/en-[^/]+\.js$/, (route) => route.abort())
  await page.goto('/admin')
  await expect(page.locator('.admin-shell')).toBeVisible()
  const settings = page.getByRole('button', { name: 'Réglages du site', exact: true })
  if (!(await settings.isVisible()))
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await settings.click()
  await page.getByRole('button', { name: 'Langue', exact: true }).click()
  await page.locator('#language-admin').selectOption('en')
  await page.getByRole('button', { name: 'Enregistrer les langues' }).click()
  await expect(page.getByRole('alert')).toContainText('Vérifiez votre connexion')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Langue.')
  await expect(page.locator('#language-admin')).toHaveValue('en')
  expect(saves).toBe(0)
  await page.unroute(/\/assets\/en-[^/]+\.js$/)
  await page.getByRole('button', { name: 'Enregistrer les langues' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('status')).toHaveText('Languages saved.')
  expect(saves).toBe(1)
})

import { expect, test, type Page } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:8767', actionTimeout: 10_000 })
test.skip(
  !!process.env.PLAYWRIGHT_BASE_URL,
  'Les réglages sont modifiés uniquement sur la base temporaire.',
)

async function settings(page: Page, view: string, english = true) {
  await expect(page.locator('.admin-shell')).toBeVisible()
  const target = page.getByRole('button', { name: view, exact: true })
  if (!(await target.isVisible())) {
    const button = page.getByRole('button', {
      name: english ? 'Site settings' : 'Réglages du site',
      exact: true,
    })
    if (!(await button.isVisible()))
      await page.getByRole('button', { name: english ? 'Open menu' : 'Ouvrir le menu' }).click()
    await button.click()
  }
  await target.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${view}.`)
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  )
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('.admin-main, .settings-card')).every(
        (node) => node.scrollWidth <= node.clientWidth + 1,
      ),
    ),
  ).toBe(true)
}

async function checkContrast(page: Page) {
  const failures = await page.evaluate(() => {
    const luminance = (color: string) =>
      color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((total, v, index) => total + v * [0.2126, 0.7152, 0.0722][index], 0)
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '.language-settings label, .language-settings select, .language-settings .field-help, .language-settings .settings-note, .language-settings .primary-button',
      ),
    )
      .filter((el) => el.getClientRects().length && !(el as HTMLButtonElement).disabled)
      .flatMap((el) => {
        let background: HTMLElement | null = el
        while (
          background &&
          getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)'
        )
          background = background.parentElement
        const front = luminance(getComputedStyle(el).color)
        const back = luminance(
          background ? getComputedStyle(background).backgroundColor : 'rgb(255,255,255)',
        )
        const ratio = (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05)
        return ratio < 4.5 ? [{ tag: el.tagName, ratio }] : []
      })
  })
  expect(failures).toEqual([])
}

test('langues indépendantes, persistance, parcours anglais et accessibilité', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000)
  test.skip(
    info.project.name !== 'desktop',
    'Ce parcours vérifie lui-même les largeurs bureau et mobile sur un serveur dédié.',
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const publicContext = await browser.newContext()
  const publicPage = await publicContext.newPage()
  publicPage.on('pageerror', (error) => errors.push(error.message))
  const publicURL = (path: string) => `http://127.0.0.1:8767${path}`
  await page.goto('/admin')
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('playwright-admin')
  await page.getByLabel('Mot de passe', { exact: true }).fill('playwright-only-password')
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await settings(page, 'Langue', false)
  await expect(page.locator('#language-public')).toHaveValue('fr')
  await expect(page.locator('#language-admin')).toHaveValue('fr')
  await page.locator('#language-public').selectOption('en')
  await page.getByRole('button', { name: 'Fournisseur IA', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Rester', exact: true }).click()
  await expect(page.locator('#language-public')).toHaveValue('en')
  await page.locator('#language-public').selectOption('fr')
  await page.locator('#language-admin').selectOption('en')
  await page.getByRole('button', { name: 'Enregistrer les langues' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('status')).toHaveText('Languages saved.')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Language.')
  await publicPage.goto(publicURL('/projets'))
  await expect(publicPage.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText('Projets.')

  // All settings and the live schema follow the admin language; writing stays independent.
  await settings(page, 'Agents and writing')
  await expect(page.getByLabel('Writing language', { exact: true })).toHaveValue('fr')
  await settings(page, 'Admin account')
  await expect(page.getByLabel('Current password', { exact: true })).toBeVisible()
  await settings(page, 'AI provider')
  await page.getByLabel(/^API key/).fill('isolated-language-test-key')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('Your settings have been saved.')
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await page
    .getByLabel('Your message', { exact: true })
    .fill('Un nouveau projet pour notre atelier')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Français', exact: true }).click()
  await expect(page.locator('.assistant-proposal')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.proposal-missing').first()).toContainText('Complete')
  await expect(page.locator('.assistant-proposal')).toContainText('Atelier Python')

  await settings(page, 'Language')
  await page.locator('#language-admin').selectOption('fr')
  await page.getByRole('button', { name: 'Save languages' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.locator('.proposal-missing').first()).toContainText('Renseignez')
  await expect(page.locator('.assistant-proposal')).not.toContainText('Complete “')
  await expect(page.locator('.assistant-proposal')).toContainText('Atelier Python')
  await settings(page, 'Langue', false)
  await page.locator('#language-admin').selectOption('en')
  await page.getByRole('button', { name: 'Enregistrer les langues' }).click()
  await expect(page.getByRole('status')).toHaveText('Languages saved.')
  await page.locator('#language-public').selectOption('en')
  // Simulate another tab saving after this form loaded, without replacing its draft.
  const session = await (await page.request.get('/api/admin/session')).json()
  const languages = await (await page.request.get('/api/admin/languages')).json()
  const concurrent = await page.request.put('/api/admin/languages', {
    data: languages,
    headers: { Origin: 'http://127.0.0.1:8767', 'X-CSRF-Token': session.csrf_token },
  })
  expect(concurrent.status()).toBe(200)
  await page.getByRole('button', { name: 'Save languages' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'These settings have changed. Reload them before trying again.',
  )
  await expect(page.locator('#language-public')).toHaveValue('en')
  await page.getByRole('button', { name: 'Reload saved languages' }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page.locator('#language-public')).toHaveValue('fr')
  await page.locator('#language-public').selectOption('en')
  await page.getByRole('button', { name: 'Save languages' }).click()
  await expect(page.getByRole('status')).toHaveText('Languages saved.')
  await publicPage.goto(publicURL('/admin'))
  await expect(publicPage.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(publicPage.locator('html')).toHaveAttribute('lang', 'en')
  await publicPage.getByLabel('Username', { exact: true }).fill('wrong-account')
  await publicPage.getByLabel('Password', { exact: true }).fill('wrong-password')
  await publicPage.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(publicPage.getByRole('alert')).toHaveText('Incorrect credentials.')
  await page.getByRole('button', { name: 'Close settings menu' }).click()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      )
      await page.locator('#language-public').focus()
      await page.keyboard.press('Tab')
      await expect(page.locator('#language-admin')).toBeFocused()
      expect(
        await page
          .locator('#language-admin')
          .evaluate((el) => getComputedStyle(el).outlineStyle),
      ).not.toBe('none')
      await noOverflow(page)
      await checkContrast(page)
      await page.screenshot({
        path: info.outputPath(`language-en-${width}-${theme}.png`),
        fullPage: true,
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await page.getByRole('button', { name: '+ New entry', exact: true }).click()
  await expect(page.getByLabel('Title / name')).toBeVisible()
  await expect(page.getByText('NEW ENTRY', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 320, height: 900 })
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    )
    for (const section of await page
      .getByRole('navigation', { name: 'Entry sections' })
      .getByRole('button')
      .all()) {
      await section.click()
      await noOverflow(page)
    }
    await page.screenshot({
      path: info.outputPath(`editor-en-320-${theme}.png`),
      fullPage: true,
    })
  }
  await page.getByRole('button', { name: '← Projects', exact: true }).click()
  for (const view of ['Language', 'AI provider', 'Agents and writing', 'Admin account']) {
    await settings(page, view)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      )
      await noOverflow(page)
      await page.screenshot({
        path: info.outputPath(`settings-${view.replaceAll(' ', '-')}-en-320-${theme}.png`),
        fullPage: true,
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })

  const paths = [
    '/',
    '/projets',
    '/parcours',
    '/expertise',
    '/services',
    '/journal',
    '/a-propos',
    '/explorer',
  ]
  for (const width of [1440, 320]) {
    await publicPage.setViewportSize({ width, height: 900 })
    for (const theme of ['light', 'dark'] as const) {
      await publicPage.emulateMedia({ colorScheme: theme })
      for (const path of paths) {
        const response = await publicPage.goto(publicURL(path))
        expect(response?.headers()['content-language']).toBe('en')
        await expect(publicPage.locator('html')).toHaveAttribute('lang', 'en')
        await expect(publicPage.getByRole('heading', { level: 1 })).toBeVisible()
        await noOverflow(publicPage)
      }
      await publicPage.screenshot({
        path: info.outputPath(`public-en-${width}-${theme}.png`),
        fullPage: true,
      })
    }
  }
  const listing = await (
    await publicPage.request.get(publicURL('/api/public/entries?limit=48'))
  ).json()
  for (const item of listing.items as { title: string; url: string }[]) {
    await publicPage.goto(publicURL(item.url))
    await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(item.title)
    await noOverflow(publicPage)
  }
  await publicPage.goto(publicURL('/projets'))
  await expect(
    publicPage.getByRole('heading', { name: 'Atlas — Un espace pour les idées' }),
  ).toBeVisible()
  await publicPage
    .getByRole('searchbox', { name: 'Search', exact: true })
    .fill('NothingMatches')
  await publicPage.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(
    publicPage.getByRole('heading', { name: 'No results for this search.' }),
  ).toBeVisible()
  await publicPage.getByRole('button', { name: 'Menu', exact: true }).focus()
  await publicPage.keyboard.press('Enter')
  await expect(publicPage.getByRole('button', { name: 'Close menu' })).toBeFocused()
  await publicPage.keyboard.press('Escape')
  await expect(publicPage.getByRole('button', { name: 'Menu', exact: true })).toBeFocused()
  const missing = await publicPage.goto(publicURL('/projets/999999/absent'))
  expect(missing?.status()).toBe(404)
  await expect(
    publicPage.getByRole('heading', { name: 'This content is not available.' }),
  ).toBeVisible()

  // Keep public English while returning administration to French.
  await settings(page, 'Language')
  await page.locator('#language-admin').selectOption('fr')
  await page.getByRole('button', { name: 'Save languages' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await page.getByRole('button', { name: 'Fermer le menu des réglages' }).click()
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      )
      await noOverflow(page)
      await checkContrast(page)
      await page.screenshot({
        path: info.outputPath(`language-fr-${width}-${theme}.png`),
        fullPage: true,
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await publicPage.goto(publicURL('/projets'))
  await expect(publicPage.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  expect(errors).toEqual([])
  await publicContext.close()
})

import { expect, test, type Page } from '@playwright/test'

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'Écritures réservées à la base isolée.')
const origin = 'http://127.0.0.1:8768'

async function navigate(page: Page, label: string, group?: string) {
  const button = page.getByRole('button', { name: group ?? label, exact: true })
  if (!(await button.isVisible())) {
    const back = page.getByRole('button', { name: '← Menu principal', exact: true })
    if (await back.isVisible()) await back.click()
    else await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  }
  await button.click()
  if (group) await page.getByRole('button', { name: label, exact: true }).click()
}

test('versions, traduction relue, sélecteur public et conflits', async ({
  page,
  context,
}, info) => {
  test.skip(
    info.project.name === 'mobile',
    'Le parcours couvre lui-même les largeurs bureau et mobile sur une base isolée.',
  )
  test.setTimeout(180_000)
  page.setDefaultTimeout(20_000)
  await page.goto(`${origin}/admin`)
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('playwright-admin')
  await page.getByLabel('Mot de passe', { exact: true }).fill('playwright-only-password')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.locator('.admin-shell')).toBeVisible()
  const session = await (await page.request.get(`${origin}/api/admin/session`)).json()
  const headers = { Origin: origin, 'X-CSRF-Token': session.csrf_token }
  const provider = await (await page.request.get(`${origin}/api/admin/provider`)).json()
  const configured = await page.request.put(`${origin}/api/admin/provider`, {
    headers,
    data: {
      provider: provider.provider,
      model: provider.model,
      api_key: 'isolated-bilingual-test-key',
    },
  })
  expect(configured.ok()).toBe(true)
  const profile = (await (await page.request.get(`${origin}/api/public/home`)).json())
    .profile
  const title = `Texte bilingue ${info.project.name} ${Date.now()}`
  const created = await page.request.post(`${origin}/api/admin/content/posts`, {
    headers,
    data: {
      entry: {
        title,
        summary: 'Résumé français',
        body: 'Un contenu en français.',
        author_id: profile.id,
        visibility: 'public',
      },
    },
  })
  expect(created.status()).toBe(201)
  const record = await created.json()
  const ready = await page.request.post(
    `${origin}/api/admin/content/posts/${record.id}/transition`,
    {
      headers,
      data: { version: record.version, status: 'ready' },
    },
  )
  expect(ready.ok()).toBe(true)
  await navigate(page, 'Articles', 'Publications')
  await page.getByRole('button', { name: new RegExp(`^${title} `) }).click()
  const versions = page.getByRole('navigation', { name: 'Version du contenu' })
  await versions.getByRole('button', { name: /English/ }).click()
  await expect(
    page.getByText('Les textes de cette version sont indépendants.', { exact: false }),
  ).toBeVisible()
  await page
    .getByLabel('Résumé court', { exact: true })
    .fill('My reviewed English summary')
  await versions.getByRole('button', { name: /Français/ }).click()
  await expect(page.getByRole('dialog')).toContainText('non enregistrées')
  await page.getByRole('button', { name: 'Rester sur la fiche', exact: true }).click()
  await page
    .getByRole('button', { name: 'Enregistrer le brouillon', exact: true })
    .click()
  await expect(page.locator('.translation-offer')).toBeVisible()
  await versions.getByRole('button', { name: /Français/ }).click()
  await expect(page.getByLabel('Résumé court', { exact: true })).toHaveValue(
    'Résumé français',
  )
  await page.getByLabel('Résumé court', { exact: true }).fill('Résumé actualisé')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.getByRole('button', { name: 'Générer en English', exact: true }).click()
  const proposal = page.locator('.translation-offer .assistant-proposal')
  await expect(proposal).toBeVisible({ timeout: 40_000 })
  await expect(proposal).toContainText('My reviewed English summary')
  await expect(proposal).toContainText('English: Résumé actualisé')
  const before = await (
    await page.request.get(`${origin}/api/admin/content/posts/${record.id}?language=en`)
  ).json()
  expect(before.entry.summary).toBe('My reviewed English summary')
  await proposal.getByRole('button', { name: /Enregistrer.*fiche/ }).click()
  await versions.getByRole('button', { name: /English/ }).click()
  await expect(page.getByLabel('Résumé court', { exact: true })).toHaveValue(
    'English: Résumé actualisé',
  )
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390, 320]) {
      await page.evaluate(
        (v) => document.documentElement.setAttribute('data-theme', v),
        theme,
      )
      await page.setViewportSize({ width, height: 900 })
      const closeMenu = page.getByRole('button', {
        name: 'Fermer les menus',
        exact: true,
      })
      if (await closeMenu.isVisible()) {
        await page.getByRole('button', { name: 'Fermer le sous-menu', exact: true }).click()
        await expect(closeMenu).not.toBeVisible()
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true)
      await page.screenshot({ path: info.outputPath(`editor-${theme}-${width}.png`) })
    }
  }
  const publicPage = await context.newPage()
  await publicPage.goto(
    `${origin}/en/journal?collection=posts&q=${encodeURIComponent(title)}#contenu`,
  )
  await expect(publicPage.locator('html')).toHaveAttribute('lang', 'en')
  await expect(
    publicPage.getByRole('link', { name: `English: ${title}`, exact: true }),
  ).toBeVisible()
  const selector = publicPage.getByRole('combobox', { name: 'Site language' })
  await selector.focus()
  expect(await selector.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe(
    'none',
  )
  await selector.selectOption('fr')
  await expect(publicPage).toHaveURL(/\/fr\/journal\?collection=posts&q=.*#contenu$/)
  await expect(publicPage.getByRole('link', { name: title, exact: true })).toBeVisible()
  await publicPage.getByRole('combobox', { name: 'Langue du site' }).selectOption('en')
  await publicPage.getByRole('link', { name: `English: ${title}`, exact: true }).click()
  await expect(publicPage.getByRole('heading', { level: 1 })).toHaveText(
    `English: ${title}`,
  )
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390, 320]) {
      await publicPage.evaluate(
        (v) => document.documentElement.setAttribute('data-theme', v),
        theme,
      )
      await publicPage.setViewportSize({ width, height: 900 })
      expect(
        await publicPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await publicPage.screenshot({
        path: info.outputPath(`public-${theme}-${width}.png`),
      })
    }
  }
  await navigate(page, 'Chat')
  await page.reload()
  await page.getByLabel('Votre message').fill('Bonjour')
  const requests: string[] = []
  page.on('request', (req) => {
    if (req.url().endsWith('/assistant/turn')) requests.push(req.postDataJSON().language)
  })
  await page.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'Quelle version voulez-vous modifier',
  )
  expect(requests).toEqual([])
  const english = page
    .getByRole('dialog')
    .getByRole('button', { name: 'English', exact: true })
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (v) => document.documentElement.setAttribute('data-theme', v),
      theme,
    )
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await english.focus()
      await expect(english).toBeFocused()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true)
      await page.screenshot({
        path: info.outputPath(`language-choice-${theme}-${width}.png`),
      })
    }
  }
  await english.press('Enter')
  await expect.poll(() => requests).toEqual(['en'])
})

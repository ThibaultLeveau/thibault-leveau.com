import { expect, test } from '@playwright/test'

const external = process.env.PLAYWRIGHT_BASE_URL
test.use({ baseURL: external || 'http://127.0.0.1:8766' })
const pages = [
  ['/projets', 'Projets.'],
  ['/parcours', 'Parcours.'],
  ['/expertise', 'Expertise.'],
  ['/services', 'Services.'],
  ['/journal', 'Journal.'],
  ['/a-propos', ''],
  ['/explorer', 'Explorer.'],
]

test('rubriques publiques en clair et sombre, sans débordement', async ({
  page,
}, info) => {
  test.slow()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    for (const [url, title] of pages) {
      const response = await page.goto(url)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (title)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(
        page.getByText('Recherche en cours…', { exact: true }),
      ).toHaveCount(0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      for (const img of await page.locator('main img').all()) {
        await img.scrollIntoViewIfNeeded()
        await expect
          .poll(() =>
            img.evaluate((node: HTMLImageElement) => node.naturalWidth),
          )
          .toBeGreaterThan(0)
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({
        path: info.outputPath(`${url.slice(1)}-${theme}.png`),
        fullPage: true,
      })
    }
  }
  expect(errors).toEqual([])
})

test('quinze collections : recherche, liens directs et fiches réelles', async ({
  page,
  request,
}) => {
  test.slow()
  test.skip(!!external, 'Données de démonstration limitées au serveur isolé.')
  const listing = await request.get('/api/public/entries?limit=48')
  const data = (await listing.json()) as {
    items: { id: number; kind: string; title: string; url: string }[]
  }
  expect(new Set(data.items.map((item) => item.kind)).size).toBe(15)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const item of data.items) {
    await page.goto(`/explorer?collection=${item.kind}`)
    await page
      .getByRole('heading')
      .filter({ hasText: item.title })
      .getByRole('link')
      .click()
    await expect(page).toHaveURL(new RegExp(item.url))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.title)
    await expect(page.getByText('SECRET', { exact: false })).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.title)
  }
  expect(errors).toEqual([])
})

test('recherche partageable, filtre de relation, réinitialisation et retour', async ({
  page,
}) => {
  test.skip(!!external, 'Données de démonstration limitées au serveur isolé.')
  await page.goto('/projets')
  await page
    .getByRole('searchbox', { name: 'Rechercher', exact: true })
    .fill('Atlas')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page).toHaveURL(/q=Atlas/)
  await expect(
    page.getByRole('heading', { name: 'Atlas — Un espace pour les idées' }),
  ).toBeVisible()
  await page.getByLabel('Affiner').selectOption({ label: 'Python' })
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page).toHaveURL(/related=\d+/)
  await page
    .getByRole('heading', { name: 'Atlas — Un espace pour les idées' })
    .getByRole('link')
    .click()
  await expect(
    page.getByRole('heading', { name: 'Le point de départ' }),
  ).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('searchbox')).toHaveValue('Atlas')
  await page.getByRole('searchbox').fill('Introuvable')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Aucun résultat pour cette recherche.' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Effacer les filtres' }).first().click()
  await expect(
    page.getByRole('heading', { name: 'Atlas — Un espace pour les idées' }),
  ).toBeVisible()
})

test('lecture, sommaire, tarifs, FAQ et images optimisées', async ({
  page,
  request,
}) => {
  test.skip(!!external, 'Données de démonstration limitées au serveur isolé.')
  const data = (await (
    await request.get('/api/public/entries?limit=48')
  ).json()) as { items: { kind: string; url: string }[] }
  await page.goto(data.items.find((i) => i.kind === 'posts')!.url)
  const toc = page.getByRole('navigation', { name: 'Sommaire de la page' })
  await toc.getByRole('link', { name: 'Les choix', exact: true }).click()
  await expect(page).toHaveURL(/#texte-les-choix$/)
  await expect(page.locator('#texte-les-choix')).toBeVisible()
  await page.goto(data.items.find((i) => i.kind === 'services')!.url)
  await expect(page.getByText('1 200,50 €', { exact: true })).toBeVisible()
  await page
    .locator('summary')
    .filter({ hasText: 'Comment démarrer ?' })
    .click()
  await expect(
    page.getByText('Nous commençons par préciser le besoin.'),
  ).toBeVisible()
  await expect(
    page
      .getByRole('link', { name: 'Parlons de votre projet', exact: true })
      .first(),
  ).toHaveAttribute('href', 'mailto:demo@example.test')
  await page.goto(data.items.find((i) => i.kind === 'projects')!.url)
  const cover = page.locator('.detail-cover img')
  await expect(cover).toHaveAttribute('srcset', /width=480/)
  await expect(cover).toHaveJSProperty('complete', true)
  expect(
    await cover.evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0)
})

test('clavier, menu mobile, thèmes et 320 pixels', async ({ page }, info) => {
  test.slow()
  await page.setViewportSize({ width: 320, height: 740 })
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('link', { name: 'Aller au contenu' }),
    ).toBeFocused()
    const menu = page.getByRole('button', { name: 'Menu', exact: true })
    await menu.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Fermer le menu' }),
    ).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(
      page
        .getByRole('dialog')
        .getByRole('link', { name: 'Explorer les collections' }),
    ).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
    for (const url of [
      '/',
      '/projets',
      '/parcours',
      '/expertise',
      '/services',
      '/journal',
      '/explorer',
      '/a-propos',
    ]) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }
    await page.screenshot({
      path: info.outputPath(`320-${theme}.png`),
      fullPage: true,
    })
  }
})

test('erreur réseau et reprise, HTML hostile et vrai 404', async ({
  page,
  request,
}) => {
  test.skip(!!external, 'Simulation uniquement dans le serveur de test.')
  await page.route('**/api/public/entries?**', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  )
  await page.goto('/projets')
  await expect(
    page.getByRole('heading', { name: 'Une petite interruption.' }),
  ).toBeVisible()
  await page.unroute('**/api/public/entries?**')
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(
    page.getByRole('heading', { name: 'Atlas — Un espace pour les idées' }),
  ).toBeVisible()
  const response = await page.goto('/projets/999999/absent')
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'Ce contenu n’est pas disponible.' }),
  ).toBeVisible()
  const post = (
    await (await request.get('/api/public/entries?kind=posts')).json()
  ).items[0]
  await page.route('**/api/public/entries/posts/*', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    json.entry.body =
      'Texte sûr\n\n## **Les choix**\n\nUn premier choix.\n\n## Les choix\n\nUn second choix.\n\n<script>window.compromised=true</script>\n\n[Lien interdit](javascript:alert(1))\n\n![Image distante](https://example.test/tracker.png)'
    await route.fulfill({ json })
  })
  await page.goto(post.url)
  await expect(page.getByText('Texte sûr', { exact: true })).toBeVisible()
  await expect(
    page.locator('main script, main img[src^="https://example.test"]'),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Lien interdit' })).toHaveCount(0)
  const toc = page.getByRole('navigation', { name: 'Sommaire de la page' })
  await toc.getByRole('link', { name: 'Les choix', exact: true }).nth(1).click()
  await expect(page).toHaveURL(/#texte-les-choix-1$/)
  await expect(page.locator('#texte-les-choix-1')).toHaveText('Les choix')
  expect(await page.evaluate(() => 'compromised' in window)).toBe(false)
})

test('pagination, contraste, zoom et police de secours', async ({
  page,
}, info) => {
  test.slow()
  await page.route('**/fonts/*', (route) => route.abort())
  await page.setViewportSize({ width: 720, height: 500 })
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/explorer')
    await expect(
      page.getByRole('heading', { name: 'Explorer.', level: 1 }),
    ).toBeVisible()
    await expect(page.getByText('Recherche en cours…')).toHaveCount(0)
    if (!external) {
      await page.getByRole('link', { name: 'Suivant →' }).click()
      await expect(page).toHaveURL(/page=2/)
      await expect(page.getByText('Page 2 sur 2')).toBeVisible()
      await page.getByRole('link', { name: '← Précédent' }).click()
      await expect(page.getByText('Page 1 sur 2')).toBeVisible()
    }
    const contrast = await page.evaluate(() => {
      const rgb = (css: string) => css.match(/[\d.]+/g)!.map(Number)
      const light = (colors: number[]) =>
        colors
          .slice(0, 3)
          .map((c) => c / 255)
          .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
          .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          '.public-site .eyebrow, .card-meta, .card-summary, .public-filters label, .public-button, .intro-copy, .breadcrumbs, .footer-bottom',
        ),
      )
        .filter((el) => el.getClientRects().length)
        .map((el) => {
          let background: HTMLElement | null = el
          while (
            background &&
            getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)'
          )
            background = background.parentElement
          const front = light(rgb(getComputedStyle(el).color))
          const back = light(
            rgb(
              background
                ? getComputedStyle(background).backgroundColor
                : 'rgb(255,255,255)',
            ),
          )
          return {
            element: el.className,
            ratio:
              (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05),
          }
        })
    })
    expect(contrast.filter((c) => c.ratio < 4.5)).toEqual([])
    await info.attach(`contrastes-${theme}`, {
      body: JSON.stringify(contrast),
      contentType: 'application/json',
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`zoom-200-${theme}.png`),
      fullPage: true,
    })
  }
})

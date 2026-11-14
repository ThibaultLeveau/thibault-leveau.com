import { expect, test, type Page } from '@playwright/test'

test.skip(!!process.env.PLAYWRIGHT_BASE_URL, 'Écritures réservées au serveur isolé.')

async function nav(page: Page, label: string, group?: string) {
  await expect(page.locator('.admin-shell')).toBeVisible()
  const button = page.getByRole('button', { name: group ?? label, exact: true })
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await button.click()
  if (group) await page.getByRole('button', { name: label, exact: true }).click()
}
async function section(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Sections de la fiche' })
    .getByRole('button', { name: new RegExp(name) })
    .click()
}
async function login(page: Page) {
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('playwright-admin')
  await page.getByLabel('Mot de passe', { exact: true }).fill('playwright-only-password')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.locator('.admin-shell')).toBeVisible()
}

test('studio réel : projet complet, références, médias, saisie et conflits', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const suffix = `${info.project.name}-${Date.now()}`
  await page.goto('/admin')
  await login(page)
  const session = await (await page.request.get('/api/admin/session')).json()
  const headers = { Origin: 'http://127.0.0.1:8765', 'X-CSRF-Token': session.csrf_token }
  async function seed(kind: string, entry: Record<string, unknown>) {
    const response = await page.request.post(`/api/admin/content/${kind}`, {
      headers,
      data: { entry },
    })
    expect(response.status()).toBe(201)
    return response.json()
  }
  const skill = await seed('skills', { title: `Conception API ${suffix}` })
  const technology = await seed('technologies', { title: `FastAPI ${suffix}`, family: 'framework' })
  await seed('experiences', { title: `Mission ${suffix}`, nature: 'freelance' })
  // Content must stay available even when provider settings fail.
  await page.route('**/api/admin/provider', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Fournisseur indisponible' } }),
  )
  await nav(page, 'Médias')
  await page.getByLabel('Téléverser un fichier', { exact: true }).setInputFiles({
    name: `preuve-${suffix}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGNUinnEAANMDEgAhQMAMrwBZgxCHR4AAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByRole('heading', { name: `preuve-${suffix}.png` })).toBeVisible()
  await section(page, 'Relecture')
  await page.getByLabel('Visibilité sur le site').selectOption('public')
  await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('enregistrée')
  await nav(page, 'Projets')
  await page.getByRole('button', { name: '+ Nouvelle fiche', exact: true }).click()
  const title = `Projet complet ${suffix}`
  await page.getByLabel('Titre / nom').fill(title)
  await page.getByLabel('Nature', { exact: true }).selectOption('professional')
  await page.getByLabel('Phase', { exact: true }).selectOption('completed')
  await page.getByLabel('Résumé court', { exact: true }).fill('Un projet complet et vérifiable.')
  await page
    .getByLabel('Description complète', { exact: true })
    .fill('## Réalisation\nUn récit **documenté**. <script>window.unsafe=true</script>')
  await section(page, 'Contexte et dates')
  await page.getByLabel('Début (AAAA, AAAA-MM ou AAAA-MM-JJ)').fill('2024')
  await page.getByLabel('Fin (AAAA, AAAA-MM ou AAAA-MM-JJ)').fill('2024-06')
  await page.getByRole('button', { name: '+ Ajouter · Expériences associées', exact: true }).click()
  await page.getByLabel('Choisir · Expériences associées', { exact: true }).click()
  await page.getByLabel('Rechercher une fiche').fill(`Mission ${suffix}`)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(`Mission ${suffix}`) })
    .click()
  await page.getByLabel('Organisation porteuse').click()
  await page.getByLabel('Rechercher une fiche').fill(`Studio ${suffix}`)
  await page.getByRole('button', { name: 'Créer une organisation', exact: true }).click()
  await page.getByRole('button', { name: 'Créer et associer le brouillon' }).click()
  await page.getByRole('button', { name: '+ Ajouter · Lieux et zones', exact: true }).click()
  await page.getByLabel('Ville', { exact: true }).fill('Paris')
  await page.getByLabel('Modalité', { exact: true }).selectOption('hybrid')
  await section(page, 'Contribution et résultats')
  await page.getByLabel('Mon rôle', { exact: true }).fill('Conception et réalisation')
  await page.getByRole('button', { name: '+ Ajouter · Responsabilités', exact: true }).click()
  await page.locator('#content-responsibilities-0-text').fill('Concevoir une API')
  await page.getByRole('button', { name: '+ Ajouter · Résultats qualitatifs', exact: true }).click()
  await page.locator('#content-outcomes-0-text').fill('Livraison utilisée par l’équipe')
  await section(page, 'Compétences et stack')
  await page
    .getByRole('button', { name: '+ Ajouter · Compétences mobilisées', exact: true })
    .click()
  await page.getByLabel('Choisir · Compétences mobilisées', { exact: true }).click()
  await page.getByLabel('Rechercher une fiche').fill(skill.entry.title)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(skill.entry.title) })
    .click()
  await page.getByRole('button', { name: '+ Ajouter · Stack et outils', exact: true }).click()
  await page.getByLabel('Choisir · Stack et outils', { exact: true }).click()
  await page.getByLabel('Rechercher une fiche').fill(technology.entry.title)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(technology.entry.title) })
    .click()
  await page.getByLabel('Version utilisée', { exact: true }).fill('1.0')
  await section(page, 'Liens et médias')
  await page.getByRole('button', { name: '+ Ajouter · Liens nommés', exact: true }).click()
  await page.getByLabel('Libellé', { exact: true }).fill('Démo')
  await page.getByLabel('URL', { exact: true }).fill('https://example.test/demo')
  await page.getByRole('button', { name: '+ Ajouter · Médias associés', exact: true }).click()
  await page.getByLabel('Choisir · Médias associés', { exact: true }).click()
  await page.getByLabel('Rechercher une fiche').fill(`preuve-${suffix}`)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(`preuve-${suffix}`) })
    .click()
  await page.getByLabel('Alternative textuelle', { exact: true }).fill('Capture de démonstration')
  await section(page, 'Relecture')
  await page.getByLabel('Notes privées', { exact: true }).fill('SECRET À EXCLURE DE L’APERÇU')
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toContainText('SECRET À EXCLURE')
  await expect(page.getByRole('dialog').locator('script')).toHaveCount(0)
  await expect(page.getByRole('dialog').getByAltText('Capture de démonstration')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Enregistrer et marquer prêt' }).click()
  await expect(page.getByRole('status')).toContainText('Fiche prête')
  const listing = await (
    await page.request.get(`/api/admin/content/projects?q=${encodeURIComponent(title)}`)
  ).json()
  const project = await (
    await page.request.get(`/api/admin/content/projects/${listing.items[0].id}`)
  ).json()
  expect(project.entry.technologies[0].release).toBe('1.0')
  expect(project.entry.start_date).toBe('2024')
  expect(project.entry.experiences).toHaveLength(1)
  // Reload proves data comes back from SQLite.
  await page.reload()
  await nav(page, 'Projets')
  await page.getByLabel('Rechercher', { exact: true }).fill(title)
  await page.getByRole('button', { name: new RegExp(title) }).click()
  await expect(page.getByLabel('Titre / nom')).toHaveValue(title)
  await page.getByLabel('Résumé court', { exact: true }).fill('Saisie locale à préserver')
  await nav(page, 'Services')
  await expect(page.getByRole('dialog')).toContainText('modifications non enregistrées')
  await page.getByRole('button', { name: 'Rester sur la fiche' }).click()
  await expect(page.getByLabel('Résumé court', { exact: true })).toHaveValue(
    'Saisie locale à préserver',
  )
  const remote = await page.request.put(`/api/admin/content/projects/${project.id}`, {
    headers,
    data: { entry: { ...project.entry, summary: 'Autre onglet' }, version: project.version },
  })
  expect(remote.status()).toBe(200)
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('autre onglet')
  await expect(page.getByLabel('Résumé court', { exact: true })).toHaveValue(
    'Saisie locale à préserver',
  )
  // Theme and width checks cover the actual editor, not a mockup.
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const theme of ['light', 'dark']) {
      const current = await page.locator('html').getAttribute('data-theme')
      if (current !== theme)
        await page
          .getByRole('button', {
            name: theme === 'dark' ? 'Activer le thème sombre' : 'Activer le thème clair',
          })
          .click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(
        await page.locator('.admin-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true)
      await page.screenshot({ path: info.outputPath(`studio-${theme}-${width}.png`) })
      if (width === 1440) {
        const contrast = await page.evaluate(() => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!
          function color(css: string) {
            ctx.clearRect(0, 0, 1, 1)
            ctx.fillStyle = css
            ctx.fillRect(0, 0, 1, 1)
            return [...ctx.getImageData(0, 0, 1, 1).data]
          }
          function light(rgb: number[]) {
            return rgb
              .slice(0, 3)
              .map((c) => c / 255)
              .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
              .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
          }
          return Array.from(
            document.querySelectorAll<HTMLElement>(
              '.content-field > label, .muted, .content-status, .primary-button, .secondary-button, .sidebar-link, .editor-sections button, .field-help, .error-summary',
            ),
          )
            .filter((el) => el.getClientRects().length && !el.closest('[hidden]'))
            .map((el) => {
              let background: HTMLElement | null = el
              while (background && color(getComputedStyle(background).backgroundColor)[3] === 0)
                background = background.parentElement
              const foreground = light(color(getComputedStyle(el).color))
              const back = light(
                color(background ? getComputedStyle(background).backgroundColor : '#fff'),
              )
              return {
                element: el.className,
                ratio: (Math.max(foreground, back) + 0.05) / (Math.min(foreground, back) + 0.05),
              }
            })
        })
        expect(contrast.filter((c) => c.ratio < 4.5)).toEqual([])
        await info.attach(`contrastes-${theme}`, {
          body: JSON.stringify(contrast),
          contentType: 'application/json',
        })
      }
    }
  }
  for (const name of [
    'Contexte et dates',
    'Contribution et résultats',
    'Compétences et stack',
    'Liens et médias',
    'Relecture',
    'Essentiel',
  ]) {
    await section(page, name)
    expect(
      await page.locator('.admin-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true)
  }
  if (info.project.name === 'desktop') {
    await page.setViewportSize({ width: 720, height: 500 })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 720,
      height: 500,
      deviceScaleFactor: 2,
      mobile: false,
    })
    expect(await page.evaluate(() => innerWidth)).toBe(720)
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel('Titre / nom').focus()
    await expect(page.getByLabel('Titre / nom')).toBeFocused()
    expect(
      await page.getByLabel('Titre / nom').evaluate((el) => getComputedStyle(el).outlineStyle),
    ).not.toBe('none')
    await page.screenshot({ path: info.outputPath('studio-equivalent-zoom-200.png') })
    await cdp.send('Emulation.clearDeviceMetricsOverride')
  }
  // A 401 hides the content and restores this unsaved draft only after login.
  await page.route(`**/api/admin/content/projects/${project.id}`, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 401, json: { detail: 'Session expirée' } })
      : route.continue(),
  )
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Connexion', exact: true })).toBeVisible()
  await expect(page.getByText('Saisie locale à préserver', { exact: true })).toHaveCount(0)
  await page.unroute(`**/api/admin/content/projects/${project.id}`)
  await login(page)
  await expect(page.getByLabel('Résumé court', { exact: true })).toHaveValue(
    'Saisie locale à préserver',
  )
  await nav(page, 'Services')
  await page.getByRole('button', { name: 'Abandonner les modifications', exact: true }).click()
  await page.getByRole('button', { name: '+ Nouvelle fiche', exact: true }).click()
  await page.getByLabel('Titre / nom').fill(`Conseil ${suffix}`)
  await page.getByLabel('Proposition de valeur', { exact: true }).fill('Une architecture claire')
  await page.getByLabel('Public visé', { exact: true }).fill('Équipes produit')
  await section(page, 'Contexte et dates')
  await page.getByLabel('Mode de réalisation', { exact: true }).selectOption('remote')
  await section(page, 'Contribution et résultats')
  await page.getByLabel('Périmètre inclus', { exact: true }).fill('Audit et recommandations')
  await page.getByRole('button', { name: '+ Ajouter · Livrables', exact: true }).click()
  await page.locator('#content-deliverables-0-text').fill('Rapport et atelier')
  await page.getByRole('button', { name: '+ Ajouter · Formules tarifaires', exact: true }).click()
  await page.getByLabel('Nom de la formule', { exact: true }).fill('Audit')
  await page.getByLabel('Mode tarifaire', { exact: true }).selectOption('quote')
  await page.getByRole('button', { name: '+ Ajouter · Questions fréquentes', exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill('Quel délai ?')
  await page.getByLabel('Réponse', { exact: true }).fill('Deux semaines selon le périmètre.')
  await section(page, 'Liens et médias')
  await page.getByLabel('Libellé de contact', { exact: true }).fill('Discutons du besoin')
  await page
    .getByLabel('Contact (HTTPS ou mailto)', { exact: true })
    .fill('mailto:contact@example.test')
  await section(page, 'Relecture')
  await page.getByRole('button', { name: 'Enregistrer et marquer prêt' }).click()
  await expect(page.getByRole('status')).toContainText('Fiche prête')
  await nav(page, 'Articles', 'Publications')
  await page.getByRole('button', { name: '+ Nouvelle fiche', exact: true }).click()
  await page.getByLabel('Titre / nom').fill(`Article ${suffix}`)
  await page.getByLabel('Résumé court', { exact: true }).fill('Un article de test')
  await page
    .getByLabel('Description complète', { exact: true })
    .fill('# Introduction\n\n' + 'Un contenu long et structuré. '.repeat(400))
  await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('enregistrée')
  await page.getByText('Usages et gestion de la fiche').click()
  await page.getByRole('button', { name: 'Dupliquer', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Copie créée')
  await page.getByRole('button', { name: 'Archiver', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('archivée')
  await page.getByRole('button', { name: 'Restaurer en brouillon', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('restaurée')
  expect(errors).toEqual([])
})

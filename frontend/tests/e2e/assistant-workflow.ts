import { expect, type Page, type TestInfo } from '@playwright/test'

async function nav(page: Page, label: string, group?: string) {
  await expect(page.locator('.admin-shell')).toBeVisible()
  const button = page.getByRole('button', { name: group ?? label, exact: true })
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await button.click()
  if (group) await page.getByRole('button', { name: label, exact: true }).click()
}

async function send(page: Page, text: string) {
  await page.getByLabel('Votre message').fill(text)
  await page.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(page.getByRole('button', { name: 'Réponse en cours' })).toHaveCount(0, {
    timeout: 30_000,
  })
  await expect(page.locator('.composer-area [role="alert"]')).toHaveCount(0)
}

async function inspectLayout(page: Page, info: TestInfo, name: string) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      theme,
    )
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      if (width < 900) {
        const close = page.getByRole('button', { name: 'Fermer le menu des réglages' })
        if (await close.isVisible()) await close.click()
      }
      if (name === 'assistant-preferences')
        await page.getByRole('heading', { name: 'Agents et rédaction.' }).scrollIntoViewIfNeeded()
      else
        await page
          .locator('.assistant-proposal')
          .last()
          .locator('summary')
          .last()
          .scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      expect(
        await page.locator('.admin-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true)
      await page.screenshot({
        path: info.outputPath(`${name}-${theme}-${width}.png`),
        fullPage: true,
      })
    }
    const contrast = await page.evaluate(() => {
      const root = getComputedStyle(document.querySelector('.admin-shell')!)
      const luminance = (color: string) => {
        const probe = document.createElement('span')
        probe.style.color = color
        document.body.append(probe)
        const rgb = getComputedStyle(probe)
          .color.match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
        probe.remove()
        const linear = rgb.map((v) => {
          const n = v / 255
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
        })
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
      }
      const bg = luminance(root.getPropertyValue('--canvas'))
      return ['--ink', '--muted'].map((key) => {
        const fg = luminance(root.getPropertyValue(key))
        return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05)
      })
    })
    contrast.forEach((ratio) => expect(ratio).toBeGreaterThanOrEqual(4.5))
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

export async function assistantWorkflow(page: Page, info: TestInfo) {
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await nav(page, 'Agents et rédaction', 'Réglages du site')
  await page.getByLabel('Ton', { exact: true }).selectOption('warm')
  await nav(page, 'Chat')
  await expect(page.getByRole('dialog')).toContainText('Préférences non enregistrées')
  await page.getByRole('button', { name: 'Rester', exact: true }).click()
  await page.getByLabel('Personnaliser').selectOption('expertise')
  await page.getByLabel('Degré de technicité').selectOption('expert')
  await page.getByLabel('Consignes de rédaction').fill('Utiliser des phrases courtes.')
  await page.getByRole('button', { name: 'Enregistrer les préférences' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Vos préférences de rédaction sont enregistrées.',
  )
  await inspectLayout(page, info, 'assistant-preferences')
  await page.reload()
  await nav(page, 'Agents et rédaction', 'Réglages du site')
  await page.getByLabel('Personnaliser').selectOption('expertise')
  await expect(page.getByLabel('Degré de technicité')).toHaveValue('expert')
  await page.getByRole('button', { name: 'Revenir au style global' }).click()
  await expect(page.getByLabel('Ton', { exact: true })).toHaveValue('warm')
  await page.getByRole('button', { name: 'Enregistrer les préférences' }).click()
  await expect(page.getByRole('status')).toContainText('enregistrées')
  await nav(page, 'Chat')
  await send(
    page,
    'Créer un projet Atelier Python personnel : en 2025, j’ai animé et préparé les exercices de conception d’API. Crée aussi la compétence technique Conception d’API pour l’atelier.',
  )
  let proposal = page.getByRole('region', { name: 'Proposition de contenu' }).last()
  await expect(proposal.getByRole('heading')).toHaveText('2 fiches proposées')
  expect(
    (await (await page.request.get('/api/admin/content/projects?q=Atelier%20Python')).json()).total,
  ).toBe(0)
  await send(page, 'Remplace le résumé par Version affinée en conservant les deux fiches.')
  proposal = page.getByRole('region', { name: 'Proposition de contenu' }).last()
  const summary = proposal.locator('summary').filter({ hasText: 'Atelier Python' })
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(summary).toBeFocused()
  expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none')
  await expect(proposal).toContainText('Version affinée')
  await inspectLayout(page, info, 'assistant-proposal')
  await proposal.getByRole('button', { name: 'Enregistrer les fiches' }).click()
  await expect(proposal.getByRole('status')).toContainText('Les fiches ont été enregistrées.')
  await proposal.getByRole('button', { name: 'Ouvrir Atelier Python →' }).click()
  await expect(page.getByLabel('Résumé court', { exact: true })).toHaveValue('Version affinée')
  const projects = await (
    await page.request.get('/api/admin/content/projects?q=Atelier%20Python')
  ).json()
  const savedProject = await (
    await page.request.get(`/api/admin/content/projects/${projects.items[0].id}`)
  ).json()
  expect(savedProject.entry.skills).toHaveLength(1)

  await nav(page, 'Chat')
  await page.getByRole('button', { name: 'Nouvelle conversation' }).click()
  await send(page, 'Compléter mon profil')
  await expect(page.getByRole('log')).toContainText('Quel est votre métier')
  await send(
    page,
    'Je suis Alex, Ingénieur à Paris. Je conçois des API Python fiables. Je parle français couramment, pratique la photographie et serai disponible en décembre. Prépare une accroche et le titre SEO avec ces faits.',
  )
  proposal = page.getByRole('region', { name: 'Proposition de contenu' }).last()
  await expect(proposal).toContainText('Titre professionnel')
  await proposal.getByRole('button', { name: 'Enregistrer la fiche' }).click()
  await expect(proposal.getByRole('status')).toContainText('enregistrées')
  await page.getByRole('button', { name: 'Nouvelle conversation' }).click()
  await send(
    page,
    'Prépare mon offre Audit API : découverte gratuite à 0 EUR, audit complet à 1499.90 EUR. FAQ : À distance ? Oui, entièrement à distance.',
  )
  proposal = page.getByRole('region', { name: 'Proposition de contenu' }).last()
  await expect(proposal).toContainText('1499.90')
  await expect(proposal.getByText('0', { exact: true })).toBeVisible()
  // The server commits, but the browser loses the response. Verify the receipt before retrying.
  await page.route('**/assistant/proposals/*/apply', async (route) => {
    expect((await route.fetch()).status()).toBe(200)
    await route.abort('connectionreset')
  })
  await proposal.getByRole('button', { name: 'Enregistrer la fiche' }).click()
  await expect(proposal.getByRole('button', { name: 'Vérifier l’enregistrement' })).toBeVisible()
  await page.unroute('**/assistant/proposals/*/apply')
  await proposal.getByRole('button', { name: 'Vérifier l’enregistrement' }).click()
  await expect(proposal.getByRole('status')).toContainText('enregistrées')
  expect(
    (await (await page.request.get('/api/admin/content/services?q=Audit%20API')).json()).total,
  ).toBe(1)

  await page.getByRole('button', { name: 'Nouvelle conversation' }).click()
  await page.getByText('Médias de la demande', { exact: true }).click()
  await page.getByLabel('Téléverser un fichier pour la demande', { exact: true }).setInputFiles({
    name: 'documentation-api.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGNUinnEAANMDEgAhQMAMrwBZgxCHR4AAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(
    page.getByRole('button', { name: 'Retirer documentation-api.png de la demande' }),
  ).toBeVisible()
  await send(
    page,
    'Rédige un article Documenter une API : préparer la description des routes et des exemples. Associe le média fourni avec l’alternative Schéma de documentation fourni.',
  )
  proposal = page.getByRole('region', { name: 'Proposition de contenu' }).last()
  await expect(proposal).toContainText('documentation-api.png')
  await proposal.getByRole('button', { name: 'Enregistrer la fiche' }).click()
  await expect(proposal.getByRole('status')).toContainText('enregistrées')
  await proposal.getByRole('button', { name: 'Ouvrir Documenter une API →' }).click()
  await expect(page.getByLabel('Description complète', { exact: true })).toHaveValue(/## Préparer/)
  expect(errors).toEqual([])
}

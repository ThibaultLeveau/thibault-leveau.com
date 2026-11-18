import { expect, test, type Page, type TestInfo } from '@playwright/test'
import type { Proposal } from '../../src/admin/assistant/types'

test.skip(
  !!process.env.PLAYWRIGHT_BASE_URL,
  'Les travaux et les erreurs simulés restent sur le serveur de test isolé.',
)

type Language = 'fr' | 'en'
type JobStatus = 'running' | 'review' | 'paused' | 'needs_input' | 'cancelled' | 'completed'
type Job = {
  id: string
  status: JobStatus
  language: Language
  message: string
  created: number
  updated: number
  planned: number
  prepared: number
  applied: number
  pending_batches: number
  total_tasks: number | null
  calls: number
  delegations: number
  questions: { question: string; reason: string; fields: string[] }[]
  error: string | null
  provider: string
  model: string
  include_private_notes: boolean
}

const words = {
  fr: {
    jobs: 'Travaux enregistrés', request: 'Votre demande', message: 'Votre message',
    send: 'Envoyer le message', pause: 'Mettre en pause', resume: 'Reprendre',
    stop: 'Arrêter le travail', remove: 'Supprimer le suivi',
    confirmStop: 'Confirmer l’arrêt', confirmDelete: 'Confirmer la suppression',
    input: 'Précisions ou faits complémentaires', add: 'Ajouter et reprendre',
    nextBatches: 'Lots suivants', previousBatches: 'Lots précédents',
    nextJobs: 'Travaux suivants', previousJobs: 'Travaux précédents',
    allJobs: 'Tous les travaux', proposal: 'Proposition de contenu',
    save: 'Enregistrer la fiche', verify: 'Vérifier l’enregistrement',
    saved: 'Les fiches ont été enregistrées.', login: 'Connexion',
    username: 'Nom d’utilisateur', password: 'Mot de passe', signIn: 'Se connecter',
  },
  en: {
    jobs: 'Saved work', request: 'Your request', message: 'Your message',
    send: 'Send message', pause: 'Pause', resume: 'Resume',
    stop: 'Stop work', remove: 'Delete tracking data',
    confirmStop: 'Confirm stop', confirmDelete: 'Confirm deletion',
    input: 'Clarifications or additional facts', add: 'Add and resume',
    nextBatches: 'Next batches', previousBatches: 'Previous batches',
    nextJobs: 'Next work', previousJobs: 'Previous work',
    allJobs: 'All work', proposal: 'Content proposal',
    save: 'Save entry', verify: 'Check save status',
    saved: 'The entries have been saved.', login: 'Sign in',
    username: 'Username', password: 'Password', signIn: 'Sign in',
  },
} as const

function proposal(sequence: number, language: Language): Proposal {
  const title = `Compétence ${String(sequence).padStart(3, '0')}`
  return {
    id: `durable-proposal-${sequence}`, revision: 1, state: 'pending',
    expires: null,
    items: [{
      key: `skill_${sequence}`, kind: 'skills', id: null, title, language: 'fr',
      changes: [{ field: 'title', label: language === 'fr' ? 'Titre' : 'Title', before: null, after: title }],
      status_before: null, status_after: 'draft', missing: [], errors: [],
      references: {}, related: false,
    }],
    result: null,
  }
}

// These browser scenarios exercise React with a stateful API double. Durable
// execution, real delegation and SQLite recovery are covered by backend tests.
async function jobsAPI(
  page: Page,
  language: Language,
  { seeded = false, batchCount = 2, jobCount = 1 } = {},
) {
  const timestamp = Math.floor(Date.now() / 1000)
  const job: Job = {
    id: '42424242-4242-4242-8242-424242424242', status: 'running', language: 'fr',
    message: 'Créer 100 compétences pour mon parcours.', created: timestamp, updated: timestamp,
    planned: 100, prepared: batchCount, applied: 0, pending_batches: batchCount,
    total_tasks: 100, calls: batchCount + 1, delegations: batchCount,
    questions: [], error: null, provider: 'openai', model: 'isolated-model',
    include_private_notes: false,
  }
  const batches = Array.from({ length: batchCount }, (_, index) => ({
    sequence: index + 1, proposal: proposal(index + 1, language),
  }))
  const jobs = Array.from({ length: jobCount }, (_, index) => index === 0 ? job : ({
    ...job, id: `archived-job-${index}`, status: 'completed' as const,
    message: `Demande enregistrée ${index + 1}`, pending_batches: 0,
  }))
  const writes: { path: string; body: Record<string, unknown> | null }[] = []
  const pages: { collection: string; page: number; limit: number }[] = []
  let exists = seeded
  let authenticated = true
  let uncertainReceipt: Proposal | null = null
  let loseNextApply = false
  let loseNextCreation = false
  let actionFailure: { action: string; message: string } | null = null
  let delayedRead: { entered: boolean; release: Promise<void>; resolve: () => void } | null = null
  let deliveredRead = 0
  let sessionSerial = 1

  await page.route(/\/admin\/?$/, async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        /<html[^>]*>/,
        `<html lang="${language}" data-interface-language="${language}">`,
      ),
    })
  })
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const body = request.postDataJSON() as Record<string, unknown> | null
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data })
    if (path.endsWith('/login')) {
      authenticated = true
      sessionSerial += 1
      return respond({ username: 'test-admin', csrf_token: `test-csrf-${sessionSerial}` })
    }
    if (!authenticated) return respond({ detail: 'Session expired' }, 401)
    if (method !== 'GET') {
      expect(request.headers()['x-csrf-token']).toBe(`test-csrf-${sessionSerial}`)
      writes.push({ path, body })
      if (actionFailure && path.endsWith(`/jobs/${job.id}/${actionFailure.action}`)) {
        const message = actionFailure.message
        actionFailure = null
        return respond({ detail: message }, 409)
      }
    }
    if (path.endsWith('/session'))
      return respond({ username: 'test-admin', csrf_token: `test-csrf-${sessionSerial}` })
    if (path.endsWith('/provider'))
      return respond({
        provider: 'openai', model: 'isolated-model', has_api_key: true,
        providers: [{ id: 'openai', name: 'OpenAI', default_model: 'isolated-model', docs_url: '' }],
      })
    if (path.endsWith('/content/catalog'))
      return respond({ skills: { schema: { properties: { title: { type: 'string', title: language === 'fr' ? 'Titre' : 'Title' } } } } })
    if (path.endsWith('/assistant/turn')) {
      exists = true
      job.include_private_notes = body?.include_private_notes === true
      if (loseNextCreation) {
        loseNextCreation = false
        return route.abort('connectionreset')
      }
      return respond({
        message: 'Votre demande se poursuit par lots.', questions: [], proposal: null,
        provider: 'openai', model: 'isolated-model', calls: 1, delegations: 0, job,
      })
    }
    const paginated = <T,>(items: T[], collection: string) => {
      const pageNumber = Number(url.searchParams.get('page') ?? 1)
      const limit = Number(url.searchParams.get('limit') ?? 10)
      pages.push({ collection, page: pageNumber, limit })
      expect(pageNumber).toBeGreaterThanOrEqual(1)
      expect(limit).toBeGreaterThan(0)
      expect(limit).toBeLessThanOrEqual(20)
      return respond({
        items: items.slice((pageNumber - 1) * limit, pageNumber * limit),
        page: pageNumber, limit, total: items.length,
      })
    }
    if (path.endsWith('/assistant/jobs')) {
      if (method === 'POST') {
        exists = true
        job.include_private_notes = body?.include_private_notes === true
        if (loseNextCreation) {
          loseNextCreation = false
          return route.abort('connectionreset')
        }
        return respond(job)
      }
      return paginated(exists ? jobs : [], 'jobs')
    }
    const archived = path.match(/\/jobs\/(archived-job-\d+)(\/batches)?$/)
    if (archived) {
      const index = jobs.findIndex(({ id }) => id === archived[1])
      if (index < 0) return respond({ detail: 'Not found' }, 404)
      if (archived[2]) return paginated([], 'batches')
      if (method === 'DELETE') {
        jobs.splice(index, 1)
        return respond({ deleted: true })
      }
      return respond(jobs[index])
    }
    if (path.endsWith(`/jobs/${job.id}/batches`)) return paginated(batches, 'batches')
    if (path.endsWith(`/jobs/${job.id}/pause`)) {
      job.status = 'paused'
      return respond(job)
    }
    if (path.endsWith(`/jobs/${job.id}/resume`) || path.endsWith(`/jobs/${job.id}/input`)) {
      job.status = 'running'
      job.questions = []
      return respond(job)
    }
    if (path.endsWith(`/jobs/${job.id}/cancel`)) {
      job.status = 'cancelled'
      return respond(job)
    }
    if (path.endsWith(`/jobs/${job.id}`)) {
      if (method === 'DELETE') {
        exists = false
        return respond({ deleted: true })
      }
      const snapshot = structuredClone(job)
      if (delayedRead && !delayedRead.entered) {
        const held = delayedRead
        held.entered = true
        await held.release
        try {
          await respond(snapshot)
        } catch {
          // A cancelled read is an equally valid way to reject an obsolete snapshot.
        }
        deliveredRead += 1
        return
      }
      return respond(snapshot)
    }
    const match = path.match(/\/assistant\/proposals\/durable-proposal-(\d+)(\/apply)?$/)
    if (match) {
      const batch = batches[Number(match[1]) - 1]
      if (match[2]) {
        expect(body).toEqual({ revision: 1 })
        const receipt: Proposal = {
          ...batch.proposal, state: 'applied',
          result: [{
            id: Number(match[1]), kind: 'skills', title: batch.proposal.items[0].title,
            status: 'draft', version: 1, language: 'fr',
          }],
        }
        if (loseNextApply) {
          loseNextApply = false
          uncertainReceipt = receipt
          return route.abort('connectionreset')
        }
        batch.proposal = receipt
        job.applied += 1
        job.pending_batches -= 1
        return respond(receipt)
      }
      if (uncertainReceipt?.id === batch.proposal.id) {
        batch.proposal = uncertainReceipt
        uncertainReceipt = null
        job.applied += 1
        job.pending_batches -= 1
      }
      return respond(batch.proposal)
    }
    return respond({ detail: 'Not found' }, 404)
  })
  return {
    job, writes, pages, batches,
    loseApplyResponse: () => { loseNextApply = true },
    loseCreationResponse: () => { loseNextCreation = true },
    failAction: (action: string, message: string) => { actionFailure = { action, message } },
    expireSession: () => { authenticated = false },
    delayNextRead: () => {
      let resolve!: () => void
      delayedRead = { entered: false, release: new Promise<void>((done) => { resolve = done }), resolve: () => resolve() }
      return {
        entered: () => delayedRead?.entered ?? false,
        release: () => delayedRead?.resolve(),
        delivered: () => deliveredRead,
      }
    },
  }
}

async function openJob(page: Page, language: Language, message: string) {
  const labels = words[language]
  await page.getByRole('button', { name: labels.jobs, exact: true }).click()
  await expect(page.getByRole('heading', { name: labels.jobs, exact: true })).toBeVisible()
  await page.getByRole('button', { name: message, exact: false }).click()
  await expect(page.getByRole('heading', { name: labels.request, exact: true })).toBeVisible()
}

async function inspectLayout(page: Page, info: TestInfo, language: Language) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await page.locator('.admin-main').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      const target = page.getByRole('button', { name: words[language].resume, exact: true })
      await target.focus()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await expect(target).toBeFocused()
      expect(await target.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none')
      const lowContrast = await page.locator('.chat-panel').evaluate((panel) => {
        const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3)
          .map(Number).map((value) => value / 255)
          .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0)
        return Array.from(panel.querySelectorAll<HTMLElement>('h1,h2,p,label,button,dt,dd'))
          .filter((node) => node.getClientRects().length && !(node as HTMLButtonElement).disabled && node.textContent?.trim())
          .flatMap((node) => {
            let ancestor: HTMLElement | null = node
            while (ancestor && getComputedStyle(ancestor).backgroundColor === 'rgba(0, 0, 0, 0)') ancestor = ancestor.parentElement
            const foreground = luminance(getComputedStyle(node).color)
            const background = luminance(ancestor ? getComputedStyle(ancestor).backgroundColor : 'rgb(255,255,255)')
            const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
            return ratio < 4.5 ? [{ text: node.textContent?.trim().slice(0, 60), ratio }] : []
          })
      })
      expect(lowContrast).toEqual([])
      await page.screenshot({ path: info.outputPath(`jobs-${language}-${theme}-${width}.png`), fullPage: true })
      await page.getByRole('region', { name: words[language].proposal }).first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath(`jobs-batch-${language}-${theme}-${width}.png`), fullPage: true })
    }
  }
}

for (const language of ['fr', 'en'] as const) {
  test(`travail durable ${language} : création, pause, rechargement et accessibilité (API simulée)`, async ({ page }, info) => {
    test.setTimeout(60_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const api = await jobsAPI(page, language)
    const labels = words[language]
    await page.goto('/admin')
    await page.getByLabel(labels.message, { exact: true }).fill(api.job.message)
    await page.getByRole('button', { name: labels.send, exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Français', exact: true }).click()
    await expect(page.getByRole('heading', { name: labels.request, exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: labels.proposal }).first()).toContainText('Compétence 001')
    expect(api.writes.filter(({ path }) => path.endsWith('/apply'))).toHaveLength(0)
    expect(api.writes.find(({ path }) => path.endsWith('/turn'))?.body).toMatchObject({
      language: 'fr', include_private_notes: false,
    })
    await page.getByRole('button', { name: labels.pause, exact: true }).click()
    await expect(page.getByRole('button', { name: labels.resume, exact: true })).toBeVisible()
    await page.reload()
    await openJob(page, language, api.job.message)
    await expect(page.getByRole('button', { name: labels.resume, exact: true })).toBeVisible()
    expect(api.writes.filter(({ path }) => path.endsWith('/turn'))).toHaveLength(1)
    await inspectLayout(page, info, language)
    expect(errors).toEqual([])
  })

  test(`travail durable ${language} : 51 lots paginés et reçu après coupure réseau (API simulée)`, async ({ page }) => {
    test.setTimeout(60_000)
    const api = await jobsAPI(page, language, { seeded: true, batchCount: 51, jobCount: 11 })
    api.job.status = 'review'
    const labels = words[language]
    await page.goto('/admin')
    await openJob(page, language, api.job.message)
    const proposals = page.getByRole('region', { name: labels.proposal })
    const first = proposals.first()
    await expect(first).toContainText('Compétence 001')
    api.loseApplyResponse()
    await first.getByRole('button', { name: labels.save, exact: true }).click()
    await expect(first.getByRole('button', { name: labels.verify, exact: true })).toBeVisible()
    await expect(first.getByRole('button', { name: labels.save, exact: true })).toBeDisabled()
    await first.getByRole('button', { name: labels.verify, exact: true }).click()
    await expect(first.getByRole('status')).toContainText(labels.saved)
    expect(api.writes.filter(({ path }) => path.endsWith('/apply'))).toHaveLength(1)

    const seen = new Set<string>()
    while (true) {
      const visible = await proposals.locator('summary strong').allTextContents()
      visible.forEach((title) => seen.add(title))
      expect(visible.length).toBeLessThanOrEqual(10)
      const next = page.getByRole('button', { name: labels.nextBatches, exact: true })
      if (!(await next.isEnabled())) break
      const old = visible[0]
      await next.click()
      await expect(proposals.first()).not.toContainText(old)
    }
    expect(seen.size).toBe(51)
    await page.getByRole('button', { name: labels.previousBatches, exact: true }).click()
    await expect(proposals.first()).not.toContainText('Compétence 051')
    await page.getByRole('button', { name: labels.allJobs, exact: true }).click()
    await page.getByRole('button', { name: labels.nextJobs, exact: true }).click()
    await expect(page.getByRole('button', { name: /Demande enregistrée 11/ })).toBeVisible()
    await page.getByRole('button', { name: labels.previousJobs, exact: true }).click()
    await expect(page.getByRole('button', { name: api.job.message, exact: false })).toBeVisible()

    await page.getByRole('button', { name: labels.nextJobs, exact: true }).click()
    await expect(page.locator('.jobs-list > li')).toHaveCount(1)
    await page.getByRole('button', { name: /Demande enregistrée 11/ }).click()
    await page.getByRole('button', { name: labels.remove, exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: labels.confirmDelete, exact: true }).click()
    await expect(page.getByRole('heading', { name: labels.jobs, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: api.job.message, exact: false })).toBeVisible()
    await expect(page.locator('.jobs-list > li')).toHaveCount(10)
    await expect(page.getByRole('button', { name: /Demande enregistrée 11/ })).toHaveCount(0)
    expect(api.pages.filter(({ collection }) => collection === 'jobs').at(-1)?.page).toBe(1)
    expect(api.writes.filter(({ path }) => path.endsWith('/jobs/archived-job-10'))).toHaveLength(1)
    expect(api.pages.filter(({ collection }) => collection === 'batches').some(({ page }) => page > 5)).toBe(true)
  })
}

test('travail durable : 41 apports distincts et arrêt explicite au clavier (API simulée)', async ({ page }) => {
  test.setTimeout(60_000)
  const api = await jobsAPI(page, 'fr', { seeded: true })
  api.job.status = 'needs_input'
  api.job.questions = [{ question: 'Quels faits souhaitez-vous ajouter ?', reason: '', fields: [] }]
  await page.goto('/admin')
  await openJob(page, 'fr', api.job.message)
  for (let index = 1; index <= 41; index += 1) {
    if (index > 1) await page.getByRole('button', { name: words.fr.pause, exact: true }).click()
    const value = `Fait complémentaire ${index} : expérience explicitement fournie.`
    await page.getByLabel(words.fr.input, { exact: true }).fill(value)
    await page.getByRole('button', { name: words.fr.add, exact: true }).click()
    await expect.poll(() => api.writes.filter(({ path }) => path.endsWith('/input')).length).toBe(index)
    await expect(page.getByLabel(words.fr.input, { exact: true })).toHaveValue('')
  }
  const inputs = api.writes.filter(({ path }) => path.endsWith('/input'))
  expect(inputs.every(({ body }) => Object.keys(body ?? {}).every((key) => ['message', 'request_id'].includes(key)))).toBe(true)
  expect(new Set(inputs.map(({ body }) => body?.request_id)).size).toBe(41)
  expect(inputs.at(-1)?.body?.message).toContain('41')
  expect(JSON.stringify(inputs.at(-1)?.body)).not.toContain('complémentaire 1 :')

  await page.getByRole('button', { name: words.fr.pause, exact: true }).click()
  await page.getByLabel(words.fr.input, { exact: true }).fill('Cette précision non envoyée sera abandonnée après confirmation.')
  const stop = page.getByRole('button', { name: words.fr.stop, exact: true })
  await stop.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(api.writes.filter(({ path }) => path.endsWith('/cancel'))).toHaveLength(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(stop).toBeFocused()
  await stop.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: words.fr.confirmStop, exact: true }).click()
  await expect.poll(() => api.job.status).toBe('cancelled')
  await expect(page.getByRole('button', { name: words.fr.allJobs, exact: true })).toBeEnabled()
  await expect(page.locator('.jobs-toggle')).toBeEnabled()
  await page.getByRole('button', { name: words.fr.remove, exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(api.writes.filter(({ path }) => path === `/api/admin/assistant/jobs/${api.job.id}`)).toHaveLength(0)
  await page.getByRole('dialog').getByRole('button', { name: words.fr.confirmDelete, exact: true }).click()
  await expect(page.getByRole('heading', { name: words.fr.jobs, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: api.job.message, exact: false })).toHaveCount(0)
})

test('travail durable : un ancien rafraîchissement ne remplace pas la pause confirmée (API simulée)', async ({ page }) => {
  const api = await jobsAPI(page, 'fr', { seeded: true })
  await page.goto('/admin')
  await openJob(page, 'fr', api.job.message)
  await expect(page.getByRole('button', { name: words.fr.pause, exact: true })).toBeVisible()
  const held = api.delayNextRead()
  try {
    await expect.poll(held.entered, { timeout: 10_000 }).toBe(true)
    await page.getByRole('button', { name: words.fr.pause, exact: true }).click()
    await expect(page.getByRole('button', { name: words.fr.resume, exact: true })).toBeVisible()
    held.release()
    await expect.poll(held.delivered).toBe(1)
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    await expect(page.getByRole('button', { name: words.fr.resume, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: words.fr.pause, exact: true })).toHaveCount(0)
  } finally {
    held.release()
  }
})

test('travail durable : reconnexion conserve le travail et renouvelle le jeton des actions (API simulée)', async ({ page }) => {
  const api = await jobsAPI(page, 'en', { seeded: true })
  await page.goto('/admin')
  await openJob(page, 'en', api.job.message)
  api.expireSession()
  await page.getByRole('button', { name: words.en.pause, exact: true }).click()
  await expect(page.getByRole('heading', { name: words.en.login, exact: true })).toBeVisible()
  await page.getByLabel(words.en.username, { exact: true }).fill('test-admin')
  await page.getByLabel(words.en.password, { exact: true }).fill('isolated-test-password')
  await page.getByRole('button', { name: words.en.signIn, exact: true }).click()
  await openJob(page, 'en', api.job.message)
  await page.getByRole('button', { name: words.en.pause, exact: true }).click()
  await expect(page.getByRole('button', { name: words.en.resume, exact: true })).toBeVisible()
  expect(api.writes.filter(({ path }) => path.endsWith('/pause'))).toHaveLength(1)
  expect(api.writes.filter(({ path }) => path.endsWith('/turn'))).toHaveLength(0)
})

test('travail durable : précisions protégées et erreur de reprise visible après actualisation (API simulée)', async ({ page }) => {
  const api = await jobsAPI(page, 'fr', { seeded: true })
  api.job.status = 'paused'
  await page.goto('/admin')
  await openJob(page, 'fr', api.job.message)
  const input = page.getByLabel(words.fr.input, { exact: true })
  await input.fill('Un fait en cours de rédaction, à conserver.')
  await expect(page.locator('.jobs-toggle')).toBeDisabled()
  await expect(page.getByRole('button', { name: words.fr.allJobs, exact: true })).toBeDisabled()
  await expect(input).toHaveValue('Un fait en cours de rédaction, à conserver.')
  await input.fill('')
  await expect(page.locator('.jobs-toggle')).toBeEnabled()

  const message = 'Le fournisseur a changé. Rétablissez la configuration du travail avant de reprendre.'
  api.failAction('resume', message)
  await page.getByRole('button', { name: words.fr.resume, exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(message)
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(message)
  await expect(page.getByRole('button', { name: words.fr.resume, exact: true })).toBeVisible()
})

test('travail durable : suivi explicite et réessai de création avec la même identité (API simulée)', async ({ page }) => {
  const api = await jobsAPI(page, 'fr')
  await page.goto('/admin')
  await page.locator('.assistant-options > summary').click()
  await page.getByRole('checkbox', { name: 'Suivre cette demande', exact: true }).check()
  await page.getByLabel(words.fr.message, { exact: true }).fill(api.job.message)
  api.loseCreationResponse()
  await page.getByRole('button', { name: words.fr.send, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Français', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Vérifiez les travaux enregistrés')
  await expect(page.getByLabel(words.fr.message, { exact: true })).toHaveValue(api.job.message)
  await openJob(page, 'fr', api.job.message)
  await page.locator('.jobs-toggle').click()
  await page.getByRole('button', { name: words.fr.send, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Français', exact: true }).click()
  await expect(page.getByRole('heading', { name: words.fr.request, exact: true })).toBeVisible()
  const creates = api.writes.filter(({ path }) => path.endsWith('/assistant/jobs'))
  expect(creates).toHaveLength(2)
  expect(creates[0].body?.request_id).toEqual(creates[1].body?.request_id)
  expect(creates[0].body?.thread_id).toEqual(creates[1].body?.thread_id)
  expect(api.writes.filter(({ path }) => path.endsWith('/assistant/turn'))).toHaveLength(0)
})

test.describe('travail durable sur base isolée', () => {
  test.use({ baseURL: 'http://127.0.0.1:8769' })

  test('13 fiches via React, FastAPI, SQLite et les vrais sous-agents, rechargement et relecture', async ({ page }, info) => {
    test.setTimeout(150_000)
    test.skip(info.project.name !== 'desktop', 'Un seul parcours écrit sur la base dédiée ; les scénarios simulés couvrent aussi le mobile.')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/admin')
    await page.getByLabel(words.fr.username, { exact: true }).fill('playwright-admin')
    await page.getByLabel(words.fr.password, { exact: true }).fill('playwright-only-password')
    await page.getByRole('button', { name: words.fr.signIn, exact: true }).click()
    await expect(page.locator('.admin-shell')).toBeVisible()
    const session = await (await page.request.get('/api/admin/session')).json()
    const provider = await page.request.put('/api/admin/provider', {
      headers: { Origin: 'http://127.0.0.1:8769', 'X-CSRF-Token': session.csrf_token },
      data: { provider: 'openai', model: 'gpt-6-luna', api_key: 'isolated-jobs-provider-key' },
    })
    expect(provider.ok()).toBe(true)
    await page.reload()
    await page.getByLabel(words.fr.message, { exact: true }).fill(
      'Créer 13 compétences de test isolé, intitulées Compétence suivie 1 à 13, avec pour résumé Faits synthétiques fournis.',
    )
    await page.getByRole('button', { name: words.fr.send, exact: true }).click()
    const response = page.waitForResponse((answer) => answer.url().endsWith('/assistant/turn') && answer.request().method() === 'POST')
    await page.getByRole('dialog').getByRole('button', { name: 'Français', exact: true }).click()
    const answer = await response
    expect(answer.ok()).toBe(true)
    const started = (await answer.json()).job as Job
    expect(started.id).toBeTruthy()
    await expect(page.getByRole('heading', { name: words.fr.request, exact: true })).toBeVisible()
    expect((await (await page.request.get('/api/admin/content/skills?q=Comp%C3%A9tence%20suivie')).json()).total).toBe(0)

    await page.reload()
    const persisted = await (await page.request.get(`/api/admin/assistant/jobs/${started.id}`)).json() as Job
    await openJob(page, 'fr', persisted.message)
    let applied = 0
    for (let index = 0; index < 13 && applied < 13; index += 1) {
      const card = page.getByRole('region', { name: words.fr.proposal }).first()
      const save = card.getByRole('button', { name: /^Enregistrer (la fiche|les fiches)$/ })
      await expect(save).toBeEnabled({ timeout: 45_000 })
      const firstTitle = await card.locator('summary strong').first().textContent()
      await save.click()
      await expect(card.getByRole('status')).toContainText(words.fr.saved)
      await expect.poll(async () => {
        const current = await (await page.request.get(`/api/admin/assistant/jobs/${started.id}`)).json() as Job
        return current.applied
      }, { timeout: 20_000 }).toBeGreaterThan(applied)
      applied = (await (await page.request.get(`/api/admin/assistant/jobs/${started.id}`)).json() as Job).applied
      if (applied < 13) {
        const next = page.getByRole('button', { name: words.fr.nextBatches, exact: true })
        await expect(next).toBeEnabled({ timeout: 45_000 })
        await next.click()
        await expect(card.locator('summary strong').first()).not.toHaveText(firstTitle!)
      }
    }
    expect(applied).toBe(13)
    await expect.poll(async () => (await (await page.request.get(`/api/admin/assistant/jobs/${started.id}`)).json()).status).toBe('completed')
    const saved = await (await page.request.get('/api/admin/content/skills?q=Comp%C3%A9tence%20suivie&limit=50')).json()
    expect(saved.total).toBe(13)
    expect(new Set(saved.items.map((item: { id: number }) => item.id)).size).toBe(13)
    expect(new Set(saved.items.map((item: { title: string }) => item.title)).size).toBe(13)
    const finalJob = await (await page.request.get(`/api/admin/assistant/jobs/${started.id}`)).json() as Job
    expect(finalJob.prepared).toBe(13)
    expect(finalJob.delegations).toBeGreaterThanOrEqual(13)
    expect(finalJob.pending_batches).toBe(0)
    expect(errors).toEqual([])
  })
})

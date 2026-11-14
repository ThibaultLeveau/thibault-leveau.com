import { expect, test, type Page } from '@playwright/test'
import { assistantWorkflow } from './assistant-workflow'

test.skip(
  !!process.env.PLAYWRIGHT_BASE_URL,
  'Les parcours admin écrivent uniquement sur le serveur de test isolé.',
)

const session = { username: 'thibault', csrf_token: 'test-csrf-token' }
const providers = [
  {
    id: 'openai',
    name: 'OpenAI',
    default_model: 'gpt-6-luna',
    docs_url: 'https://developers.openai.com/api/docs/models',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    default_model: 'claude-sonnet-4-6',
    docs_url: 'https://platform.claude.com/docs/en/models/overview',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    default_model: 'mistral-small-latest',
    docs_url: 'https://docs.mistral.ai/getting-started/models',
  },
]

async function mockAdmin(page: Page, { authenticated = true, configured = true } = {}) {
  let loggedIn = authenticated
  let configuration = {
    provider: 'openai',
    model: 'gpt-6-luna',
    has_api_key: configured,
    providers,
  }
  const writes: { path: string; body: Record<string, unknown> }[] = []
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON() as Record<string, unknown> | null
    const respond = (data: unknown, status = 200) => route.fulfill({ status, json: data })
    if (path.endsWith('/login')) {
      if (body?.password === 'wrong-password')
        return respond({ detail: 'Identifiants incorrects.' }, 401)
      loggedIn = true
      return respond(session)
    }
    if (!loggedIn) return respond({ detail: 'Connectez-vous.' }, 401)
    if (request.method() !== 'GET') writes.push({ path, body: body ?? {} })
    if (path.endsWith('/session')) return respond(session)
    if (path.endsWith('/logout') || path.endsWith('/account')) {
      loggedIn = false
      return route.fulfill({ status: 204 })
    }
    if (path.endsWith('/provider')) {
      if (body)
        configuration = {
          ...configuration,
          provider: String(body.provider),
          model: String(body.model),
          has_api_key: !body.clear_api_key && (!!body.api_key || configuration.has_api_key),
        }
      return respond(configuration)
    }
    if (path.endsWith('/assistant/turn'))
      return respond({
        message: 'Voici une première piste pour votre idée. <script>unsafe()</script>',
        questions: [],
        proposal: null,
        calls: 1,
        delegations: 0,
        provider: configuration.provider,
        model: configuration.model,
      })
    return respond({ detail: 'Not found' }, 404)
  })
  return writes
}

async function openMenuIfNeeded(page: Page) {
  await expect(page.locator('.admin-shell')).toBeVisible()
  if (!(await page.getByRole('button', { name: 'Réglages du site', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
}

async function settingsView(page: Page, view: 'AI provider' | 'Admin user') {
  if (!(await page.getByRole('button', { name: view, exact: true }).isVisible()))
    await openMenuIfNeeded(page)
  const button = page.getByRole('button', { name: 'Réglages du site', exact: true })
  if (!(await page.getByRole('button', { name: view, exact: true }).isVisible()))
    await button.click()
  await page.getByRole('button', { name: view, exact: true }).click()
  await expect(page.getByRole('heading', { name: `${view}.`, exact: true })).toBeVisible()
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('.admin-main, .settings-card')).every(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ),
  ).toBe(true)
}

test('connexion, erreurs et déconnexion', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockAdmin(page, { authenticated: false })
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('thibault')
  await page.getByLabel('Mot de passe', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText('Identifiants incorrects.')
  await page.getByLabel('Mot de passe', { exact: true }).fill('test-password-long')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await openMenuIfNeeded(page)
  await expect(page.getByRole('navigation', { name: 'Navigation administrateur' })).toBeVisible()
  await noOverflow(page)
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Vous êtes déconnecté.')
  expect(errors).toEqual([])
})

test('réglages accolés, fournisseur et confidentialité de la clé', async ({ page }) => {
  const writes = await mockAdmin(page, { configured: false })
  await page.goto('/admin')
  await openMenuIfNeeded(page)
  await page.getByRole('button', { name: 'Réglages du site', exact: true }).click()
  const rail = await page.locator('.admin-sidebar').boundingBox()
  const second = await page.locator('.settings-sidebar').boundingBox()
  if (page.viewportSize()!.width > 900) expect(second!.x).toBeCloseTo(rail!.x + rail!.width, 0)
  else {
    expect(second!.x).toBe(0)
    await expect(page.locator('.admin-main')).toHaveAttribute('inert', '')
  }
  await page.getByRole('button', { name: 'AI provider', exact: true }).click()
  await page.getByRole('radio', { name: 'Mistral', exact: true }).check()
  await expect(page.getByLabel('Modèle', { exact: true })).toHaveValue('mistral-small-latest')
  await page.getByLabel(/^Clé API/).fill('fake-key-for-browser-test')
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(page.getByRole('status')).toHaveText('Vos réglages sont enregistrés.')
  await expect(page.getByLabel(/^Clé API/)).toHaveValue('')
  expect(writes.at(-1)?.body).toMatchObject({
    provider: 'mistral',
    api_key: 'fake-key-for-browser-test',
  })
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('fake-key')
  await noOverflow(page)
})

test('compte administrateur, confirmation et retour à la connexion', async ({ page }) => {
  const writes = await mockAdmin(page)
  await page.goto('/admin')
  await settingsView(page, 'Admin user')
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('nouvel-admin')
  await page.getByLabel('Mot de passe actuel', { exact: true }).fill('old-test-password')
  await page.getByLabel(/^Nouveau mot de passe/).fill('new-test-password')
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('different-test-password')
  await page.getByRole('button', { name: 'Mettre à jour le compte' }).click()
  await expect(page.getByRole('alert')).toContainText('ne correspondent pas')
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('new-test-password')
  await page.getByRole('button', { name: 'Mettre à jour le compte' }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  expect(writes.at(-1)?.body).toEqual({
    username: 'nouvel-admin',
    current_password: 'old-test-password',
    new_password: 'new-test-password',
  })
})

test('chat, nouvelle conversation, erreur réseau et texte sûr', async ({ page }) => {
  const writes = await mockAdmin(page)
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Créer un projet' }).click()
  await expect(page.getByLabel('Votre message')).toHaveValue('Créer un projet')
  await page.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(page.getByRole('log')).toContainText('Voici une première piste')
  await expect(page.getByRole('log')).toContainText('<script>unsafe()</script>')
  expect(await page.locator('.messages script').count()).toBe(0)
  expect(writes.at(-1)?.body).toMatchObject({
    messages: [{ role: 'user', content: 'Créer un projet' }],
    include_private_notes: false,
    media_ids: [],
  })
  await page.getByRole('button', { name: 'Nouvelle conversation' }).click()
  await expect(page.getByRole('heading', { name: /créer aujourd’hui/ })).toBeVisible()
  await page.route('**/api/admin/assistant/turn', (route) =>
    route.fulfill({
      status: 504,
      json: { detail: 'Le fournisseur met trop de temps à répondre.' },
    }),
  )
  await page.getByLabel('Votre message').fill('Une question à réessayer')
  await page.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(page.getByRole('alert')).toContainText('trop de temps')
  await expect(page.getByLabel('Votre message')).toHaveValue('Une question à réessayer')
})

test('thèmes, clavier et écran étroit dans chaque vue', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.emulateMedia({ colorScheme: 'light' })
  await mockAdmin(page)
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
  await openMenuIfNeeded(page)
  const settings = page.getByRole('button', { name: 'Réglages du site', exact: true })
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'AI provider', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeFocused()
  await settingsView(page, 'AI provider')
  await noOverflow(page)
  await settingsView(page, 'Admin user')
  await noOverflow(page)
  await page.getByRole('button', { name: 'Activer le thème clair' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await noOverflow(page)
})

test('session expirée et administration désactivée', async ({ page }) => {
  await mockAdmin(page)
  await page.goto('/admin')
  await settingsView(page, 'AI provider')
  await page.route('**/api/admin/provider', (route) =>
    route.fulfill({ status: 401, json: { detail: 'Session expirée' } }),
  )
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('session a expiré')
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ status: 503, json: { detail: 'L’administration n’est pas activée.' } }),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('n’est pas activée')
})

test('parcours réel React → FastAPI → SQLite → agents LangChain', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  test.skip(
    testInfo.project.name !== 'desktop',
    'Un seul parcours modifie le compte de test partagé ; les vues mobiles sont couvertes ci-dessus.',
  )
  await page.goto('/admin')
  await page.getByLabel('Nom d’utilisateur', { exact: true }).fill('playwright-admin')
  await page.getByLabel('Mot de passe', { exact: true }).fill('playwright-only-password')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await settingsView(page, 'AI provider')
  await page.getByLabel(/^Clé API/).fill('isolated-e2e-fake-provider-key')
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(page.getByRole('status')).toHaveText('Vos réglages sont enregistrés.')
  await page.reload()
  await expect(page.getByRole('heading', { name: /créer aujourd’hui/ })).toBeVisible()
  await page.getByLabel('Votre message').fill('Bonjour, ceci est un test isolé.')
  await page.getByRole('button', { name: 'Envoyer le message' }).click()
  await expect(page.getByRole('log')).toContainText('Bonjour depuis le fournisseur de test.')
  await assistantWorkflow(page, testInfo)
  const cookies = await page.context().cookies()
  const cookie = cookies.find((item) => item.name === 'site_admin_session')!
  expect(cookie.httpOnly).toBe(true)
  expect(cookie.sameSite).toBe('Strict')
  await settingsView(page, 'AI provider')
  await expect(page.getByLabel(/^Clé API/)).toHaveValue('')
  await page.getByRole('button', { name: 'Retirer la clé' }).click()
  await expect(page.getByRole('status')).toHaveText('La clé API a été retirée.')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
})

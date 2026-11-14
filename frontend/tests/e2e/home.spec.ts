import { expect, test } from '@playwright/test'

test('accueil public, responsive et ressources locales', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Accueil · Thibault Leveau')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  if (!isMobile)
    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' }),
    ).toBeVisible()
  else
    await expect(
      page.getByRole('button', { name: 'Menu', exact: true }),
    ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Thibault Leveau — accueil' }),
  ).toHaveAttribute('href', '/')
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.fonts.check('16px Inter'))).toBe(
    true,
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
})

test('thème système, choix explicite et persistance', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(
    await page.evaluate(() => localStorage.getItem('personal-site-theme')),
  ).toBe('dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('navigation clavier et commande de thème accessibles', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Aller au contenu' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Thibault Leveau — accueil' }),
  ).toBeFocused()
  const toggle = page.getByRole('button', { name: 'Activer le thème sombre' })
  for (
    let i = 0;
    i < 10 && !(await toggle.evaluate((e) => e === document.activeElement));
    i++
  )
    await page.keyboard.press('Tab')
  await expect(toggle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('thème utilisable lorsque le stockage est bloqué', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage disabled', 'SecurityError')
      },
    })
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Activer le thème clair' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(errors).toEqual([])
})

test('le thème est initialisé avant le chargement de React', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() =>
    localStorage.setItem('personal-site-theme', 'dark'),
  )
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('pas de débordement sur un écran de 320 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

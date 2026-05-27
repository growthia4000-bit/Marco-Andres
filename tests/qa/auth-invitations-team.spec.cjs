const { test, expect } = require('@playwright/test')

test.setTimeout(180000)

const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3000'
const supabaseUrl = process.env.QA_SUPABASE_URL || 'http://127.0.0.1:54321'
const publishableKey = process.env.QA_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const serviceKey = process.env.QA_SUPABASE_SERVICE_KEY || '[REDACTED_SUPABASE_SECRET_KEY]'

async function api(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`)
  }

  return response.json()
}

test('owner signup + invitation signup + team post-acceptance', async ({ page, browser }) => {
  const stamp = Date.now()
  const ownerEmail = `qa-owner-${stamp}@example.com`
  const inviteEmail = `qa-invite-${stamp}@example.com`
  const password = 'Phase24b123!'

  await page.goto(`${baseUrl}/signup`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Inmobiliaria XYZ').fill('QA Realty')
  await page.getByPlaceholder('Juan Garcia').fill('QA Owner')
  await page.getByPlaceholder('tu@email.com').fill(ownerEmail)
  await page.getByPlaceholder('Mínimo 6 caracteres').fill(password)
  await page.getByRole('button', { name: 'Crear Cuenta' }).click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })

  await page.goto(`${baseUrl}/team`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Invitar Miembro' }).click()
  await page.getByPlaceholder('tu@email.com').fill(inviteEmail)
  await page.locator('main select').nth(0).selectOption('agent')

  const inviteResponsePromise = page.waitForResponse((response) => {
    return response.url().includes('/api/invitations') && response.request().method() === 'POST'
  })

  await page.getByRole('button', { name: 'Invitar', exact: true }).click()
  const invitePayload = await (await inviteResponsePromise).json()
  const inviteUrl = String(invitePayload.inviteUrl || '').replace('http://localhost:3000', baseUrl)

  const invitedContext = await browser.newContext()
  const invitedPage = await invitedContext.newPage()
  await invitedPage.goto(inviteUrl, { waitUntil: 'networkidle' })
  await invitedPage.getByPlaceholder('Juan Garcia').fill('Invited Agent')
  await invitedPage.getByPlaceholder('Mínimo 6 caracteres').fill(password)
  await invitedPage.getByRole('button', { name: 'Unirse al Equipo' }).click()
  await invitedPage.waitForURL('**/dashboard', { timeout: 20000 })

  const invitationRows = await api(`/rest/v1/invitations?select=email,status,accepted_at&email=eq.${encodeURIComponent(inviteEmail)}`)
  const userRows = await api(`/rest/v1/users?select=id,email,tenant_id,role&email=eq.${encodeURIComponent(inviteEmail)}`)
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  })
  const authJson = await authResponse.json()
  const authUser = authJson.users.find((user) => user.email === inviteEmail)

  expect(invitationRows[0]?.status).toBe('accepted')
  expect(invitationRows[0]?.accepted_at).toBeTruthy()
  expect(userRows[0]?.email).toBe(inviteEmail)
  expect(userRows[0]?.role).toBe('agent')
  expect(authUser?.email).toBe(inviteEmail)

  await page.goto(`${baseUrl}/team`, { waitUntil: 'networkidle' })
  await expect(page.locator('body')).toContainText('Invitaciones (0)')
  await expect(page.locator('body')).not.toContainText('Invitaciones Pendientes')
  await expect(page.locator('body')).toContainText('Invited Agent')
  await expect(page.locator('body')).toContainText('Agente')

  await invitedContext.close()
})

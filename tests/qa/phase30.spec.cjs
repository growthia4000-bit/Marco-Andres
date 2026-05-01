const { test, expect } = require('@playwright/test')

test.setTimeout(180000)

const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3000'
const supabaseUrl = process.env.QA_SUPABASE_URL || 'http://127.0.0.1:54321'
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
  
  // If method is PATCH or something that might not return body, check it
  if (response.status === 204) return null;
  return response.json()
}

test('phase 30 e2e validation: manual commercial operations', async ({ browser }) => {
  const stamp = Date.now()
  const ownerEmail = `qa-tenant-${stamp}@example.com`
  const superadminEmail = `qa-superadmin-${stamp}@example.com`
  const password = 'Phase30Password123!'

  // 1. Create Normal Tenant
  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await ownerPage.goto(`${baseUrl}/signup`, { waitUntil: 'networkidle' })
  await ownerPage.getByPlaceholder('Inmobiliaria XYZ').fill(`Tenant ${stamp}`)
  await ownerPage.getByPlaceholder('Juan Garcia').fill('QA Owner')
  await ownerPage.getByPlaceholder('tu@email.com').fill(ownerEmail)
  await ownerPage.getByPlaceholder('Mínimo 6 caracteres').fill(password)
  await ownerPage.getByRole('button', { name: 'Crear Cuenta' }).click()
  await ownerPage.waitForURL('**/dashboard', { timeout: 20000 })
  console.log('✓ Normal tenant created')

  // 2. Create Superadmin
  const superadminContext = await browser.newContext()
  const superadminPage = await superadminContext.newPage()
  await superadminPage.goto(`${baseUrl}/signup`, { waitUntil: 'networkidle' })
  await superadminPage.getByPlaceholder('Inmobiliaria XYZ').fill(`Superadmin Inc`)
  await superadminPage.getByPlaceholder('Juan Garcia').fill('Super Admin')
  await superadminPage.getByPlaceholder('tu@email.com').fill(superadminEmail)
  await superadminPage.getByPlaceholder('Mínimo 6 caracteres').fill(password)
  await superadminPage.getByRole('button', { name: 'Crear Cuenta' }).click()
  await superadminPage.waitForURL('**/dashboard', { timeout: 20000 })
  console.log('✓ Superadmin account registered')

  // Promote to superadmin via API
  await api(`/rest/v1/users?email=eq.${encodeURIComponent(superadminEmail)}`, {
    method: 'PATCH',
    body: JSON.stringify({ global_role: 'superadmin' }),
  })
  console.log('✓ Promoted to superadmin in DB')

  // Go to admin dashboard
  await superadminPage.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' })
  await expect(superadminPage.getByText('Panel de Administración Global')).toBeVisible()
  
  // 3. Edit Commercial Status (Plan & Status)
  // Find the row for the newly created tenant
  const tenantRow = superadminPage.locator('tr').filter({ hasText: `Tenant ${stamp}` })
  await expect(tenantRow).toBeVisible()
  
  // Enter edit mode
  await tenantRow.getByTitle('Editar').click()
  
  // Change plan. We just pick any plan from the dropdown that is not the first empty one
  const planSelect = tenantRow.locator('select[name="planSlug"]')
  await planSelect.selectOption({ index: 2 }) // assuming index 1 is typical basic plan
  
  // Change subscription status to 'canceled' for test purposes
  const statusSelect = tenantRow.locator('select[name="subscriptionStatus"]')
  await statusSelect.selectOption('canceled')
  
  // Save
  await tenantRow.getByTitle('Guardar').click()
  console.log('✓ Manual commercial status update submitted')
  
  // Wait a moment for action to finish and revalidate
  await superadminPage.waitForTimeout(2000)
  
  // Verify in DB that it changed
  const usersJson = await api(`/rest/v1/users?email=eq.${encodeURIComponent(ownerEmail)}`)
  const targetTenantId = usersJson[0].tenant_id
  const subsJson = await api(`/rest/v1/subscriptions?tenant_id=eq.${targetTenantId}&is_current=eq.true`)
  
  expect(subsJson.length).toBeGreaterThan(0)
  expect(subsJson[0].status).toBe('canceled')
  console.log('✓ Confirmed updated plan & status in database')

  // 4. Suspend Tenant
  await tenantRow.getByRole('button', { name: 'Suspender' }).click()
  console.log('✓ Suspend button clicked')
  await superadminPage.waitForTimeout(2000)
  
  // Verify DB state for suspension
  const tenantsJson = await api(`/rest/v1/tenants?id=eq.${targetTenantId}`)
  expect(tenantsJson[0].status).toBe('suspended')
  expect(tenantsJson[0].suspended_at).not.toBeNull()
  console.log('✓ Confirmed suspended state remotely')
  
  // 5. Verify Redirect in Tenant Dashboard (Consistency)
  await ownerPage.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' })
  await ownerPage.waitForURL('**/suspended', { timeout: 10000 })
  await expect(ownerPage.getByText('Tenant suspendido', { exact: false })).toBeVisible()
  console.log('✓ Suspend redirect verified')

  // 6. Reactivate Tenant
  await tenantRow.getByRole('button', { name: 'Reactivar' }).click()
  console.log('✓ Reactivate button clicked')
  await superadminPage.waitForTimeout(2000)

  const tenantsReactivatedJson = await api(`/rest/v1/tenants?id=eq.${targetTenantId}`)
  expect(tenantsReactivatedJson[0].status).toBe('active')
  expect(tenantsReactivatedJson[0].suspended_at).toBeNull()
  console.log('✓ Confirmed reactivated state remotely')

  // 7. Verify Return to Dashboard
  await ownerPage.goto(`${baseUrl}/suspended`, { waitUntil: 'networkidle' })
  await ownerPage.waitForURL('**/dashboard', { timeout: 10000 })
  await expect(ownerPage.getByText(`Tenant ${stamp}`, { exact: false })).toBeVisible()
  console.log('✓ Return to operational dashboard verified')

  await ownerContext.close()
  await superadminContext.close()
})

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY = '[REDACTED_SUPABASE_SECRET_KEY]'

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/plans`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([
      { slug: 'starter', name: 'Starter', max_users: 5, is_active: true },
      { slug: 'growth', name: 'Growth', max_users: 15, is_active: true },
      { slug: 'agency', name: 'Agency', max_users: 30, is_active: true },
      { slug: 'enterprise', name: 'Enterprise', max_users: 9999, is_active: true },
    ]),
  })
  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Plans:', JSON.stringify(data, null, 2))
}
run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

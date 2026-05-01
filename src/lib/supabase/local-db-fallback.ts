import { Client } from 'pg'

function getLocalDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1:54321')) {
    return 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  }
  return null
}

export async function resolveTenantIdWithFallback(slug: string): Promise<string | null> {
  const dbUrl = getLocalDbUrl()
  if (!dbUrl) return null

  const client = new Client({ connectionString: dbUrl })
  await client.connect()
  try {
    const result = await client.query<{ id: string }>('select id from tenants where slug = $1 limit 1', [slug])
    return result.rows[0]?.id || null
  } finally {
    await client.end()
  }
}

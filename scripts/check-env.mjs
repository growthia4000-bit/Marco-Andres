import { existsSync, readFileSync } from 'node:fs'

const requiredVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
]

const target = process.env.RELEASE_ENV || process.env.APP_ENV || 'local'

if (target === 'local' && existsSync('.env.local')) {
  const lines = readFileSync('.env.local', 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex)
    const value = trimmed.slice(separatorIndex + 1)

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

const missing = requiredVars.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error(`Faltan variables obligatorias para ${target}: ${missing.join(', ')}`)
  process.exit(1)
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

for (const [label, value] of [
  ['NEXT_PUBLIC_SITE_URL', siteUrl],
  ['NEXT_PUBLIC_SUPABASE_URL', supabaseUrl],
]) {
  try {
    new URL(value)
  } catch {
    console.error(`${label} no es una URL válida: ${value}`)
    process.exit(1)
  }
}

console.log(`Entorno ${target} validado correctamente.`)
console.log(`- NEXT_PUBLIC_SITE_URL=${siteUrl}`)
console.log(`- NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`)

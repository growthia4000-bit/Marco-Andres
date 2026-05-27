const baseUrl = process.env.HEALTHCHECK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
const endpoints = ['/', '/login', '/signup']

for (const endpoint of endpoints) {
  const url = new URL(endpoint, baseUrl).toString()
  const response = await fetch(url, { redirect: 'manual' })

  if (response.status >= 400) {
    console.error(`Healthcheck falló en ${url} con status ${response.status}`)
    process.exit(1)
  }

  console.log(`OK ${response.status} ${url}`)
}

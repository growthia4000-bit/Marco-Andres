import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const nextBin = resolve('node_modules/next/dist/bin/next')

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000',
}

const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1'], {
  stdio: 'inherit',
  env,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

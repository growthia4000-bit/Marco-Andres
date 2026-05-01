import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const nextBin = resolve('node_modules/next/dist/bin/next')
const port = process.env.PORT || '3000'
const hostname = process.env.HOSTNAME || '0.0.0.0'

const child = spawn(process.execPath, [nextBin, 'start', '--hostname', hostname, '--port', port], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

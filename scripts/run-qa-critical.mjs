import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const scriptPath = resolve('scripts/qa-critical.ps1')

const child = spawn(
  'powershell.exe',
  ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
  {
    stdio: 'inherit',
    env: process.env,
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

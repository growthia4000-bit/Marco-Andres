import { spawn } from 'node:child_process'

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    })

    child.on('exit', (code) => {
      if (code === 0 || allowFailure) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

await run('npx', ['supabase', 'stop', '--project-id', 'crm-inmobiliario'], { allowFailure: true })
await run('npx', ['supabase', 'start'])
await run('npx', ['supabase', 'db', 'reset'])

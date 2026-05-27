export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.npm_lifecycle_event === 'build') return

  console.info('[email sync scheduler] instrumentation register called', {
    runtime: process.env.NEXT_RUNTIME || 'nodejs',
    nodeEnv: process.env.NODE_ENV || 'unknown',
  })

  const [{ ensureEmailSyncSchedulerStarted }, { syncEmailInboxAutomaticallyAction }] = await Promise.all([
    import('@/lib/email-sync-scheduler'),
    import('@/features/conversations/actions'),
  ])

  ensureEmailSyncSchedulerStarted(async () => {
    await syncEmailInboxAutomaticallyAction()
  }, 'instrumentation.register')
}

import { NextRequest, NextResponse } from 'next/server'
import { syncEmailInboxAutomaticallyAction } from '@/features/conversations/actions'
import { EmailSyncLockedError, getEmailSyncSchedulerSnapshot } from '@/lib/email-sync-scheduler'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = process.env.EMAIL_SYNC_CRON_SECRET

  if (!expectedSecret) {
    return NextResponse.json({ error: 'EMAIL_SYNC_CRON_SECRET is not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncEmailInboxAutomaticallyAction()
    return NextResponse.json({ status: 'ok', scheduler: getEmailSyncSchedulerSnapshot(), ...result })
  } catch (error) {
    if (error instanceof EmailSyncLockedError) {
      return NextResponse.json({ error: error.message, scheduler: getEmailSyncSchedulerSnapshot() }, { status: 423 })
    }

    const reason = error instanceof Error ? error.message : 'Automatic IMAP sync failed'
    console.error('[email sync cron] failed', reason)
    return NextResponse.json({ error: reason, scheduler: getEmailSyncSchedulerSnapshot() }, { status: 500 })
  }
}

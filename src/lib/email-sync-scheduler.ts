import 'server-only'

import path from 'node:path'
import { tmpdir } from 'node:os'
import { open, readFile, stat, unlink, utimes } from 'node:fs/promises'

export type EmailSyncSource = 'manual' | 'auto'

type SchedulerMechanism = 'server_process' | 'external_scheduler_only' | 'disabled'

type EmailSyncSchedulerState = {
  started: boolean
  tickCount: number
  enabled: boolean
  intervalMs: number
  mechanism: SchedulerMechanism
  running: boolean
  startedAt: string | null
  lastStartedBy: string | null
  lastHeartbeatAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastSkipAt: string | null
  lastError: string | null
  lastRunSource: EmailSyncSource | null
  lockFilePath: string
  timer: NodeJS.Timeout | null
  runner: (() => Promise<unknown>) | null
}

declare global {
  var __crmEmailSyncSchedulerState: EmailSyncSchedulerState | undefined
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const LOCK_FILE_PATH = path.join(tmpdir(), 'crm-inmobiliario-email-sync.lock')
const MIN_LOCK_TTL_MS = 60_000
const DEFAULT_LOCK_TTL_FLOOR_MS = 15 * 60 * 1000
const LOCK_HEARTBEAT_INTERVAL_MS = 60_000

function resolveIntervalMs() {
  const raw = process.env.EMAIL_SYNC_POLL_INTERVAL_MS?.trim()
  const parsed = raw ? Number(raw) : DEFAULT_INTERVAL_MS
  if (!Number.isFinite(parsed) || parsed < 60_000) return DEFAULT_INTERVAL_MS
  return parsed
}

function resolveLockTtlMs(intervalMs: number) {
  const raw = process.env.EMAIL_SYNC_LOCK_TTL_MS?.trim()
  const parsed = raw ? Number(raw) : NaN
  if (Number.isFinite(parsed) && parsed >= MIN_LOCK_TTL_MS) return parsed
  return Math.max(intervalMs * 3, DEFAULT_LOCK_TTL_FLOOR_MS)
}

function resolveServerPollingEnabled() {
  const raw = process.env.EMAIL_SYNC_SERVER_POLLING?.trim()?.toLowerCase()
  if (!raw) return true
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

function getState(): EmailSyncSchedulerState {
  if (!globalThis.__crmEmailSyncSchedulerState) {
    globalThis.__crmEmailSyncSchedulerState = {
      started: false,
      tickCount: 0,
      enabled: resolveServerPollingEnabled(),
      intervalMs: resolveIntervalMs(),
      mechanism: resolveServerPollingEnabled()
        ? 'server_process'
        : process.env.EMAIL_SYNC_CRON_SECRET
        ? 'external_scheduler_only'
        : 'disabled',
      running: false,
      startedAt: null,
      lastStartedBy: null,
      lastHeartbeatAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastSkipAt: null,
      lastError: null,
      lastRunSource: null,
      lockFilePath: LOCK_FILE_PATH,
      timer: null,
      runner: null,
    }
  }

  const state = globalThis.__crmEmailSyncSchedulerState
  state.enabled = resolveServerPollingEnabled()
  state.intervalMs = resolveIntervalMs()
  state.mechanism = state.enabled
    ? 'server_process'
    : process.env.EMAIL_SYNC_CRON_SECRET
    ? 'external_scheduler_only'
    : 'disabled'

  return state
}

function nowIso() {
  return new Date().toISOString()
}

function errorMessage(error: unknown) {
  if (!error) return String(error ?? 'Unknown email sync error')
  if (error instanceof Error) return error.message
  if (error instanceof Promise) return 'Pending promise was rejected (async error)'
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    if (Object.hasOwn(obj, 'message') && typeof obj.message === 'string') return obj.message
    if (Object.hasOwn(obj, 'code') && typeof obj.code === 'string') return obj.code
    if (Object.hasOwn(obj, 'reason') && typeof obj.reason === 'string') return obj.reason
    if (obj.cause instanceof Error) return obj.cause.message
    if (obj.cause && typeof obj.cause === 'object' && 'message' in obj.cause) return String((obj.cause as Record<string, unknown>).message)
    try {
      const keys = Object.getOwnPropertyNames(obj)
      const desc = keys.filter(k => k !== 'stack' && k !== 'name').map(k => `${k}:${JSON.stringify(obj[k])}`).join(',')
      if (desc) return `{${desc}}`
    } catch {}
  }
  return String(Object.prototype.toString.call(error))
}

export class EmailSyncLockedError extends Error {
  constructor(message = 'Email inbox sync already running on the server') {
    super(message)
    this.name = 'EmailSyncLockedError'
  }
}

function schedulerLog(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.info(`[email sync scheduler] ${message}`, details)
    return
  }

  console.info(`[email sync scheduler] ${message}`)
}

export async function runEmailInboxSyncWithServerLock<T>(source: EmailSyncSource, runner: () => Promise<T>) {
  const state = getState()
  const startedAt = nowIso()
  const lockTtlMs = resolveLockTtlMs(state.intervalMs)
  const handle = await acquireLockHandle({ source, startedAt, lockTtlMs })

  if (!handle) {
    state.lastHeartbeatAt = startedAt
    state.lastSkipAt = startedAt
    state.lastRunSource = source
    state.lastError = 'Skipped because another email inbox sync is already running'
    schedulerLog('tick skipped', { source, at: startedAt, reason: 'lock_active' })
    throw new EmailSyncLockedError()
  }

  state.running = true
  state.lastHeartbeatAt = startedAt
  state.lastRunSource = source

  schedulerLog('lock acquired', { source, at: startedAt, lockFilePath: state.lockFilePath })
  try {
    await handle.writeFile(
      JSON.stringify({
        pid: process.pid,
        source,
        startedAt,
      })
    )
  } catch (error) {
    console.error('[email sync scheduler] lock metadata write failed', {
      source,
      at: startedAt,
      error: errorMessage(error),
    })
  }

  const heartbeatTimer = setInterval(() => {
    void utimes(LOCK_FILE_PATH, new Date(), new Date()).catch((error) => {
      console.error('[email sync scheduler] lock heartbeat failed', {
        source,
        at: nowIso(),
        error: errorMessage(error),
      })
    })
  }, LOCK_HEARTBEAT_INTERVAL_MS)

  heartbeatTimer.unref?.()

  try {
    const result = await runner()
    state.lastHeartbeatAt = nowIso()
    state.lastSuccessAt = state.lastHeartbeatAt
    state.lastError = null
    return result
  } catch (error) {
    state.lastHeartbeatAt = nowIso()
    state.lastFailureAt = state.lastHeartbeatAt
    state.lastError = errorMessage(error)
    throw error
  } finally {
    clearInterval(heartbeatTimer)
    state.running = false
    try {
      await releaseLockHandle(handle)
      schedulerLog('lock released', { source, at: nowIso(), lockFilePath: state.lockFilePath })
    } catch (error) {
      console.error('[email sync scheduler] lock release failed', {
        source,
        at: nowIso(),
        error: errorMessage(error),
      })
    }
  }
}

async function acquireLockHandle(params: { source: EmailSyncSource; startedAt: string; lockTtlMs: number }) {
  try {
    return await open(LOCK_FILE_PATH, 'wx')
  } catch (error) {
    if (!(typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST')) throw error

    const { source, startedAt, lockTtlMs } = params

    let mtimeMs: number | null = null
    try {
      const lockStat = await stat(LOCK_FILE_PATH)
      mtimeMs = lockStat.mtimeMs
    } catch (statError) {
      if (typeof statError === 'object' && statError && 'code' in statError && statError.code === 'ENOENT') {
        // Race: the file disappeared between open and stat. Retry once.
        return await open(LOCK_FILE_PATH, 'wx')
      }
      throw statError
    }

    const ageMs = Date.now() - mtimeMs
    if (ageMs <= lockTtlMs) return null

    let lockMeta: unknown = null
    try {
      const raw = await readFile(LOCK_FILE_PATH, 'utf8')
      if (raw.trim()) lockMeta = JSON.parse(raw)
    } catch {
      // Best-effort only.
    }

    schedulerLog('lock stale detected', {
      source,
      at: startedAt,
      lockFilePath: LOCK_FILE_PATH,
      ageMs,
      ttlMs: lockTtlMs,
      meta: lockMeta,
    })

    try {
      await unlink(LOCK_FILE_PATH)
      schedulerLog('lock recovery applied', { source, at: startedAt, lockFilePath: LOCK_FILE_PATH })
    } catch (unlinkError) {
      if (typeof unlinkError === 'object' && unlinkError && 'code' in unlinkError && unlinkError.code === 'ENOENT') {
        schedulerLog('lock recovery applied', { source, at: startedAt, lockFilePath: LOCK_FILE_PATH })
      } else {
        console.error('[email sync scheduler] lock recovery failed', {
          source,
          at: startedAt,
          error: errorMessage(unlinkError),
        })
        return null
      }
    }

    try {
      return await open(LOCK_FILE_PATH, 'wx')
    } catch (retryError) {
      if (typeof retryError === 'object' && retryError && 'code' in retryError && retryError.code === 'EEXIST') return null
      throw retryError
    }
  }
}

async function releaseLockHandle(handle: Awaited<ReturnType<typeof open>>) {
  await handle.close()
  await unlink(LOCK_FILE_PATH)
}

export function getEmailSyncSchedulerSnapshot() {
  const state = getState()
  return {
    started: state.started,
    enabled: state.enabled,
    tickCount: state.tickCount,
    mechanism: state.mechanism,
    intervalMs: state.intervalMs,
    running: state.running,
    startedAt: state.startedAt,
    lastStartedBy: state.lastStartedBy,
    lastHeartbeatAt: state.lastHeartbeatAt,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    lastSkipAt: state.lastSkipAt,
    lastError: state.lastError,
    lastRunSource: state.lastRunSource,
    lockFilePath: state.lockFilePath,
    routeEnabled: Boolean(process.env.EMAIL_SYNC_CRON_SECRET?.trim()),
  }
}

export function startEmailSyncScheduler(runner: () => Promise<unknown>, trigger: string = 'unknown') {
  const state = getState()
  state.runner = runner

  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return

  if (state.started && state.timer) {
    return
  }

  state.started = true
  state.startedAt = state.startedAt || nowIso()
  state.lastStartedBy = trigger
  state.lastHeartbeatAt = nowIso()

  schedulerLog('started', {
    trigger,
    enabled: state.enabled,
    intervalMs: state.intervalMs,
    pid: process.pid,
  })

  if (!state.enabled) return

  const tick = async () => {
    const tickAt = nowIso()
    state.lastHeartbeatAt = tickAt
    state.tickCount += 1
    schedulerLog('tick started', {
      tickCount: state.tickCount,
      at: tickAt,
      trigger,
    })

    try {
      if (!state.runner) throw new Error('Email sync scheduler runner is not configured')
      await state.runner()
      state.lastHeartbeatAt = nowIso()
      schedulerLog('tick success', {
        tickCount: state.tickCount,
        at: state.lastHeartbeatAt,
      })
    } catch (error) {
      if (error instanceof EmailSyncLockedError) return
      state.lastFailureAt = nowIso()
      state.lastError = errorMessage(error)
      console.error('[email sync scheduler] tick failed', {
        tickCount: state.tickCount,
        at: state.lastFailureAt,
        error: state.lastError,
      })
    }
  }

  void tick()

  state.timer = setInterval(() => {
    void tick()
  }, state.intervalMs)

  state.timer.unref?.()
}

export function ensureEmailSyncSchedulerStarted(runner: () => Promise<unknown>, trigger: string) {
  startEmailSyncScheduler(runner, trigger)
}

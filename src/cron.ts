import { eq, lt } from 'drizzle-orm'
import { getDb, monitors, statusLogs, heartbeatTokens, settings } from './db'
import { checkHttp, checkDns, checkPing } from './services/checker'
import { checkHeartbeat } from './services/heartbeat-checker'
import { processAlert, getLocale } from './services/alert-manager'
import type { Env } from './index'

let cachedOrigin: { colo: string; countryCode: string; originIp: string } | null = null
let cachedOriginAt = 0
const ORIGIN_TTL_MS = 5 * 60 * 1000

async function getWorkerOrigin(): Promise<{ colo: string; countryCode: string; originIp: string } | null> {
  if (cachedOrigin && Date.now() - cachedOriginAt < ORIGIN_TTL_MS) return cachedOrigin
  try {
    const res = await fetch('https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(3000) })
    const text = await res.text()
    const colo = text.match(/^colo=(.+)$/m)?.[1] ?? null
    const loc  = text.match(/^loc=(.+)$/m)?.[1] ?? null
    const ip   = text.match(/^ip=(.+)$/m)?.[1] ?? ''
    if (!colo || !loc) return null
    cachedOrigin = { colo, countryCode: loc, originIp: ip }
    cachedOriginAt = Date.now()
    return cachedOrigin
  } catch {
    return null
  }
}

let lastRetentionCleanupAt = 0
const RETENTION_INTERVAL_MS = 60 * 60 * 1000

const CONCURRENCY = 10

type CheckResult = {
  monitor: typeof monitors.$inferSelect
  logEntry: typeof statusLogs.$inferInsert
  sslStatus?: string
  alertInput: { status: 'up' | 'down'; message: string; responseTimeMs?: number | null }
}

export async function runCron(env: Env): Promise<void> {
  const db = getDb(env.DB)
  const now = Math.floor(Date.now() / 1000)
  const origin = await getWorkerOrigin()

  const allMonitors = await db.select()
    .from(monitors)
    .where(eq(monitors.active, true))

  const due = allMonitors.filter(m => {
    if (!m.lastCheckedAt) return true
    return (now - m.lastCheckedAt) >= m.interval
  })

  if (Date.now() - lastRetentionCleanupAt > RETENTION_INTERVAL_MS) {
    const retentionRow = await db.select().from(settings).where(eq(settings.key, 'retention_days')).get()
    const retentionDays = retentionRow ? parseInt(retentionRow.value, 10) : 90
    const cutoff = now - retentionDays * 86400
    await db.delete(statusLogs).where(lt(statusLogs.checkedAt, cutoff))
    lastRetentionCleanupAt = Date.now()
  }

  if (due.length === 0) return

  const locale = await getLocale(db)

  const checkResults: CheckResult[] = []

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const settled = await Promise.allSettled(
      due.slice(i, i + CONCURRENCY).map(async (monitor): Promise<CheckResult> => {
        try {
          if (monitor.type === 'http') {
            const result = await checkHttp(monitor, locale)
            const sslStatus = monitor.sslCheckEnabled && monitor.url?.startsWith('https://')
              ? (result.sslError ? 'error' : (result.status !== 'down' ? 'ok' : monitor.sslStatus))
              : undefined
            return {
              monitor,
              logEntry: {
                id: crypto.randomUUID(),
                monitorId: monitor.id,
                status: result.status,
                message: result.message,
                responseTimeMs: result.responseTimeMs,
                checkedAt: now,
                colo: origin?.colo ?? null,
                countryCode: origin?.countryCode ?? null,
                originIp: origin?.originIp ?? null,
              },
              sslStatus,
              alertInput: { status: result.status === 'down' ? 'down' : 'up', message: result.message, responseTimeMs: result.responseTimeMs },
            }
          } else if (monitor.type === 'dns') {
            const result = await checkDns(monitor)
            return {
              monitor,
              logEntry: {
                id: crypto.randomUUID(),
                monitorId: monitor.id,
                status: result.status,
                message: result.message,
                responseTimeMs: result.responseTimeMs,
                checkedAt: now,
                colo: origin?.colo ?? null,
                countryCode: origin?.countryCode ?? null,
                originIp: origin?.originIp ?? null,
              },
              alertInput: { status: result.status === 'down' ? 'down' : 'up', message: result.message, responseTimeMs: result.responseTimeMs },
            }
          } else if (monitor.type === 'ping') {
            const result = await checkPing(monitor)
            return {
              monitor,
              logEntry: {
                id: crypto.randomUUID(),
                monitorId: monitor.id,
                status: result.status,
                message: result.message,
                responseTimeMs: result.responseTimeMs,
                checkedAt: now,
                colo: origin?.colo ?? null,
                countryCode: origin?.countryCode ?? null,
                originIp: origin?.originIp ?? null,
              },
              alertInput: { status: result.status === 'down' ? 'down' : 'up', message: result.message, responseTimeMs: result.responseTimeMs },
            }
          } else {
            const hb = await db.query.heartbeatTokens.findFirst({
              where: eq(heartbeatTokens.monitorId, monitor.id),
            })
            const result = checkHeartbeat(monitor, hb?.lastPingAt ?? null, now, locale)
            return {
              monitor,
              logEntry: {
                id: crypto.randomUUID(),
                monitorId: monitor.id,
                status: result.status,
                message: result.logKey ?? result.message,
                responseTimeMs: null,
                checkedAt: now,
                colo: origin?.colo ?? null,
                countryCode: origin?.countryCode ?? null,
                originIp: origin?.originIp ?? null,
              },
              alertInput: { status: result.status, message: result.message },
            }
          }
        } catch (err) {
          return {
            monitor,
            logEntry: {
              id: crypto.randomUUID(),
              monitorId: monitor.id,
              status: 'down',
              message: `Internal error: ${String(err)}`,
              responseTimeMs: null,
              checkedAt: now,
              colo: origin?.colo ?? null,
              countryCode: origin?.countryCode ?? null,
              originIp: origin?.originIp ?? null,
            },
            alertInput: { status: 'down', message: `Internal error: ${String(err)}` },
          }
        }
      })
    )
    for (const r of settled) {
      if (r.status === 'fulfilled') checkResults.push(r.value)
    }
  }

  if (checkResults.length === 0) return

  for (const r of checkResults) {
    await db.insert(statusLogs).values(r.logEntry)
  }

  for (let i = 0; i < checkResults.length; i += CONCURRENCY) {
    await Promise.allSettled(
      checkResults.slice(i, i + CONCURRENCY).map(r => {
        const updateSet: Record<string, unknown> = { lastCheckedAt: now, lastStatus: r.logEntry.status }
        if (r.sslStatus !== undefined) updateSet.sslStatus = r.sslStatus
        return db.update(monitors).set(updateSet).where(eq(monitors.id, r.monitor.id))
      })
    )
  }

  for (let i = 0; i < checkResults.length; i += CONCURRENCY) {
    await Promise.allSettled(
      checkResults.slice(i, i + CONCURRENCY).map(r =>
        processAlert({
          db,
          monitor: r.monitor,
          status: r.alertInput.status,
          message: r.alertInput.message,
          responseTimeMs: r.alertInput.responseTimeMs,
          encryptionKey: env.ENCRYPTION_KEY,
        }).catch(err => console.error(`[cron] alert error for ${r.monitor.id}:`, err))
      )
    )
  }
}

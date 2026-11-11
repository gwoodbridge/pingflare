import { and, gte, inArray, lt, sql } from 'drizzle-orm'
import { statusDaily, statusLogs } from '../db/schema'
import type { Db } from '../db'

export type DailyRow = { monitorId: string; day: string; ups: number; total: number }

export const HISTORY_DAYS = 90
/** A day counts as finished this long after UTC midnight, so check rows the cron writes just after midnight still land in it. */
const SETTLE_SECONDS = 10 * 60

const DAY_SECONDS = 86400

export function utcDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10)
}

function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 1000
}

/** Aggregate raw status_logs into per-monitor, per-day counts for [from, to). */
async function aggregateRaw(db: Db, monitorIds: string[], from: number, to?: number): Promise<DailyRow[]> {
  if (monitorIds.length === 0) return []
  const dayExpr = sql<string>`strftime('%Y-%m-%d', ${statusLogs.checkedAt}, 'unixepoch')`
  const conds = [inArray(statusLogs.monitorId, monitorIds), gte(statusLogs.checkedAt, from)]
  if (to !== undefined) conds.push(lt(statusLogs.checkedAt, to))
  return db.select({
    monitorId: statusLogs.monitorId,
    day: dayExpr.as('day'),
    ups: sql<number>`SUM(CASE WHEN ${statusLogs.status} = 'up' THEN 1 ELSE 0 END)`.as('ups'),
    total: sql<number>`COUNT(*)`.as('total'),
  })
    .from(statusLogs)
    .where(and(...conds))
    .groupBy(statusLogs.monitorId, dayExpr)
}

/**
 * Per-day check counts for the last HISTORY_DAYS UTC days (today included).
 *
 * Finished days are read from the status_daily rollup. A finished day that is
 * not in the rollup yet is aggregated from status_logs once and stored (a row
 * with total = 0 records "no checks that day"). Only the unfinished day(s) are
 * aggregated from raw rows on every call, so the cost no longer grows with the
 * 90-day window. Rows with total = 0 are left out of the result.
 */
export async function getDailyStats(db: Db, monitorIds: string[], now: number): Promise<DailyRow[]> {
  if (monitorIds.length === 0) return []

  const firstDay = utcDay(now - (HISTORY_DAYS - 1) * DAY_SECONDS)
  const liveDay = utcDay(now - SETTLE_SECONDS) // today, or yesterday right after midnight
  const liveFrom = dayStart(liveDay)

  const finishedDays: string[] = []
  for (let t = dayStart(firstDay); t < liveFrom; t += DAY_SECONDS) finishedDays.push(utcDay(t))

  const stored = finishedDays.length === 0 ? [] : await db.select().from(statusDaily).where(and(
    inArray(statusDaily.monitorId, monitorIds),
    gte(statusDaily.day, firstDay),
    lt(statusDaily.day, liveDay),
  ))

  const have = new Set(stored.map(r => `${r.monitorId}|${r.day}`))
  const missing: { monitorId: string; day: string }[] = []
  for (const monitorId of monitorIds) {
    for (const day of finishedDays) {
      if (!have.has(`${monitorId}|${day}`)) missing.push({ monitorId, day })
    }
  }

  let filled: DailyRow[] = []
  if (missing.length > 0) {
    const missingMonitors = [...new Set(missing.map(m => m.monitorId))]
    const from = dayStart(missing.reduce((min, m) => (m.day < min ? m.day : min), missing[0].day))
    const raw = await aggregateRaw(db, missingMonitors, from, liveFrom)
    const byKey = new Map(raw.map(r => [`${r.monitorId}|${r.day}`, r]))
    filled = missing.map(({ monitorId, day }) => {
      const r = byKey.get(`${monitorId}|${day}`)
      return { monitorId, day, ups: Number(r?.ups ?? 0), total: Number(r?.total ?? 0) }
    })
    // One statement with a single JSON parameter, so D1's bound-parameter
    // limit doesn't apply. Concurrent first calls compute the same values,
    // so a conflicting row is simply kept.
    const payload = JSON.stringify(filled.map(r => [r.monitorId, r.day, r.ups, r.total]))
    await db.run(sql`INSERT INTO status_daily (monitor_id, day, ups, total)
      SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]')
      FROM json_each(${payload}) WHERE 1
      ON CONFLICT (monitor_id, day) DO NOTHING`)
  }

  const live = await aggregateRaw(db, monitorIds, liveFrom)

  return [
    ...stored.map(r => ({ monitorId: r.monitorId, day: r.day, ups: r.ups, total: r.total })),
    ...filled,
    ...live.map(r => ({ monitorId: r.monitorId, day: r.day, ups: Number(r.ups), total: Number(r.total) })),
  ].filter(r => r.total > 0)
}

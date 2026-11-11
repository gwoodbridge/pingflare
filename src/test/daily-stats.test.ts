import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createTestDb, makeEnv, insertMonitor } from './setup'
import { getDailyStats, utcDay } from '../services/daily-stats'
import publicStatusRouter from '../routes/publicStatus'
import { statusDaily, statusLogs, statusPages, statusPageMonitors, monitors } from '../db/schema'
import { ensureSchema, resetMigratedFlag } from '../db/migrate'

type Ctx = Awaited<ReturnType<typeof createTestDb>>

const DAY = 86400
// Fixed "now": 12:00 UTC, well clear of the post-midnight settle window.
const NOW = Date.parse('2026-11-11T12:00:00Z') / 1000

async function insertLog(ctx: Ctx, monitorId: string, status: 'up' | 'down', checkedAt: number) {
  await ctx.db.insert(statusLogs).values({ id: crypto.randomUUID(), monitorId, status, checkedAt, message: status })
}

/** The aggregation the route used to run on every request, as the reference answer. */
function rawReference(ctx: Ctx, monitorId: string, from: number) {
  return ctx.raw.prepare(`SELECT strftime('%Y-%m-%d', checked_at, 'unixepoch') AS day,
      SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS ups, COUNT(*) AS total
    FROM status_logs WHERE monitor_id = ? AND checked_at >= ? GROUP BY day ORDER BY day`)
    .all(monitorId, from) as { day: string; ups: number; total: number }[]
}

describe('getDailyStats', () => {
  let ctx: Ctx
  beforeEach(async () => { ctx = await createTestDb() })

  it('matches a raw aggregation of the 90 displayed days', async () => {
    const mon = await insertMonitor(ctx.db)
    for (let d = 0; d < 95; d++) {
      for (let k = 0; k < 4; k++) await insertLog(ctx, mon, k === 0 && d % 3 === 0 ? 'down' : 'up', NOW - d * DAY - k * 3600)
    }

    const rows = await getDailyStats(ctx.db, [mon], NOW)
    const firstDayStart = Date.parse(`${utcDay(NOW - 89 * DAY)}T00:00:00Z`) / 1000
    const expected = rawReference(ctx, mon, firstDayStart)

    expect(rows.map(r => ({ day: r.day, ups: r.ups, total: r.total })).sort((a, b) => a.day.localeCompare(b.day)))
      .toEqual(expected)
    expect(rows).toHaveLength(90)
  })

  it('stores finished days once and reads them from the rollup afterwards', async () => {
    const mon = await insertMonitor(ctx.db)
    await insertLog(ctx, mon, 'up', NOW - 2 * DAY)
    await insertLog(ctx, mon, 'down', NOW - 2 * DAY + 60)
    await insertLog(ctx, mon, 'up', NOW - 60)

    await getDailyStats(ctx.db, [mon], NOW)
    const stored = await ctx.db.select().from(statusDaily).where(eq(statusDaily.monitorId, mon))
    // 89 finished days, including the ones with no checks (total 0); today is not stored.
    expect(stored).toHaveLength(89)
    expect(stored.find(r => r.day === utcDay(NOW - 2 * DAY))).toMatchObject({ ups: 1, total: 2 })
    expect(stored.find(r => r.day === utcDay(NOW))).toBeUndefined()

    // Past raw rows are no longer read: removing them leaves the history intact.
    ctx.raw.prepare('DELETE FROM status_logs WHERE checked_at < ?').run(NOW - DAY)
    const again = await getDailyStats(ctx.db, [mon], NOW)
    expect(again.find(r => r.day === utcDay(NOW - 2 * DAY))).toMatchObject({ ups: 1, total: 2 })
    expect(again.find(r => r.day === utcDay(NOW))).toMatchObject({ ups: 1, total: 1 })
  })

  it('keeps today live, so new checks show up on the next call', async () => {
    const mon = await insertMonitor(ctx.db)
    await insertLog(ctx, mon, 'up', NOW - 60)
    expect((await getDailyStats(ctx.db, [mon], NOW)).find(r => r.day === utcDay(NOW))?.total).toBe(1)
    await insertLog(ctx, mon, 'down', NOW - 30)
    expect((await getDailyStats(ctx.db, [mon], NOW)).find(r => r.day === utcDay(NOW))).toMatchObject({ ups: 1, total: 2 })
  })

  it('does not finish yesterday until 10 minutes after midnight', async () => {
    const mon = await insertMonitor(ctx.db)
    const midnight = Date.parse('2026-11-11T00:00:00Z') / 1000
    await insertLog(ctx, mon, 'up', midnight - 30)

    const early = midnight + 120
    await getDailyStats(ctx.db, [mon], early)
    const stored = await ctx.db.select().from(statusDaily).where(eq(statusDaily.day, '2026-11-10'))
    expect(stored).toHaveLength(0)

    // A late check for yesterday (cron finishing just after midnight) is still counted.
    await insertLog(ctx, mon, 'down', midnight - 10)
    const rows = await getDailyStats(ctx.db, [mon], early)
    expect(rows.find(r => r.day === '2026-11-10')).toMatchObject({ ups: 1, total: 2 })
  })

  it('backfills a monitor added to a page later', async () => {
    const a = await insertMonitor(ctx.db)
    await getDailyStats(ctx.db, [a], NOW)
    const b = await insertMonitor(ctx.db)
    await insertLog(ctx, b, 'up', NOW - 5 * DAY)
    const rows = await getDailyStats(ctx.db, [a, b], NOW)
    expect(rows.find(r => r.monitorId === b && r.day === utcDay(NOW - 5 * DAY))).toMatchObject({ ups: 1, total: 1 })
  })

  it('rollup rows are removed with their monitor', async () => {
    const mon = await insertMonitor(ctx.db)
    await getDailyStats(ctx.db, [mon], NOW)
    await ctx.db.delete(monitors).where(eq(monitors.id, mon))
    expect(await ctx.db.select().from(statusDaily)).toHaveLength(0)
  })
})

describe('ensureSchema', () => {
  it('runs again on an existing database without errors', async () => {
    const ctx = await createTestDb()
    resetMigratedFlag()
    await expect(ensureSchema(ctx.d1)).resolves.toBeUndefined()
    const cols = ctx.raw.prepare(`SELECT name FROM pragma_table_info('status_pages')`).all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('hide_monitor_urls')
  })
})

describe('GET /api/public/status/:slug edge cache', () => {
  let ctx: Ctx
  const store = new Map<string, Response>()
  const original = (globalThis as { caches?: unknown }).caches

  beforeEach(async () => {
    ctx = await createTestDb()
    store.clear()
    ;(globalThis as { caches?: unknown }).caches = {
      default: {
        match: async (req: Request) => store.get(req.url)?.clone(),
        put: async (req: Request, res: Response) => { store.set(req.url, res) },
      },
    }
  })
  afterEach(() => { (globalThis as { caches?: unknown }).caches = original })

  function get(path: string, headers?: Record<string, string>) {
    const app = new Hono()
    app.route('/api/public/status', publicStatusRouter)
    return app.fetch(new Request(`http://localhost/api/public/status/${path}`, { headers }), makeEnv(ctx.d1))
  }

  async function page(slug: string, passwordHash?: string) {
    const mon = await insertMonitor(ctx.db, { lastStatus: 'up' })
    const pageId = crypto.randomUUID()
    await ctx.db.insert(statusPages).values({ id: pageId, name: 'P', slug, passwordHash })
    await ctx.db.insert(statusPageMonitors).values({ pageId, monitorId: mon, sortOrder: 0 })
    return mon
  }

  it('serves a repeat call from the cache with the same body', async () => {
    const mon = await page('edge')
    const first = await get('edge')
    expect(first.status).toBe(200)
    const body = await first.json() as { overall: string }
    expect(body.overall).toBe('operational')

    // A change in the database is not visible until the cached copy expires.
    await ctx.db.update(monitors).set({ lastStatus: 'down' }).where(eq(monitors.id, mon))
    const second = await get('edge')
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(body)
    expect(store.size).toBe(1)
  })

  it('never caches a password-protected page', async () => {
    const { hashPassword } = await import('../utils')
    await page('locked', await hashPassword('pw'))
    expect((await get('locked', { 'x-status-password': 'pw' })).status).toBe(200)
    expect(store.size).toBe(0)
    expect((await get('locked')).status).toBe(401)
  })

  it('skips the cache when a password is passed in the query', async () => {
    await page('q')
    await get('q?password=x')
    expect(store.size).toBe(0)
  })

  it('does not cache a 404', async () => {
    expect((await get('missing')).status).toBe(404)
    expect(store.size).toBe(0)
  })
})

import { Hono } from 'hono'
import { eq, desc, and, gte, inArray, sql } from 'drizzle-orm'
import { getDb, statusPages, statusPageMonitors, monitors, statusLogs, incidents, incidentReports, incidentUpdates, incidentMonitors } from '../db'
import { verifyPassword } from '../utils'
import type { Env } from '../index'

const router = new Hono<{ Bindings: Env }>()

export type Overall = 'operational' | 'degraded' | 'down' | 'unknown'

/** Worst-of rollup across a page's monitor statuses. */
export function rollup(statuses: string[]): Overall {
  if (statuses.length === 0) return 'unknown'
  if (statuses.includes('down')) return 'down'
  if (statuses.includes('degraded')) return 'degraded'
  if (statuses.every(s => s === 'pending')) return 'unknown'
  return 'operational'
}

const OVERALL_COLOR: Record<Overall, string> = {
  operational: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
  unknown: '#9ca3af',
}
const OVERALL_LABEL: Record<Overall, string> = {
  operational: 'All systems operational',
  degraded: 'Degraded performance',
  down: 'Major outage',
  unknown: 'Status unknown',
}

/** Resolve the active monitor rows shown on a status page, in display order. */
async function selectPageMonitors(
  db: ReturnType<typeof getDb>,
  page: typeof statusPages.$inferSelect,
): Promise<typeof monitors.$inferSelect[]> {
  if (page.showAllMonitors) {
    const rows = await db.select().from(monitors).where(eq(monitors.active, true))
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }
  const pm = await db.select().from(statusPageMonitors).where(eq(statusPageMonitors.pageId, page.id))
  pm.sort((a, b) => a.sortOrder - b.sortOrder)
  const ids = pm.map(r => r.monitorId)
  if (ids.length === 0) return []
  const rows = await db.select().from(monitors).where(inArray(monitors.id, ids))
  return ids.map(id => rows.find(r => r.id === id)).filter((m): m is typeof monitors.$inferSelect => !!m)
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!))
}

/** Shields-style two-segment SVG badge. */
function badgeSvg(overall: Overall): string {
  const label = 'status'
  const value = OVERALL_LABEL[overall]
  const color = OVERALL_COLOR[overall]
  const charW = 6.5
  const lw = Math.round(label.length * charW) + 10
  const vw = Math.round(value.length * charW) + 12
  const w = lw + vw
  const lt = escapeXml(label)
  const vt = escapeXml(value)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${lt}: ${vt}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <rect rx="3" width="${w}" height="20" fill="#555"/>
  <rect rx="3" x="${lw}" width="${vw}" height="20" fill="${color}"/>
  <rect rx="3" width="${w}" height="20" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14">${lt}</text>
    <text x="${lw + vw / 2}" y="14">${vt}</text>
  </g>
</svg>`
}

async function getDailyStats(
  db: ReturnType<typeof getDb>,
  monitorIds: string[],
  since90d: number,
) {
  if (monitorIds.length === 0) return []
  const dayExpr = sql<string>`strftime('%Y-%m-%d', datetime(${statusLogs.checkedAt}, 'unixepoch'))`
  return db.select({
    monitorId: statusLogs.monitorId,
    day: dayExpr.as('day'),
    ups: sql<number>`SUM(CASE WHEN ${statusLogs.status} = 'up' THEN 1 ELSE 0 END)`.as('ups'),
    total: sql<number>`COUNT(*)`.as('total'),
  })
    .from(statusLogs)
    .where(and(inArray(statusLogs.monitorId, monitorIds), gte(statusLogs.checkedAt, since90d)))
    .groupBy(statusLogs.monitorId, dayExpr)
}

router.get('/:slug', async (c) => {
  const db = getDb(c.env.DB)
  const slug = c.req.param('slug')

  const page = await db.query.statusPages.findFirst({ where: eq(statusPages.slug, slug) })
  if (!page) return c.json({ error: 'Not found' }, 404)

  if (page.passwordHash) {
    const provided = c.req.header('x-status-password') ?? c.req.query('password')
    const pageInfo = { name: page.name, description: page.description }
    if (!provided) return c.json({ error: 'password_required', protected: true, page: pageInfo }, 401)
    if (!(await verifyPassword(provided, page.passwordHash))) return c.json({ error: 'wrong_password', protected: true, page: pageInfo }, 401)
  }

  let monitorIds: string[]
  let monitorRows: typeof monitors.$inferSelect[]

  if (page.showAllMonitors) {
    monitorRows = await db.select().from(monitors).where(eq(monitors.active, true))
    monitorRows.sort((a, b) => a.name.localeCompare(b.name))
    monitorIds = monitorRows.map(r => r.id)
  } else {
    const pageMonitorRows = await db.select().from(statusPageMonitors)
      .where(eq(statusPageMonitors.pageId, page.id))
    pageMonitorRows.sort((a, b) => a.sortOrder - b.sortOrder)
    monitorIds = pageMonitorRows.map(r => r.monitorId)

    if (monitorIds.length === 0) {
      return c.json({
        page: { name: page.name, description: page.description, protected: !!page.passwordHash },
        overall: 'unknown' as Overall,
        monitors: [],
        incidents: [],
      })
    }

    monitorRows = await db.select().from(monitors).where(inArray(monitors.id, monitorIds))
  }

  if (monitorIds.length === 0) {
    return c.json({
      page: { name: page.name, description: page.description, protected: !!page.passwordHash },
      monitors: [],
      incidents: [],
    })
  }

  const now = Math.floor(Date.now() / 1000)
  const since90d = now - 90 * 86400

  const dailyRows = await getDailyStats(db, monitorIds, since90d)

  const daysByMonitor: Record<string, Record<string, { ups: number; total: number }>> = {}
  const uptimeByMonitor: Record<string, { ups: number; total: number }> = {}

  for (const row of dailyRows) {
    if (!daysByMonitor[row.monitorId]) daysByMonitor[row.monitorId] = {}
    daysByMonitor[row.monitorId][row.day] = { ups: row.ups, total: row.total }

    if (!uptimeByMonitor[row.monitorId]) uptimeByMonitor[row.monitorId] = { ups: 0, total: 0 }
    uptimeByMonitor[row.monitorId].ups += row.ups
    uptimeByMonitor[row.monitorId].total += row.total
  }

  const monitorData = monitorRows.map(m => {
    const days = daysByMonitor[m.id] ?? {}
    const agg = uptimeByMonitor[m.id]
    const uptime90d = agg ? Math.round((agg.ups / agg.total) * 10000) / 100 : null

    const daily = []
    for (let i = 89; i >= 0; i--) {
      const d = new Date((now - i * 86400) * 1000).toISOString().slice(0, 10)
      const e = days[d]
      daily.push({ date: d, uptime: e ? Math.round((e.ups / e.total) * 1000) / 10 : null })
    }

    return { id: m.id, name: m.name, status: m.lastStatus, uptime90d, daily }
  })

  monitorData.sort((a, b) => monitorIds.indexOf(a.id) - monitorIds.indexOf(b.id))

  const incMonitorRows = await db.select().from(incidentMonitors)
    .where(inArray(incidentMonitors.monitorId, monitorIds))
  const incidentIds = [...new Set(incMonitorRows.map(r => r.incidentId))]

  let incidentData: object[] = []
  if (incidentIds.length > 0) {
    const since14d = now - 14 * 86400
    const incRows = await db.select().from(incidentReports)
      .where(inArray(incidentReports.id, incidentIds))
      .orderBy(desc(incidentReports.startedAt))
      .limit(20)

    for (const inc of incRows) {
      if (inc.resolvedAt && inc.resolvedAt < since14d) continue
      const updates = await db.select().from(incidentUpdates)
        .where(eq(incidentUpdates.incidentId, inc.id))
        .orderBy(desc(incidentUpdates.createdAt))
      const affectedMonitorIds = incMonitorRows
        .filter(r => r.incidentId === inc.id)
        .map(r => r.monitorId)
      incidentData.push({ ...inc, updates, monitorIds: affectedMonitorIds })
    }
  }

  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  return c.json({
    page: { name: page.name, description: page.description, protected: !!page.passwordHash },
    overall: rollup(monitorData.map(m => m.status)),
    monitors: monitorData,
    incidents: incidentData,
  })
})

router.get('/:slug/monitors/:monitorId', async (c) => {
  const db = getDb(c.env.DB)
  const slug = c.req.param('slug')
  const monitorId = c.req.param('monitorId')

  const page = await db.query.statusPages.findFirst({ where: eq(statusPages.slug, slug) })
  if (!page) return c.json({ error: 'Not found' }, 404)

  if (page.passwordHash) {
    const provided = c.req.header('x-status-password') ?? c.req.query('password')
    if (!provided) return c.json({ error: 'password_required', protected: true }, 401)
    if (!(await verifyPassword(provided, page.passwordHash))) return c.json({ error: 'wrong_password', protected: true }, 401)
  }

  let monitor: typeof monitors.$inferSelect | undefined
  if (page.showAllMonitors) {
    monitor = await db.query.monitors.findFirst({
      where: and(eq(monitors.id, monitorId), eq(monitors.active, true)),
    })
  } else {
    const rows = await db.select().from(statusPageMonitors)
      .where(and(eq(statusPageMonitors.pageId, page.id), eq(statusPageMonitors.monitorId, monitorId)))
    if (rows.length > 0) {
      monitor = await db.query.monitors.findFirst({ where: eq(monitors.id, monitorId) })
    }
  }
  if (!monitor) return c.json({ error: 'Not found' }, 404)

  const now = Math.floor(Date.now() / 1000)
  const since90d = now - 90 * 86400
  const dayExpr = sql<string>`strftime('%Y-%m-%d', datetime(${statusLogs.checkedAt}, 'unixepoch'))`

  const dailyAgg = await db.select({
    day: dayExpr.as('day'),
    ups: sql<number>`SUM(CASE WHEN ${statusLogs.status} = 'up' THEN 1 ELSE 0 END)`.as('ups'),
    total: sql<number>`COUNT(*)`.as('total'),
  })
    .from(statusLogs)
    .where(and(eq(statusLogs.monitorId, monitorId), gte(statusLogs.checkedAt, since90d)))
    .groupBy(dayExpr)

  const dayMap: Record<string, { ups: number; total: number }> = {}
  let totalUps = 0, totalAll = 0
  for (const row of dailyAgg) {
    dayMap[row.day] = { ups: row.ups, total: row.total }
    totalUps += row.ups
    totalAll += row.total
  }

  const daily = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date((now - i * 86400) * 1000).toISOString().slice(0, 10)
    const e = dayMap[d]
    daily.push({ date: d, uptime: e ? Math.round((e.ups / e.total) * 1000) / 10 : null })
  }

  const since24h = now - 86400
  const logs24h = await db.select()
    .from(statusLogs)
    .where(and(eq(statusLogs.monitorId, monitorId), gte(statusLogs.checkedAt, since24h)))
    .orderBy(desc(statusLogs.checkedAt))

  const withTime = logs24h.filter(l => l.responseTimeMs !== null)
  const avgResponseMs = withTime.length > 0
    ? Math.round(withTime.reduce((s, l) => s + l.responseTimeMs!, 0) / withTime.length)
    : null

  async function uptimeFor(sinceSecs: number): Promise<number | null> {
    const [agg] = await db.select({
      ups: sql<number>`SUM(CASE WHEN ${statusLogs.status} = 'up' THEN 1 ELSE 0 END)`.as('ups'),
      total: sql<number>`COUNT(*)`.as('total'),
    })
      .from(statusLogs)
      .where(and(eq(statusLogs.monitorId, monitorId), gte(statusLogs.checkedAt, sinceSecs)))
    if (!agg || !agg.total) return null
    return Math.round((agg.ups / agg.total) * 10000) / 100
  }

  const monitorIncidents = await db.select().from(incidents)
    .where(eq(incidents.monitorId, monitorId))
    .orderBy(desc(incidents.startedAt))
    .limit(20)

  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  return c.json({
    name: monitor.name,
    type: monitor.type,
    url: monitor.url,
    tags: monitor.tags,
    lastStatus: monitor.lastStatus,
    lastCheckedAt: monitor.lastCheckedAt,
    uptime1: await uptimeFor(since24h),
    uptime7: await uptimeFor(now - 7 * 86400),
    uptime30: await uptimeFor(now - 30 * 86400),
    uptime90: totalAll > 0 ? Math.round((totalUps / totalAll) * 10000) / 100 : null,
    avgResponseMs,
    daily,
    logs: logs24h.slice(0, 200).map(l => ({
      checkedAt: l.checkedAt,
      status: l.status,
      responseTimeMs: l.responseTimeMs,
      message: l.message,
    })),
    incidents: monitorIncidents.map(i => ({
      startedAt: i.startedAt,
      resolvedAt: i.resolvedAt,
      durationSeconds: i.durationSeconds,
    })),
  })
})

// Embeddable SVG badge (e.g. <img src=".../badge.svg">). Non-protected pages only.
router.get('/:slug/badge.svg', async (c) => {
  const db = getDb(c.env.DB)
  const page = await db.query.statusPages.findFirst({ where: eq(statusPages.slug, c.req.param('slug')) })

  let overall: Overall = 'unknown'
  if (page && !page.passwordHash) {
    const mons = await selectPageMonitors(db, page)
    overall = rollup(mons.map(m => m.lastStatus))
  }

  c.header('Content-Type', 'image/svg+xml; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  return c.body(badgeSvg(overall))
})

// Footer embed: <script src=".../embed.js"></script> injects a live status pill.
router.get('/:slug/embed.js', (c) => {
  const slug = c.req.param('slug')
  const origin = new URL(c.req.url).origin
  const api = JSON.stringify(`${origin}/api/public/status/${encodeURIComponent(slug)}`)
  const pageUrl = JSON.stringify(`${origin}/s/${encodeURIComponent(slug)}`)

  const js = `(function(){
  var API=${api},PAGE=${pageUrl};
  var COLORS={operational:"#22c55e",degraded:"#f59e0b",down:"#ef4444",unknown:"#9ca3af"};
  var LABELS={operational:"All systems operational",degraded:"Degraded performance",down:"Major outage",unknown:"Status unknown"};
  var me=document.currentScript;
  var badge=document.createElement("a");
  badge.href=PAGE;badge.target="_blank";badge.rel="noopener";
  badge.style.cssText="display:inline-flex;align-items:center;gap:6px;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;text-decoration:none;color:inherit";
  var dot=document.createElement("span");
  dot.style.cssText="width:8px;height:8px;border-radius:50%;background:#9ca3af;flex:0 0 auto";
  var text=document.createElement("span");text.textContent="Loading status\\u2026";
  badge.appendChild(dot);badge.appendChild(text);
  if(me&&me.parentNode){me.parentNode.insertBefore(badge,me.nextSibling);}else{document.body.appendChild(badge);}
  function paint(o){var k=COLORS[o]?o:"unknown";dot.style.background=COLORS[k];text.textContent=LABELS[k];}
  function load(){fetch(API,{cache:"no-store"}).then(function(r){return r.json();}).then(function(d){paint(d&&d.overall);}).catch(function(){paint("unknown");});}
  load();setInterval(load,60000);
})();`

  c.header('Content-Type', 'application/javascript; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=300')
  return c.body(js)
})

export default router

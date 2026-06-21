import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, monitors, heartbeatTokens, alertState, monitorNotifications, statusLogs, incidents } from '../db'
import { requireAuth } from '../middleware/auth'
import type { Env } from '../index'

const router = new Hono<{ Bindings: Env }>()
router.use('*', requireAuth)

router.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select().from(monitors)
  return c.json(rows)
})

router.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const monitor = await db.query.monitors.findFirst({
    where: eq(monitors.id, c.req.param('id')),
  })
  if (!monitor) return c.json({ error: 'Not found' }, 404)
  return c.json(monitor)
})

router.post('/', async (c) => {
  const db = getDb(c.env.DB)
  const body = await c.req.json()
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  await db.insert(monitors).values({
    id,
    name: body.name,
    type: body.type,
    tags: JSON.stringify(body.tags ?? []),
    interval: body.interval ?? 60,
    active: body.active ?? true,
    lastStatus: 'pending',
    reminderIntervalHours: body.reminderIntervalHours ?? null,
    toleranceFailures: body.toleranceFailures ?? 1,
    url: body.url ?? null,
    method: body.method ?? 'GET',
    body: body.body ?? null,
    headers: JSON.stringify(body.headers ?? {}),
    expectedStatus: body.expectedStatus ?? 200,
    followRedirects: body.followRedirects ?? true,
    timeout: body.timeout ?? 30,
    ipVersion: body.ipVersion ?? 'auto',
    authType: body.authType ?? 'none',
    authUsername: body.authUsername ?? null,
    authPassword: body.authPassword ?? null,
    authToken: body.authToken ?? null,
    heartbeatInterval: body.heartbeatInterval ?? null,
    heartbeatGrace: body.heartbeatGrace ?? 30,
    toleranceMissed: body.toleranceMissed ?? 1,
    surgeProtectionLimit: body.surgeProtectionLimit ?? null,
    sslCheckEnabled: body.sslCheckEnabled ?? false,
    cacheBooster: body.cacheBooster ?? false,
    dnsHostname: body.dnsHostname ?? null,
    dnsRecordType: body.dnsRecordType ?? 'A',
    dnsResolverUrl: body.dnsResolverUrl ?? null,
    dnsExpectedIp: body.dnsExpectedIp ?? null,
    contentCheck: body.contentCheck ? JSON.stringify(body.contentCheck) : null,
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(alertState).values({ monitorId: id })

  if (body.type === 'heartbeat') {
    await db.insert(heartbeatTokens).values({
      monitorId: id,
      token: crypto.randomUUID(),
    })
  }

  if (Array.isArray(body.channelIds)) {
    for (const channelId of body.channelIds) {
      await db.insert(monitorNotifications).values({ monitorId: id, channelId })
    }
  }

  const created = await db.query.monitors.findFirst({ where: eq(monitors.id, id) })
  return c.json(created, 201)
})

router.put('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const body = await c.req.json()
  const now = Math.floor(Date.now() / 1000)

  const existing = await db.query.monitors.findFirst({ where: eq(monitors.id, id) })
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await db.update(monitors).set({
    name: body.name ?? existing.name,
    tags: body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
    interval: body.interval ?? existing.interval,
    active: body.active ?? existing.active,
    reminderIntervalHours: body.reminderIntervalHours ?? existing.reminderIntervalHours,
    toleranceFailures: body.toleranceFailures ?? existing.toleranceFailures,
    url: body.url ?? existing.url,
    method: body.method ?? existing.method,
    body: body.body ?? existing.body,
    headers: body.headers !== undefined ? JSON.stringify(body.headers) : existing.headers,
    expectedStatus: body.expectedStatus ?? existing.expectedStatus,
    followRedirects: body.followRedirects ?? existing.followRedirects,
    timeout: body.timeout ?? existing.timeout,
    ipVersion: body.ipVersion ?? existing.ipVersion,
    authType: body.authType ?? existing.authType,
    authUsername: body.authUsername ?? existing.authUsername,
    authPassword: body.authPassword ?? existing.authPassword,
    authToken: body.authToken ?? existing.authToken,
    heartbeatInterval: body.heartbeatInterval ?? existing.heartbeatInterval,
    heartbeatGrace: body.heartbeatGrace ?? existing.heartbeatGrace,
    toleranceMissed: body.toleranceMissed ?? existing.toleranceMissed,
    surgeProtectionLimit: body.surgeProtectionLimit ?? existing.surgeProtectionLimit,
    sslCheckEnabled: body.sslCheckEnabled ?? existing.sslCheckEnabled,
    cacheBooster: body.cacheBooster ?? existing.cacheBooster,
    dnsHostname: body.dnsHostname ?? existing.dnsHostname,
    dnsRecordType: body.dnsRecordType ?? existing.dnsRecordType,
    dnsResolverUrl: body.dnsResolverUrl ?? existing.dnsResolverUrl,
    dnsExpectedIp: body.dnsExpectedIp ?? existing.dnsExpectedIp,
    contentCheck: body.contentCheck !== undefined
      ? (body.contentCheck ? JSON.stringify(body.contentCheck) : null)
      : existing.contentCheck,
    updatedAt: now,
  }).where(eq(monitors.id, id))

  if (Array.isArray(body.channelIds)) {
    await db.delete(monitorNotifications).where(eq(monitorNotifications.monitorId, id))
    for (const channelId of body.channelIds) {
      await db.insert(monitorNotifications).values({ monitorId: id, channelId })
    }
  }

  const updated = await db.query.monitors.findFirst({ where: eq(monitors.id, id) })
  return c.json(updated)
})

router.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  await db.delete(monitors).where(eq(monitors.id, id))
  return c.json({ ok: true })
})

router.get('/:id/heartbeat-token', async (c) => {
  const db = getDb(c.env.DB)
  const token = await db.query.heartbeatTokens.findFirst({
    where: eq(heartbeatTokens.monitorId, c.req.param('id')),
  })
  if (!token) return c.json({ error: 'Not a heartbeat monitor' }, 404)
  return c.json(token)
})

router.post('/:id/heartbeat-token/regenerate', async (c) => {
  const db = getDb(c.env.DB)
  const id = c.req.param('id')
  const newToken = crypto.randomUUID()
  await db.update(heartbeatTokens)
    .set({ token: newToken })
    .where(eq(heartbeatTokens.monitorId, id))
  return c.json({ token: newToken })
})

router.post('/:id/reset-stats', async (c) => {
  const db = getDb(c.env.DB)
  const id = c.req.param('id')

  const monitor = await db.query.monitors.findFirst({ where: eq(monitors.id, id) })
  if (!monitor) return c.json({ error: 'Not found' }, 404)

  await db.delete(statusLogs).where(eq(statusLogs.monitorId, id))
  await db.delete(incidents).where(eq(incidents.monitorId, id))
  await db.update(alertState).set({
    consecutiveFailures: 0,
    consecutiveMissed: 0,
    alertSentAt: null,
    consecutiveAlerts: 0,
    lastReminderAt: null,
    surgePausedUntil: null,
  }).where(eq(alertState.monitorId, id))
  await db.update(monitors).set({
    lastStatus: 'pending',
    lastCheckedAt: null,
  }).where(eq(monitors.id, id))

  return c.json({ ok: true })
})

router.get('/:id/channels', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select()
    .from(monitorNotifications)
    .where(eq(monitorNotifications.monitorId, c.req.param('id')))
  return c.json(rows.map(r => r.channelId))
})

export default router

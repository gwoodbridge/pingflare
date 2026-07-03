import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, insertMonitor } from './setup'
import { processAlert } from '../services/alert-manager'
import { alertState, incidents, monitorNotifications, monitors, notificationChannels } from '../db/schema'
import { sendNotification } from '../notifications'

vi.mock('../notifications', () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
}))

async function setupMonitorWithChannel(
  db: Awaited<ReturnType<typeof createTestDb>>['db'],
  overrides: Parameters<typeof insertMonitor>[1] = {},
) {
  const monitorId = await insertMonitor(db, { toleranceFailures: 3, ...overrides })
  const monitor = await db.query.monitors.findFirst({ where: eq(monitors.id, monitorId) })
  if (!monitor) throw new Error('monitor not found')

  const channelId = crypto.randomUUID()
  await db.insert(notificationChannels).values({
    id: channelId,
    name: 'Webhook',
    type: 'webhook',
    config: '{"url":"https://example.com/hook"}',
    active: true,
    isDefault: false,
  })
  await db.insert(monitorNotifications).values({ monitorId, channelId })

  return monitor
}

describe('processAlert recovery notifications', () => {
  beforeEach(() => {
    vi.mocked(sendNotification).mockClear()
  })

  it('does not send recovery when service was down below tolerance threshold', async () => {
    const { db } = await createTestDb()
    const monitor = await setupMonitorWithChannel(db)

    await processAlert({ db, monitor, status: 'down', message: 'Connection failed' })

    const state = await db.query.alertState.findFirst({ where: eq(alertState.monitorId, monitor.id) })
    expect(state?.consecutiveFailures).toBe(1)
    expect(state?.alertSentAt).toBeNull()
    expect(sendNotification).not.toHaveBeenCalled()

    await processAlert({
      db,
      monitor: { ...monitor, lastStatus: 'down' },
      status: 'up',
      message: 'OK',
    })

    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends recovery only after a down alert was sent', async () => {
    const { db } = await createTestDb()
    const monitor = await setupMonitorWithChannel(db, { toleranceFailures: 1 })

    await processAlert({ db, monitor, status: 'down', message: 'Fail' })

    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendNotification).mock.calls[0][1].type).toBe('alert')

    await processAlert({
      db,
      monitor: { ...monitor, lastStatus: 'down' },
      status: 'up',
      message: 'Recovered',
    })

    expect(sendNotification).toHaveBeenCalledTimes(2)
    expect(vi.mocked(sendNotification).mock.calls[1][1].type).toBe('recovery')
  })

  it('closes orphaned incidents with recovery when an alert was previously sent', async () => {
    const { db } = await createTestDb()
    const monitor = await setupMonitorWithChannel(db)
    const now = Math.floor(Date.now() / 1000)

    await db.insert(alertState).values({
      monitorId: monitor.id,
      alertSentAt: now - 120,
      consecutiveAlerts: 1,
    })
    await db.insert(incidents).values({
      id: crypto.randomUUID(),
      monitorId: monitor.id,
      startedAt: now - 120,
    })

    await processAlert({
      db,
      monitor: { ...monitor, lastStatus: 'degraded' },
      status: 'up',
      message: 'OK',
    })

    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendNotification).mock.calls[0][1].type).toBe('recovery')

    const open = await db.query.incidents.findFirst({
      where: (i, { and, eq, isNull }) => and(eq(i.monitorId, monitor.id), isNull(i.resolvedAt)),
    })
    expect(open).toBeUndefined()
  })
})

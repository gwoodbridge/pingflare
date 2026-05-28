import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'
import monitorRoutes from './routes/monitors'
import heartbeatRoutes from './routes/heartbeat'
import historyRoutes from './routes/history'
import notificationRoutes from './routes/notifications'
import settingsRoutes from './routes/settings'
import statusPagesRoutes from './routes/statusPages'
import publicStatusRoutes from './routes/publicStatus'
import incidentReportsRoutes from './routes/incidentReports'
import backupRoutes from './routes/backup'
import eventsRoutes from './routes/events'
import { runCron } from './cron'
import { requireAuth } from './middleware/auth'
import { ensureSchema } from './db/migrate'

export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  ADMIN_USER: string
  ADMIN_PASS: string
  JWT_SECRET: string
  ENCRYPTION_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  await ensureSchema(c.env.DB)
  await next()
})

app.use('/api/*', cors())

app.route('/api/auth', authRoutes)
app.route('/api/monitors', monitorRoutes)
app.route('/h', heartbeatRoutes)
app.route('/api/monitors', historyRoutes)
app.route('/api/notifications', notificationRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/status-pages', statusPagesRoutes)
app.route('/api/public/status', publicStatusRoutes)
app.route('/api/incidents', incidentReportsRoutes)
app.route('/api/backup', backupRoutes)
app.route('/api/events', eventsRoutes)

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))

app.post('/api/cron/run', requireAuth, async (c) => {
  await runCron(c.env)
  return c.json({ ok: true, triggeredAt: Date.now() })
})

app.get('*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw)
  if (res.status === 404) return c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url).href))
  return res
})

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(env))
  },
}

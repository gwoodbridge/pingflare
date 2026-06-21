import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const monitors = sqliteTable('monitors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().$type<'http' | 'heartbeat' | 'dns' | 'ping'>(),
  tags: text('tags').notNull().default('[]'),
  interval: integer('interval').notNull().default(60),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  lastCheckedAt: integer('last_checked_at'),
  lastStatus: text('last_status').notNull().default('pending').$type<'up' | 'down' | 'degraded' | 'pending'>(),
  reminderIntervalHours: integer('reminder_interval_hours'),
  toleranceFailures: integer('tolerance_failures').notNull().default(1),
  url: text('url'),
  method: text('method').notNull().default('GET'),
  body: text('body'),
  headers: text('headers').notNull().default('{}'),
  expectedStatus: integer('expected_status').notNull().default(200),
  followRedirects: integer('follow_redirects', { mode: 'boolean' }).notNull().default(true),
  timeout: integer('timeout').notNull().default(30),
  ipVersion: text('ip_version').notNull().default('auto').$type<'auto' | 'ipv4' | 'ipv6'>(),
  authType: text('auth_type').notNull().default('none').$type<'none' | 'basic' | 'digest' | 'bearer'>(),
  authUsername: text('auth_username'),
  authPassword: text('auth_password'),
  authToken: text('auth_token'),
  heartbeatInterval: integer('heartbeat_interval'),
  heartbeatGrace: integer('heartbeat_grace').notNull().default(30),
  toleranceMissed: integer('tolerance_missed').notNull().default(1),
  surgeProtectionLimit: integer('surge_protection_limit'),
  sslCheckEnabled: integer('ssl_check_enabled', { mode: 'boolean' }).notNull().default(false),
  sslStatus: text('ssl_status').notNull().default('unknown').$type<'ok' | 'error' | 'unknown'>(),
  cacheBooster: integer('cache_booster', { mode: 'boolean' }).notNull().default(false),
  dnsHostname: text('dns_hostname'),
  dnsRecordType: text('dns_record_type').default('A'),
  dnsResolverUrl: text('dns_resolver_url'),
  dnsExpectedIp: text('dns_expected_ip'),
  contentCheck: text('content_check'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('idx_monitors_active').on(t.active),
])

export const statusLogs = sqliteTable('status_logs', {
  id: text('id').primaryKey(),
  monitorId: text('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  status: text('status').notNull().$type<'up' | 'down' | 'degraded' | 'pending'>(),
  message: text('message'),
  responseTimeMs: integer('response_time_ms'),
  checkedAt: integer('checked_at').notNull(),
  colo: text('colo'),
  countryCode: text('country_code'),
  originIp: text('origin_ip'),
}, (t) => [
  index('idx_sl_monitor_checked').on(t.monitorId, t.checkedAt),
  index('idx_sl_checked_at').on(t.checkedAt),
])

export const incidents = sqliteTable('incidents', {
  id: text('id').primaryKey(),
  monitorId: text('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at').notNull(),
  resolvedAt: integer('resolved_at'),
  durationSeconds: integer('duration_seconds'),
})

export const notificationChannels = sqliteTable('notification_channels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().$type<'discord' | 'slack' | 'telegram' | 'email' | 'ntfy' | 'pushover' | 'webhook' | 'apprise' | 'googlechat'>(),
  config: text('config').notNull().default('{}'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const monitorNotifications = sqliteTable('monitor_notifications', {
  monitorId: text('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => notificationChannels.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.monitorId, t.channelId] })])

export const heartbeatTokens = sqliteTable('heartbeat_tokens', {
  monitorId: text('monitor_id').primaryKey().references(() => monitors.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  lastPingAt: integer('last_ping_at'),
})

export const alertState = sqliteTable('alert_state', {
  monitorId: text('monitor_id').primaryKey().references(() => monitors.id, { onDelete: 'cascade' }),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  consecutiveMissed: integer('consecutive_missed').notNull().default(0),
  alertSentAt: integer('alert_sent_at'),
  consecutiveAlerts: integer('consecutive_alerts').notNull().default(0),
  lastReminderAt: integer('last_reminder_at'),
  surgePausedUntil: integer('surge_paused_until'),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const statusPages = sqliteTable('status_pages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  passwordHash: text('password_hash'),
  showAllMonitors: integer('show_all_monitors', { mode: 'boolean' }).notNull().default(false),
  hideMonitorUrls: integer('hide_monitor_urls', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const statusPageMonitors = sqliteTable('status_page_monitors', {
  pageId: text('page_id').notNull().references(() => statusPages.id, { onDelete: 'cascade' }),
  monitorId: text('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.pageId, t.monitorId] })])

export const incidentReports = sqliteTable('incident_reports', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().$type<'investigating' | 'identified' | 'monitoring' | 'resolved'>(),
  startedAt: integer('started_at').notNull().default(sql`(unixepoch())`),
  resolvedAt: integer('resolved_at'),
})

export const incidentUpdates = sqliteTable('incident_updates', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').notNull().references(() => incidentReports.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  status: text('status').notNull().$type<'investigating' | 'identified' | 'monitoring' | 'resolved'>(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
})

export const incidentMonitors = sqliteTable('incident_monitors', {
  incidentId: text('incident_id').notNull().references(() => incidentReports.id, { onDelete: 'cascade' }),
  monitorId: text('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.incidentId, t.monitorId] })])

export type Monitor = typeof monitors.$inferSelect
export type NewMonitor = typeof monitors.$inferInsert
export type StatusLog = typeof statusLogs.$inferSelect
export type Incident = typeof incidents.$inferSelect
export type NotificationChannel = typeof notificationChannels.$inferSelect
export type AlertState = typeof alertState.$inferSelect
export type StatusPage = typeof statusPages.$inferSelect
export type IncidentReport = typeof incidentReports.$inferSelect
export type IncidentUpdate = typeof incidentUpdates.$inferSelect

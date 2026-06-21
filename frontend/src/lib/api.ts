const BASE = '/api'

function getToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem('token')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...init, headers })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
  },

  monitors: {
    list:   () => request<Monitor[]>('/monitors'),
    get:    (id: string) => request<Monitor>(`/monitors/${id}`),
    create: (data: MonitorPayload) => request<Monitor>('/monitors', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: MonitorPayload) => request<Monitor>(`/monitors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/monitors/${id}`, { method: 'DELETE' }),
    toggleActive: (id: string, active: boolean) => request<Monitor>(`/monitors/${id}`, { method: 'PUT', body: JSON.stringify({ active }) }),
    resetStats:  (id: string) => request<{ ok: boolean }>(`/monitors/${id}/reset-stats`, { method: 'POST' }),
    channels:    (id: string) => request<string[]>(`/monitors/${id}/channels`),
    hbToken:     (id: string) => request<{ token: string }>(`/monitors/${id}/heartbeat-token`),
    regenToken:  (id: string) => request<{ token: string }>(`/monitors/${id}/heartbeat-token/regenerate`, { method: 'POST' }),
    logs:        (id: string, hours = 24) => request<StatusLog[]>(`/monitors/${id}/logs?hours=${hours}`),
    recentLogs:  (id: string, limit = 200) => request<StatusLog[]>(`/monitors/${id}/logs?limit=${limit}`),
    checkCount:  (id: string) => request<{ count: number }>(`/monitors/${id}/check-count`),
    incidents:   (id: string) => request<Incident[]>(`/monitors/${id}/incidents`),
    uptime:      (id: string, days = 90) => request<{ uptime: number | null; days: number }>(`/monitors/${id}/uptime?days=${days}`),
    daily:       (id: string, days = 90) => request<DailyUptime[]>(`/monitors/${id}/daily?days=${days}`),
  },

  cron: {
    run: () => request<{ ok: boolean; triggeredAt: number }>('/cron/run', { method: 'POST' }),
  },

  settings: {
    get:    () => request<Record<string, string>>('/settings'),
    update: (data: Record<string, string>) => request<Record<string, string>>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },

  backup: {
    export: () => request<BackupData>('/backup'),
    restore: (data: BackupData) => request<{ ok: boolean }>('/backup/restore', { method: 'POST', body: JSON.stringify(data) }),
  },

  notifications: {
    list:   () => request<NotificationChannel[]>('/notifications'),
    get:    (id: string) => request<NotificationChannel>(`/notifications/${id}`),
    create: (data: NotificationChannelPayload) => request<NotificationChannel>('/notifications', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: NotificationChannelPayload) => request<NotificationChannel>(`/notifications/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/notifications/${id}`, { method: 'DELETE' }),
    test:              (id: string) => request<{ ok: boolean }>(`/notifications/${id}/test`, { method: 'POST' }),
    applyToAllMonitors:(id: string) => request<{ ok: boolean; applied: number }>(`/notifications/${id}/apply-all-monitors`, { method: 'POST' }),
  },

  statusPages: {
    list:    () => request<StatusPage[]>('/status-pages'),
    get:     (id: string) => request<StatusPage>(`/status-pages/${id}`),
    create:  (data: Partial<StatusPage> & { password?: string; monitorIds?: string[] }) =>
               request<StatusPage>('/status-pages', { method: 'POST', body: JSON.stringify(data) }),
    update:  (id: string, data: Partial<StatusPage> & { password?: string; monitorIds?: string[] }) =>
               request<StatusPage>(`/status-pages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete:  (id: string) => request<{ ok: boolean }>(`/status-pages/${id}`, { method: 'DELETE' }),
    monitors: (id: string) => request<string[]>(`/status-pages/${id}/monitors`),
  },

  incidents: {
    list:      () => request<IncidentReport[]>('/incidents'),
    get:       (id: string) => request<IncidentReport>(`/incidents/${id}`),
    create:    (data: { title: string; status: IncidentStatus; message?: string; monitorIds?: string[] }) =>
                 request<IncidentReport>('/incidents', { method: 'POST', body: JSON.stringify(data) }),
    update:    (id: string, data: { title?: string; status?: IncidentStatus; monitorIds?: string[] }) =>
                 request<IncidentReport>(`/incidents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    addUpdate: (id: string, message: string, status: IncidentStatus) =>
                 request<IncidentUpdate>(`/incidents/${id}/updates`, { method: 'POST', body: JSON.stringify({ message, status }) }),
    delete:    (id: string) => request<{ ok: boolean }>(`/incidents/${id}`, { method: 'DELETE' }),
  },
}

export type MonitorStatus = 'up' | 'down' | 'degraded' | 'pending'

export interface ContentCheck {
  mode: 'json' | 'keyword'
  path?: string
  up?: string[]
  degraded?: string[]
  down?: string[]
}

export interface Monitor {
  id: string
  name: string
  type: 'http' | 'heartbeat' | 'dns' | 'ping'
  tags: string
  interval: number
  active: boolean
  lastCheckedAt: number | null
  lastStatus: MonitorStatus
  reminderIntervalHours: number | null
  toleranceFailures: number
  url: string | null
  method: string
  body: string | null
  headers: string
  expectedStatus: number
  followRedirects: boolean
  timeout: number
  ipVersion: 'auto' | 'ipv4' | 'ipv6'
  authType: 'none' | 'basic' | 'digest' | 'bearer'
  authUsername: string | null
  authPassword: string | null
  authToken: string | null
  heartbeatInterval: number | null
  heartbeatGrace: number
  toleranceMissed: number
  surgeProtectionLimit: number | null
  sslCheckEnabled: boolean
  sslStatus: 'ok' | 'error' | 'unknown'
  cacheBooster: boolean
  dnsHostname: string | null
  dnsRecordType: string | null
  dnsResolverUrl: string | null
  dnsExpectedIp: string | null
  contentCheck: string | null
  createdAt: number
  updatedAt: number
}

export interface StatusLog {
  id: string
  monitorId: string
  status: MonitorStatus
  message: string | null
  responseTimeMs: number | null
  checkedAt: number
  colo: string | null
  countryCode: string | null
  originIp: string | null
}

export interface Incident {
  id: string
  monitorId: string
  startedAt: number
  resolvedAt: number | null
  durationSeconds: number | null
}

export interface NotificationChannel {
  id: string
  name: string
  type: 'discord' | 'slack' | 'telegram' | 'email' | 'ntfy' | 'pushover' | 'webhook' | 'apprise' | 'googlechat'
  config: string
  active: boolean
  isDefault: boolean
  createdAt: number
  encryptedFields?: string[]
}

export interface DailyUptime {
  date: string
  uptime: number | null
}

export interface StatusPage {
  id: string
  name: string
  slug: string
  description: string | null
  passwordHash: string | null
  showAllMonitors: boolean
  hideMonitorUrls: boolean
  createdAt: number
}

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved'

export interface IncidentReport {
  id: string
  title: string
  status: IncidentStatus
  startedAt: number
  resolvedAt: number | null
  monitorIds?: string[]
  updates?: IncidentUpdate[]
}

export interface IncidentUpdate {
  id: string
  incidentId: string
  message: string
  status: IncidentStatus
  createdAt: number
}

export interface PublicMonitorStatus {
  id: string
  name: string
  status: MonitorStatus
  uptime90d: number | null
  daily: DailyUptime[]
}

export interface PublicIncident {
  id: string
  title: string
  status: IncidentStatus
  startedAt: number
  resolvedAt: number | null
  updates: IncidentUpdate[]
  monitorIds: string[]
}

export interface PublicStatusPage {
  page: { name: string; description: string | null; protected: boolean }
  overall: 'operational' | 'degraded' | 'down' | 'unknown'
  monitors: PublicMonitorStatus[]
  incidents: PublicIncident[]
}

/** Payload for creating/updating a monitor (headers as object, tags as array) */
export type MonitorPayload = Omit<Partial<Monitor>, 'headers' | 'tags' | 'contentCheck'> & {
  headers?: Record<string, string>
  tags?: string[]
  channelIds?: string[]
  contentCheck?: ContentCheck | null
}

/** Payload for creating/updating a notification channel (config as object) */
export type NotificationChannelPayload = Omit<Partial<NotificationChannel>, 'config'> & {
  config?: Record<string, string>
}

export interface BackupData {
  version: number
  exportedAt: number
  settings: Record<string, string>
  monitors: (Monitor & { channelIds: string[] })[]
  notifications: NotificationChannel[]
  statusPages: (StatusPage & { monitorIds: string[] })[]
}

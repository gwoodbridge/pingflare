import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkPing } from '../services/checker'
import type { Monitor } from '../db/schema'

const base: Monitor = {
  id: 'test-ping',
  name: 'Test Ping',
  type: 'ping',
  tags: '[]',
  interval: 60,
  active: true,
  lastCheckedAt: null,
  lastStatus: 'pending',
  reminderIntervalHours: null,
  toleranceFailures: 1,
  url: 'https://example.com',
  method: 'GET',
  body: null,
  headers: '{}',
  expectedStatus: 200,
  followRedirects: true,
  timeout: 30,
  ipVersion: 'auto',
  authType: 'none',
  authUsername: null,
  authPassword: null,
  authToken: null,
  heartbeatInterval: null,
  heartbeatGrace: 30,
  toleranceMissed: 1,
  surgeProtectionLimit: null,
  sslCheckEnabled: false,
  sslStatus: 'unknown',
  cacheBooster: false,
  dnsHostname: null,
  dnsRecordType: null,
  dnsResolverUrl: null,
  dnsExpectedIp: null,
  contentCheck: null,
  createdAt: 0,
  updatedAt: 0,
}

function mockFetchOk(status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status < 400, status }))
}

function mockFetchError(message: string, name = 'Error') {
  const err = Object.assign(new Error(message), { name })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))
}

describe('checkPing', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns up on HTTP 200', async () => {
    mockFetchOk(200)
    const result = await checkPing(base)
    expect(result.status).toBe('up')
    expect(result.message).toBe('Ping OK · HTTP 200')
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('returns up on HTTP 404 (any HTTP response = up)', async () => {
    mockFetchOk(404)
    const result = await checkPing(base)
    expect(result.status).toBe('up')
    expect(result.message).toBe('Ping OK · HTTP 404')
  })

  it('returns up on HTTP 500', async () => {
    mockFetchOk(500)
    const result = await checkPing(base)
    expect(result.status).toBe('up')
    expect(result.message).toBe('Ping OK · HTTP 500')
  })

  it('returns up on non-HTTP protocol response (TCP connected, port open)', async () => {
    mockFetchError('Response parsing failed: invalid HTTP response')
    const result = await checkPing({ ...base, url: 'http://1.1.1.1:22' })
    expect(result.status).toBe('up')
    expect(result.message).toBe('Ping OK · :22 open')
  })

  it('returns up on port 53 with protocol mismatch', async () => {
    mockFetchError('Invalid character in HTTP response')
    const result = await checkPing({ ...base, url: '1.1.1.1:53' })
    expect(result.status).toBe('up')
    expect(result.message).toBe('Ping OK · :53 open')
  })

  it('returns down on connection refused (ECONNREFUSED)', async () => {
    mockFetchError('connect ECONNREFUSED 1.2.3.4:80')
    const result = await checkPing({ ...base, url: '1.2.3.4' })
    expect(result.status).toBe('down')
    expect(result.message).toContain('ECONNREFUSED')
  })

  it('returns down on host not found (ENOTFOUND)', async () => {
    mockFetchError('getaddrinfo ENOTFOUND nxdomain.invalid')
    const result = await checkPing({ ...base, url: 'nxdomain.invalid' })
    expect(result.status).toBe('down')
    expect(result.message).toContain('ENOTFOUND')
  })

  it('returns down on network unreachable (ENETUNREACH)', async () => {
    mockFetchError('connect ENETUNREACH 10.255.255.1:80')
    const result = await checkPing({ ...base, url: '10.255.255.1' })
    expect(result.status).toBe('down')
  })

  it('returns down on timeout', async () => {
    mockFetchError('Aborted', 'AbortError')
    const result = await checkPing(base)
    expect(result.status).toBe('down')
    expect(result.message).toBe('Timeout after 30s')
  })

  it('respects custom timeout value in down message', async () => {
    mockFetchError('Aborted', 'AbortError')
    const result = await checkPing({ ...base, timeout: 10 })
    expect(result.status).toBe('down')
    expect(result.message).toBe('Timeout after 10s')
  })

  it('sends HEAD request', async () => {
    mockFetchOk(200)
    await checkPing(base)
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('HEAD')
  })

  it('prepends http:// to bare IP', async () => {
    mockFetchOk(200)
    await checkPing({ ...base, url: '1.1.1.1' })
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://1.1.1.1')
  })

  it('prepends http:// to host:port', async () => {
    mockFetchOk(200)
    await checkPing({ ...base, url: '1.1.1.1:8080' })
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://1.1.1.1:8080')
  })

  it('preserves https:// URL unchanged', async () => {
    mockFetchOk(200)
    await checkPing({ ...base, url: 'https://example.com' })
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.com')
  })

  it('preserves http:// URL unchanged', async () => {
    mockFetchOk(200)
    await checkPing({ ...base, url: 'http://example.com:9200' })
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://example.com:9200')
  })
})

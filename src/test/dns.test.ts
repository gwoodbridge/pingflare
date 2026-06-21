import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkDns } from '../services/checker'
import type { Monitor } from '../db/schema'

const base: Monitor = {
  id: 'test-dns',
  name: 'Test DNS',
  type: 'dns',
  tags: '[]',
  interval: 60,
  active: true,
  lastCheckedAt: null,
  lastStatus: 'pending',
  reminderIntervalHours: null,
  toleranceFailures: 1,
  url: null,
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
  dnsHostname: 'example.com',
  dnsRecordType: 'A',
  dnsResolverUrl: 'https://freedns.controld.com/p0',
  dnsExpectedIp: null,
  contentCheck: null,
  createdAt: 0,
  updatedAt: 0,
}

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    headers: { get: (h: string) => h === 'content-type' ? 'application/dns-json' : null },
    json: () => Promise.resolve(body),
  }))
}

describe('checkDns', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns up on NOERROR with one answer', async () => {
    mockFetch({ Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' }] })
    const result = await checkDns(base)
    expect(result.status).toBe('up')
    expect(result.message).toBe('DNS OK · 93.184.216.34')
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('shows all record values in message', async () => {
    mockFetch({
      Status: 0,
      Answer: [
        { name: 'example.com.', type: 1, TTL: 300, data: '1.2.3.4' },
        { name: 'example.com.', type: 1, TTL: 300, data: '5.6.7.8' },
      ],
    })
    const result = await checkDns(base)
    expect(result.message).toBe('DNS OK · 1.2.3.4, 5.6.7.8')
  })

  it('returns up with zero answers when no expectedIp set', async () => {
    mockFetch({ Status: 0 })
    const result = await checkDns(base)
    expect(result.status).toBe('up')
    expect(result.message).toBe('DNS OK')
  })

  it('returns down on NXDOMAIN (Status 3)', async () => {
    mockFetch({ Status: 3 })
    const result = await checkDns(base)
    expect(result.status).toBe('down')
    expect(result.message).toBe('DNS NXDOMAIN')
  })

  it('returns down on SERVFAIL (Status 2)', async () => {
    mockFetch({ Status: 2 })
    const result = await checkDns(base)
    expect(result.status).toBe('down')
    expect(result.message).toBe('DNS SERVFAIL')
  })

  it('returns down on REFUSED (Status 5)', async () => {
    mockFetch({ Status: 5 })
    const result = await checkDns(base)
    expect(result.status).toBe('down')
    expect(result.message).toBe('DNS REFUSED')
  })

  it('returns down on unknown RCODE', async () => {
    mockFetch({ Status: 9 })
    const result = await checkDns(base)
    expect(result.status).toBe('down')
    expect(result.message).toBe('DNS RCODE 9')
  })

  it('returns down when DoH endpoint returns HTTP 500', async () => {
    mockFetch({}, false, 500)
    const result = await checkDns(base)
    expect(result.status).toBe('down')
    expect(result.message).toBe('DoH HTTP 500')
  })

  it('parses binary dns-message response and returns up on NOERROR', async () => {
    // Minimal valid DNS wire response: NOERROR, 1 A record for 1.2.3.4
    // Header: ID=0, flags=0x8180 (QR+RD+RA), QDCOUNT=1, ANCOUNT=1, NSCOUNT=0, ARCOUNT=0
    // Question: \x07example\x03com\x00, QTYPE=A(1), QCLASS=IN(1)
    // Answer: pointer 0xC00C, TYPE=A(1), CLASS=IN(1), TTL=300, RDLEN=4, RDATA=1.2.3.4
    const wire = new Uint8Array([
      0x00, 0x00, 0x81, 0x80, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d, 0x00,
      0x00, 0x01, 0x00, 0x01,
      0xC0, 0x0C, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x01, 0x2C, 0x00, 0x04,
      0x01, 0x02, 0x03, 0x04,
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => h === 'content-type' ? 'application/dns-message' : null },
      arrayBuffer: () => Promise.resolve(wire.buffer),
    }))
    const result = await checkDns(base)
    expect(result.status).toBe('up')
    expect(result.message).toBe('DNS OK · 1.2.3.4')
  })

  it('returns down when response is 200 but JSON is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h: string) => h === 'content-type' ? 'application/dns-json' : null },
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }))
    const result = await checkDns(base)
    expect(result.status).toBe('down')
    expect(result.message).toBe('DoH resolver returned invalid JSON')
  })

  it('passes validation when expectedIp is in the answer', async () => {
    mockFetch({ Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' }] })
    const result = await checkDns({ ...base, dnsExpectedIp: '93.184.216.34' })
    expect(result.status).toBe('up')
  })

  it('returns down when expectedIp does not match', async () => {
    mockFetch({ Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '1.2.3.4' }] })
    const result = await checkDns({ ...base, dnsExpectedIp: '93.184.216.34' })
    expect(result.status).toBe('down')
    expect(result.message).toBe('Expected 93.184.216.34, got 1.2.3.4')
  })

  it('returns down with "no answer" when expectedIp set but answer is empty', async () => {
    mockFetch({ Status: 0, Answer: [] })
    const result = await checkDns({ ...base, dnsExpectedIp: '93.184.216.34' })
    expect(result.status).toBe('down')
    expect(result.message).toContain('no answer')
  })

  it('returns down on fetch timeout', async () => {
    const err = new Error('Aborted')
    err.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))
    const result = await checkDns(base)
    expect(result.status).toBe('down')
    expect(result.message).toContain('Timeout after 30s')
  })

  it('returns down on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))
    const result = await checkDns(base)
    expect(result.status).toBe('down')
    expect(result.message).toContain('Network failure')
  })

  it('appends query params correctly when resolver URL has no existing params', async () => {
    mockFetch({ Status: 0, Answer: [] })
    await checkDns({ ...base, dnsResolverUrl: 'https://freedns.controld.com/p0', dnsHostname: 'my.example.com', dnsRecordType: 'AAAA' })
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://freedns.controld.com/p0?name=my.example.com&type=AAAA')
  })

  it('appends with & when resolver URL already has query params', async () => {
    mockFetch({ Status: 0, Answer: [] })
    await checkDns({ ...base, dnsResolverUrl: 'https://example.com/dns?foo=bar', dnsHostname: 'test.com', dnsRecordType: 'A' })
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.com/dns?foo=bar&name=test.com&type=A')
  })
})

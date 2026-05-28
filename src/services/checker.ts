import { createHash } from 'node:crypto'
import type { Monitor } from '../db/schema'
import { msgTimeoutAfter } from '../notifications/messages'

export interface CheckResult {
  status: 'up' | 'down'
  statusCode?: number
  responseTimeMs: number
  message: string
  sslError?: boolean
}

interface DoHResponse {
  Status: number
  Answer?: Array<{ name: string; type: number; TTL: number; data: string }>
}

const DNS_RCODES: Record<number, string> = {
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
}


interface WireResult { rcode: number; answers: string[] }

function parseDnsWire(buf: ArrayBuffer): WireResult {
  const v = new DataView(buf)
  const flags = v.getUint16(2)
  const rcode = flags & 0xf
  const ancount = v.getUint16(6)
  const answers: string[] = []

  const readName = (start: number): [string, number] => {
    const labels: string[] = []
    let pos = start
    let end = -1
    while (pos < v.byteLength) {
      const len = v.getUint8(pos)
      if (len === 0) { if (end < 0) end = pos + 1; break }
      if ((len & 0xc0) === 0xc0) {
        if (end < 0) end = pos + 2
        pos = ((len & 0x3f) << 8) | v.getUint8(pos + 1)
        continue
      }
      pos++
      let label = ''
      for (let i = 0; i < len; i++) label += String.fromCharCode(v.getUint8(pos++))
      labels.push(label)
    }
    return [labels.join('.'), end < 0 ? pos + 1 : end]
  }

  let off = 12
  const [, afterQ] = readName(off)
  off = afterQ + 4

  for (let i = 0; i < ancount && off < v.byteLength; i++) {
    const [, afterName] = readName(off)
    off = afterName
    const rrtype = v.getUint16(off); off += 2
    off += 2
    off += 4
    const rdlen = v.getUint16(off); off += 2
    const rdstart = off
    if (rrtype === 1 && rdlen === 4) {
      answers.push(`${v.getUint8(off)}.${v.getUint8(off+1)}.${v.getUint8(off+2)}.${v.getUint8(off+3)}`)
    } else if (rrtype === 28 && rdlen === 16) {
      const segs: string[] = []
      for (let j = 0; j < 8; j++) segs.push(v.getUint16(off + j * 2).toString(16))
      answers.push(segs.join(':'))
    } else if (rrtype === 2 || rrtype === 5) {
      const [name] = readName(off)
      answers.push(name)
    } else if (rrtype === 15) {
      const prio = v.getUint16(off)
      const [name] = readName(off + 2)
      answers.push(`${prio} ${name}`)
    } else if (rrtype === 16) {
      let pos = off
      const parts: string[] = []
      while (pos < rdstart + rdlen) {
        const slen = v.getUint8(pos++)
        let s = ''
        for (let j = 0; j < slen; j++) s += String.fromCharCode(v.getUint8(pos++))
        parts.push(s)
      }
      answers.push(parts.join(''))
    }
    off = rdstart + rdlen
  }

  return { rcode, answers }
}

export async function checkDns(monitor: Monitor): Promise<CheckResult> {
  const start = Date.now()
  const resolverUrl = monitor.dnsResolverUrl!
  const hostname = monitor.dnsHostname!
  const recordType = monitor.dnsRecordType ?? 'A'

  const sep = resolverUrl.includes('?') ? '&' : '?'
  const queryUrl = `${resolverUrl}${sep}name=${encodeURIComponent(hostname)}&type=${encodeURIComponent(recordType)}`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), (monitor.timeout || 30) * 1000)

    const response = await fetch(queryUrl, {
      headers: { Accept: 'application/dns-json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const responseTimeMs = Date.now() - start

    if (!response.ok) {
      return { status: 'down', responseTimeMs, message: `DoH HTTP ${response.status}` }
    }

    const contentType = response.headers.get('content-type') ?? ''

    let rcode: number
    let answerData: string[]

    if (contentType.includes('dns-message') || contentType.includes('octet-stream')) {
      const wire = await response.arrayBuffer()
      const parsed = parseDnsWire(wire)
      rcode = parsed.rcode
      answerData = parsed.answers
    } else if (contentType.includes('json')) {
      let data: DoHResponse
      try {
        data = await response.json() as DoHResponse
      } catch {
        return { status: 'down', responseTimeMs, message: 'DoH resolver returned invalid JSON' }
      }
      rcode = data.Status
      answerData = (data.Answer ?? []).map(a => a.data)
    } else {
      let raw: ArrayBuffer
      try {
        raw = await response.arrayBuffer()
      } catch {
        return { status: 'down', responseTimeMs, message: 'DoH resolver returned unreadable response' }
      }
      try {
        const text = new TextDecoder().decode(raw)
        const data = JSON.parse(text) as DoHResponse
        rcode = data.Status
        answerData = (data.Answer ?? []).map(a => a.data)
      } catch {
        const parsed = parseDnsWire(raw)
        rcode = parsed.rcode
        answerData = parsed.answers
      }
    }

    if (rcode !== 0) {
      const label = DNS_RCODES[rcode] ?? `RCODE ${rcode}`
      return { status: 'down', responseTimeMs, message: `DNS ${label}` }
    }

    if (monitor.dnsExpectedIp) {
      const found = answerData.some(d => d === monitor.dnsExpectedIp)
      if (!found) {
        const got = answerData.join(', ')
        return { status: 'down', responseTimeMs, message: `Expected ${monitor.dnsExpectedIp}, got ${got || 'no answer'}` }
      }
    }

    if (answerData.length > 0) {
      return { status: 'up', responseTimeMs, message: `DNS OK · ${answerData.join(', ')}` }
    }
    return { status: 'up', responseTimeMs, message: 'DNS OK' }

  } catch (err) {
    const responseTimeMs = Date.now() - start
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'down', responseTimeMs, message: `Timeout after ${monitor.timeout ?? 30}s` }
    }
    return { status: 'down', responseTimeMs, message: String(err) }
  }
}

function isUnreachable(err: unknown): boolean {
  const s = String(err).toLowerCase()
  return (
    s.includes('econnrefused') || s.includes('connection refused') ||
    s.includes('enotfound') || s.includes('enetunreach') || s.includes('ehostunreach') ||
    s.includes('no such host') || s.includes('name or service not known')
  )
}

export async function checkPing(monitor: Monitor): Promise<CheckResult> {
  const start = Date.now()
  const raw = monitor.url!
  const target = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), (monitor.timeout || 30) * 1000)

  try {
    const response = await fetch(target, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const responseTimeMs = Date.now() - start
    return { status: 'up', responseTimeMs, message: `Ping OK · HTTP ${response.status}` }
  } catch (err) {
    clearTimeout(timeoutId)
    const responseTimeMs = Date.now() - start
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'down', responseTimeMs, message: `Timeout after ${monitor.timeout ?? 30}s` }
    }
    if (isUnreachable(err)) {
      const msg = String(err)
      return { status: 'down', responseTimeMs, message: msg, sslError: isSslError(msg) }
    }
    try {
      const port = new URL(target).port || (target.startsWith('https') ? '443' : '80')
      return { status: 'up', responseTimeMs, message: `Ping OK · :${port} open` }
    } catch {
      return { status: 'up', responseTimeMs, message: 'Ping OK · port open' }
    }
  }
}

function isSslError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('ssl') || lower.includes('certificate') || lower.includes('tls') || lower.includes('cert') || lower.includes('handshake')
}

export async function checkHttp(monitor: Monitor, locale = 'en'): Promise<CheckResult> {
  const start = Date.now()

  try {
    const headers: Record<string, string> = {}

    if (monitor.headers && monitor.headers !== '{}') {
      Object.assign(headers, JSON.parse(monitor.headers))
    }

    if (monitor.authType === 'bearer' && monitor.authToken) {
      headers['Authorization'] = `Bearer ${monitor.authToken}`
    } else if (monitor.authType === 'basic' && monitor.authUsername) {
      const creds = btoa(`${monitor.authUsername}:${monitor.authPassword ?? ''}`)
      headers['Authorization'] = `Basic ${creds}`
    }

    const method = monitor.method || 'GET'
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), (monitor.timeout || 30) * 1000)

    const init: RequestInit = {
      method,
      headers,
      redirect: monitor.followRedirects ? 'follow' : 'manual',
      signal: controller.signal,
    }

    if (monitor.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      init.body = monitor.body
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json'
      }
    }

    let targetUrl = monitor.url!
    if (monitor.cacheBooster) {
      const sep = targetUrl.includes('?') ? '&' : '?'
      targetUrl = `${targetUrl}${sep}pingflare=${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
    }

    const response = await fetch(targetUrl, init)
    clearTimeout(timeoutId)
    const responseTimeMs = Date.now() - start

    if (monitor.authType === 'digest' && response.status === 401) {
      const digestResult = await doDigestAuth(monitor, response, method, responseTimeMs)
      if (digestResult) return digestResult
    }

    const expectedStatus = monitor.expectedStatus || 200
    if (response.status === expectedStatus) {
      return { status: 'up', statusCode: response.status, responseTimeMs, message: `HTTP ${response.status}` }
    }
    return { status: 'down', statusCode: response.status, responseTimeMs, message: `HTTP ${response.status} (expected ${expectedStatus})` }

  } catch (err) {
    const responseTimeMs = Date.now() - start
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'down', responseTimeMs, message: msgTimeoutAfter(locale, monitor.timeout ?? 30) }
    }
    const msg = String(err)
    return { status: 'down', responseTimeMs, message: msg, sslError: isSslError(msg) }
  }
}

async function doDigestAuth(
  monitor: Monitor,
  firstResponse: Response,
  method: string,
  firstRtt: number,
): Promise<CheckResult | null> {
  const wwwAuth = firstResponse.headers.get('WWW-Authenticate')
  if (!wwwAuth || !wwwAuth.toLowerCase().startsWith('digest')) return null

  const parse = (key: string) => {
    const m = wwwAuth.match(new RegExp(`${key}="([^"]+)"`))
    return m ? m[1] : ''
  }

  const realm  = parse('realm')
  const nonce  = parse('nonce')
  const qop    = wwwAuth.includes('qop=') ? 'auth' : ''
  const uri    = new URL(monitor.url!).pathname || '/'
  const nc     = '00000001'
  const cnonce = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

  const md5 = (s: string) => createHash('md5').update(s).digest('hex')

  const ha1 = md5(`${monitor.authUsername}:${realm}:${monitor.authPassword ?? ''}`)
  const ha2 = md5(`${method}:${uri}`)
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`)

  let authHeader = `Digest username="${monitor.authUsername}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`
  if (qop) authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`

  const headers: Record<string, string> = { Authorization: authHeader }
  if (monitor.headers && monitor.headers !== '{}') Object.assign(headers, JSON.parse(monitor.headers))

  const start2 = Date.now()
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), (monitor.timeout || 30) * 1000)
    const res2 = await fetch(monitor.url!, { method, headers, signal: controller.signal })
    clearTimeout(tid)
    const responseTimeMs = firstRtt + (Date.now() - start2)
    const expected = monitor.expectedStatus || 200
    if (res2.status === expected) {
      return { status: 'up', statusCode: res2.status, responseTimeMs, message: `HTTP ${res2.status} (digest)` }
    }
    return { status: 'down', statusCode: res2.status, responseTimeMs, message: `HTTP ${res2.status} (expected ${expected})` }
  } catch (err) {
    return { status: 'down', responseTimeMs: firstRtt, message: String(err) }
  }
}

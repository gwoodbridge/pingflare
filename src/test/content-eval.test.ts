import { describe, it, expect } from 'vitest'
import { parseContentCheck, getPath, evaluateContent } from '../services/content-eval'
import { rollup } from '../routes/publicStatus'

describe('parseContentCheck', () => {
  it('returns null for empty/invalid input', () => {
    expect(parseContentCheck(null)).toBeNull()
    expect(parseContentCheck('')).toBeNull()
    expect(parseContentCheck('not json')).toBeNull()
    expect(parseContentCheck('{"mode":"bogus"}')).toBeNull()
  })

  it('requires a path in json mode', () => {
    expect(parseContentCheck('{"mode":"json","down":["x"]}')).toBeNull()
    expect(parseContentCheck('{"mode":"json","path":"a.b","down":["x"]}')).not.toBeNull()
  })

  it('requires at least one non-empty list', () => {
    expect(parseContentCheck('{"mode":"keyword","up":[],"down":[]}')).toBeNull()
    expect(parseContentCheck('{"mode":"keyword","down":["outage"]}')).not.toBeNull()
  })

  it('lowercases and trims list values', () => {
    const cfg = parseContentCheck('{"mode":"keyword","down":["  OUTAGE  "," Down "]}')
    expect(cfg?.down).toEqual(['outage', 'down'])
  })
})

describe('getPath', () => {
  const obj = {
    status: { indicator: 'none' },
    components: [
      { name: 'Voice', status: 'operational' },
      { name: 'Programmable Messaging', status: 'degraded_performance' },
    ],
    items: [{ title: 'All good' }],
  }

  it('resolves dotted paths', () => {
    expect(getPath(obj, 'status.indicator')).toBe('none')
  })

  it('resolves array index', () => {
    expect(getPath(obj, 'items[0].title')).toBe('All good')
  })

  it('resolves [key=value] filters (case-insensitive, spaces ok)', () => {
    expect(getPath(obj, 'components[name=Programmable Messaging].status')).toBe('degraded_performance')
    expect(getPath(obj, 'components[name=voice].status')).toBe('operational')
  })

  it('returns undefined for missing paths', () => {
    expect(getPath(obj, 'status.nope')).toBeUndefined()
    expect(getPath(obj, 'components[name=Email].status')).toBeUndefined()
    expect(getPath(obj, 'items[5].title')).toBeUndefined()
  })
})

describe('evaluateContent · json mode (Statuspage indicator)', () => {
  const cfg = parseContentCheck(JSON.stringify({
    mode: 'json', path: 'status.indicator',
    up: ['none'], degraded: ['minor', 'maintenance'], down: ['major', 'critical'],
  }))!

  it('maps indicator values to status', () => {
    expect(evaluateContent(cfg, '{"status":{"indicator":"none"}}').status).toBe('up')
    expect(evaluateContent(cfg, '{"status":{"indicator":"minor"}}').status).toBe('degraded')
    expect(evaluateContent(cfg, '{"status":{"indicator":"major"}}').status).toBe('down')
    expect(evaluateContent(cfg, '{"status":{"indicator":"critical"}}').status).toBe('down')
  })

  it('treats unknown indicator values as operational', () => {
    expect(evaluateContent(cfg, '{"status":{"indicator":"something-new"}}').status).toBe('up')
  })

  it('is down when body is not JSON or path is missing', () => {
    expect(evaluateContent(cfg, '<html>nope</html>').status).toBe('down')
    expect(evaluateContent(cfg, '{"status":{}}').status).toBe('down')
  })
})

describe('evaluateContent · json mode (Twilio component filter)', () => {
  const cfg = parseContentCheck(JSON.stringify({
    mode: 'json', path: 'components[name=Programmable Messaging].status',
    degraded: ['degraded_performance', 'under_maintenance'], down: ['partial_outage', 'major_outage'],
  }))!

  it('reads the targeted component, not the whole page', () => {
    const body = JSON.stringify({ components: [
      { name: 'Voice', status: 'major_outage' },
      { name: 'Programmable Messaging', status: 'degraded_performance' },
    ] })
    expect(evaluateContent(cfg, body).status).toBe('degraded')
  })
})

describe('evaluateContent · keyword mode (RSS-style text)', () => {
  const cfg = parseContentCheck(JSON.stringify({
    mode: 'keyword',
    up: ['resolved', 'restored'],
    degraded: ['degraded', 'partial'],
    down: ['outage', 'down', 'service disruption'],
  }))!

  it('detects outage and degraded keywords', () => {
    expect(evaluateContent(cfg, 'AWS IoT Core service disruption in us-east-1').status).toBe('down')
    expect(evaluateContent(cfg, 'Partial degradation of message delivery').status).toBe('degraded')
  })

  it('resolved keywords override outage keywords', () => {
    expect(evaluateContent(cfg, 'The outage has been resolved').status).toBe('up')
  })

  it('no incident keywords means operational', () => {
    expect(evaluateContent(cfg, 'Everything nominal').status).toBe('up')
  })
})

describe('rollup', () => {
  it('is worst-of across statuses', () => {
    expect(rollup([])).toBe('unknown')
    expect(rollup(['up', 'up'])).toBe('operational')
    expect(rollup(['up', 'degraded'])).toBe('degraded')
    expect(rollup(['up', 'degraded', 'down'])).toBe('down')
    expect(rollup(['pending', 'pending'])).toBe('unknown')
    expect(rollup(['up', 'pending'])).toBe('operational')
  })
})

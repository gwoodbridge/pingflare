/**
 * Content-based status evaluation for HTTP monitors.
 *
 * Lets a monitor derive up/degraded/down from the *body* of a response, not just
 * the HTTP status code. Two modes:
 *
 *   - "json"    extract a value via a small dotted path (supports `a.b`, `a[0].b`,
 *               and `a[key=value].b` filters) and match it against value lists.
 *   - "keyword" scan the raw body text for keyword lists (for RSS/HTML/plain text).
 *
 * This replaces Kener-style arbitrary eval functions, which can't run on the
 * Cloudflare Workers runtime (no `eval` / `new Function`).
 */

export type ContentStatus = 'up' | 'down' | 'degraded'

export interface ContentCheckConfig {
  mode: 'json' | 'keyword'
  /** JSON mode: dotted path into the parsed body, e.g. "status.indicator". */
  path?: string
  /** Values/keywords that force UP (in keyword mode these act as resolved/override). */
  up?: string[]
  /** Values/keywords that mark DEGRADED. */
  degraded?: string[]
  /** Values/keywords that mark DOWN. */
  down?: string[]
}

export interface ContentEvalResult {
  status: ContentStatus
  /** Human-readable detail for the status log message. */
  detail: string
}

/** Parse and validate the stored config JSON. Returns null when unusable. */
export function parseContentCheck(raw: string | null | undefined): ContentCheckConfig | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const cfg = parsed as Record<string, unknown>
  if (cfg.mode !== 'json' && cfg.mode !== 'keyword') return null

  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(x => String(x).trim().toLowerCase()).filter(Boolean) : []

  const config: ContentCheckConfig = {
    mode: cfg.mode,
    path: typeof cfg.path === 'string' ? cfg.path.trim() : undefined,
    up: list(cfg.up),
    degraded: list(cfg.degraded),
    down: list(cfg.down),
  }

  if (config.mode === 'json' && !config.path) return null
  if (!config.up?.length && !config.degraded?.length && !config.down?.length) return null
  return config
}

/**
 * Resolve a dotted path against a parsed JSON value.
 * Segments: `key`, `[index]`, or `[key=value]` to find the first array element
 * whose `key` (case-insensitively) equals `value`.
 */
export function getPath(root: unknown, path: string): unknown {
  // Tokenize "a.b[0].c[name=Foo Bar].d" into ["a","b","[0]","c","[name=Foo Bar]","d"]
  const tokens = path.match(/[^.[\]]+|\[[^\]]*\]/g)
  if (!tokens) return undefined

  let cur: unknown = root
  for (const rawTok of tokens) {
    if (cur == null) return undefined
    const tok = rawTok.trim()
    if (!tok) continue

    if (tok.startsWith('[') && tok.endsWith(']')) {
      const inner = tok.slice(1, -1).trim()
      if (/^\d+$/.test(inner)) {
        if (!Array.isArray(cur)) return undefined
        cur = cur[Number(inner)]
        continue
      }
      const eq = inner.indexOf('=')
      if (eq === -1) return undefined
      const key = inner.slice(0, eq).trim()
      const want = inner.slice(eq + 1).trim().toLowerCase()
      if (!Array.isArray(cur)) return undefined
      cur = cur.find(el => el && typeof el === 'object' &&
        String((el as Record<string, unknown>)[key] ?? '').trim().toLowerCase() === want)
      continue
    }

    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[tok]
  }
  return cur
}

/** Evaluate a response body against the config. Never throws. */
export function evaluateContent(config: ContentCheckConfig, body: string): ContentEvalResult {
  const down = config.down ?? []
  const degraded = config.degraded ?? []
  const up = config.up ?? []

  if (config.mode === 'json') {
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return { status: 'down', detail: 'Response body was not valid JSON' }
    }
    const value = getPath(parsed, config.path!)
    if (value === undefined || value === null) {
      return { status: 'down', detail: `No value at "${config.path}"` }
    }
    const v = String(value).trim().toLowerCase()
    if (down.includes(v)) return { status: 'down', detail: `${config.path} = ${value}` }
    if (degraded.includes(v)) return { status: 'degraded', detail: `${config.path} = ${value}` }
    if (up.length && up.includes(v)) return { status: 'up', detail: `${config.path} = ${value}` }
    // Unmatched value defaults to operational so unknown indicators don't false-alarm.
    return { status: 'up', detail: `${config.path} = ${value}` }
  }

  // keyword mode
  const text = body.toLowerCase()
  const firstHit = (kws: string[]) => kws.find(k => text.includes(k))

  // "up" keywords (resolved/restored) win — mirrors the Kener resolved-override behaviour.
  const upHit = firstHit(up)
  if (upHit) return { status: 'up', detail: `Matched "${upHit}"` }
  const downHit = firstHit(down)
  if (downHit) return { status: 'down', detail: `Matched "${downHit}"` }
  const degradedHit = firstHit(degraded)
  if (degradedHit) return { status: 'degraded', detail: `Matched "${degradedHit}"` }
  // No incident keywords found = operational.
  return { status: 'up', detail: 'No incident keywords found' }
}

<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { api } from '$lib/api'
  import type { Monitor, MonitorPayload, NotificationChannel } from '$lib/api'
  import { t } from '$lib/i18n'

  export let monitor: Partial<Monitor> = {}
  export let mode: 'create' | 'edit' = 'create'

  const dispatch = createEventDispatcher<{ saved: Monitor; cancel: void }>()

  let tab: 'http' | 'heartbeat' | 'dns' | 'ping' = (monitor.type ?? 'http') as 'http' | 'heartbeat' | 'dns' | 'ping'

  let name            = monitor.name ?? ''
  let tagsInput       = (() => { try { return JSON.parse(monitor.tags ?? '[]').join(', ') } catch { return '' } })()
  let interval        = monitor.interval ?? 60
  let active          = monitor.active ?? true
  let reminderHours       = monitor.reminderIntervalHours ?? ''
  let toleranceFailures   = monitor.toleranceFailures ?? 1
  let url             = monitor.url ?? ''
  let method          = monitor.method ?? 'GET'
  let body            = monitor.body ?? ''
  let headersInput    = (() => { try { const h = JSON.parse(monitor.headers ?? '{}'); return Object.entries(h).map(([k,v]) => `${k}: ${v}`).join('\n') } catch { return '' } })()
  let expectedStatus  = monitor.expectedStatus ?? 200
  let followRedirects = monitor.followRedirects ?? true
  let timeout         = monitor.timeout ?? 30
  let ipVersion       = monitor.ipVersion ?? 'auto'
  let authType        = monitor.authType ?? 'none'
  let authUsername    = monitor.authUsername ?? ''
  let authPassword    = monitor.authPassword ?? ''
  let authToken       = monitor.authToken ?? ''
  let heartbeatInterval   = monitor.heartbeatInterval ?? 60
  let heartbeatGrace      = monitor.heartbeatGrace ?? 30
  let toleranceMissed     = monitor.toleranceMissed ?? 1
  let surgeLimit          = monitor.surgeProtectionLimit ?? ''
  let sslCheckEnabled     = monitor.sslCheckEnabled ?? false
  let cacheBooster        = monitor.cacheBooster ?? false
  let dnsHostname         = monitor.dnsHostname ?? ''
  let dnsRecordType       = monitor.dnsRecordType ?? 'A'
  let dnsResolverUrl      = monitor.dnsResolverUrl ?? ''
  let dnsExpectedIp       = monitor.dnsExpectedIp ?? ''

  // Content check (HTTP): derive up/degraded/down from the response body.
  let contentCheckEnabled = !!monitor.contentCheck
  let contentMode: 'json' | 'keyword' = 'json'
  let contentPath = ''
  let contentDown = ''
  let contentDegraded = ''
  let contentUp = ''
  ;(() => {
    if (!monitor.contentCheck) return
    try {
      const cc = JSON.parse(monitor.contentCheck)
      contentMode = cc.mode === 'keyword' ? 'keyword' : 'json'
      contentPath = cc.path ?? ''
      contentDown = (cc.down ?? []).join(', ')
      contentDegraded = (cc.degraded ?? []).join(', ')
      contentUp = (cc.up ?? []).join(', ')
    } catch { /* ignore malformed config */ }
  })()

  let selectedChannelIds: string[] = []
  let allChannels: NotificationChannel[] = []

  let saving = false
  let error = ''

  const METHODS = ['HEAD', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

  onMount(async () => {
    allChannels = await api.notifications.list()
    if (mode === 'edit' && monitor.id) {
      selectedChannelIds = await api.monitors.channels(monitor.id)
    } else {
      selectedChannelIds = allChannels.filter(ch => ch.isDefault).map(ch => ch.id)
    }
  })

  function parseHeaders(raw: string): Record<string, string> {
    const result: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const idx = line.indexOf(':')
      if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    return result
  }

  async function save() {
    saving = true
    error = ''
    try {
      const tags = tagsInput.split(',').map((t: string) => t.trim()).filter(Boolean)
      const base = {
        name, type: tab, active, interval,
        tags,
        reminderIntervalHours: reminderHours ? Number(reminderHours) : null,
        toleranceFailures: Number(toleranceFailures),
        channelIds: selectedChannelIds,
      }
      const splitList = (s: string) => s.split(/[\n,]/).map(x => x.trim()).filter(Boolean)
      const payload: MonitorPayload = tab === 'http' ? {
        ...base,
        url, method, body: body || null,
        headers: parseHeaders(headersInput),
        expectedStatus: Number(expectedStatus),
        followRedirects, timeout: Number(timeout),
        ipVersion, authType,
        authUsername: authType !== 'none' ? authUsername : null,
        authPassword: authType === 'basic' || authType === 'digest' ? authPassword : null,
        authToken:    authType === 'bearer' ? authToken : null,
        sslCheckEnabled,
        cacheBooster,
        contentCheck: contentCheckEnabled ? {
          mode: contentMode,
          ...(contentMode === 'json' ? { path: contentPath.trim() } : {}),
          up: splitList(contentUp),
          degraded: splitList(contentDegraded),
          down: splitList(contentDown),
        } : null,
      } : tab === 'dns' ? {
        ...base,
        timeout: Number(timeout),
        dnsHostname,
        dnsRecordType,
        dnsResolverUrl,
        dnsExpectedIp: dnsExpectedIp || null,
      } : tab === 'ping' ? {
        ...base,
        url,
        timeout: Number(timeout),
      } : {
        ...base,
        heartbeatInterval: Number(heartbeatInterval),
        heartbeatGrace: Number(heartbeatGrace),
        toleranceMissed: Number(toleranceMissed),
        surgeProtectionLimit: surgeLimit ? Number(surgeLimit) : null,
      }

      let result: Monitor
      if (mode === 'edit' && monitor.id) {
        result = await api.monitors.update(monitor.id, payload)
      } else {
        result = await api.monitors.create(payload)
      }
      dispatch('saved', result)
    } catch (e) {
      error = String(e)
    } finally {
      saving = false
    }
  }

  function toggleChannel(id: string) {
    selectedChannelIds = selectedChannelIds.includes(id)
      ? selectedChannelIds.filter(c => c !== id)
      : [...selectedChannelIds, id]
  }
</script>

<form on:submit|preventDefault={save} class="space-y-6">
  {#if mode === 'create'}
  <div class="flex gap-2">
    <button
      type="button"
      class="px-4 py-1.5 text-sm font-medium transition-colors
        {tab === 'http' ? 'bg-primary text-white' : 'btn-outline'}"
      on:click={() => { tab = 'http' }}
    >{$t('monitorForm.httpCheck')}</button>
    <button
      type="button"
      class="px-4 py-1.5 text-sm font-medium transition-colors
        {tab === 'heartbeat' ? 'bg-primary text-white' : 'btn-outline'}"
      on:click={() => { tab = 'heartbeat' }}
    >{$t('monitorForm.heartbeat')}</button>
    <button
      type="button"
      class="px-4 py-1.5 text-sm font-medium transition-colors
        {tab === 'dns' ? 'bg-primary text-white' : 'btn-outline'}"
      on:click={() => { tab = 'dns' }}
    >{$t('monitorForm.dns')}</button>
    <button
      type="button"
      class="px-4 py-1.5 text-sm font-medium transition-colors
        {tab === 'ping' ? 'bg-primary text-white' : 'btn-outline'}"
      on:click={() => { tab = 'ping' }}
    >{$t('monitorForm.ping')}</button>
  </div>
  {/if}

  <div class="grid grid-cols-2 gap-4">
    <div class="col-span-2">
      <label for="m-name" class="label">{$t('monitorForm.name')}</label>
      <input id="m-name" class="input" bind:value={name} required placeholder="My API" />
    </div>
    <div>
      <label for="m-tags" class="label">{$t('monitorForm.tags')}</label>
      <input id="m-tags" class="input" bind:value={tagsInput} placeholder="prod, api" />
    </div>
    <div>
      <label for="m-interval" class="label">{$t('monitorForm.interval')}</label>
      <input id="m-interval" class="input" type="number" bind:value={interval} min="60" required />
    </div>
  </div>

  {#if tab === 'http'}
  <div class="space-y-4">
    <h3 class="text-sm font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wide">{$t('monitorForm.sectionRequest')}</h3>
    <div class="flex gap-2">
      <div class="w-36">
        <label for="m-method" class="label">{$t('monitorForm.method')}</label>
        <select id="m-method" class="input" bind:value={method}>
          {#each METHODS as m}<option>{m}</option>{/each}
        </select>
      </div>
      <div class="flex-1">
        <label for="m-url" class="label">{$t('monitorForm.url')}</label>
        <input id="m-url" class="input font-mono text-xs" bind:value={url} required placeholder="https://example.com/api" />
      </div>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div>
        <label for="m-status" class="label">{$t('monitorForm.expectedStatus')}</label>
        <input id="m-status" class="input" type="number" bind:value={expectedStatus} />
      </div>
      <div>
        <label for="m-timeout" class="label">{$t('monitorForm.timeout')}</label>
        <input id="m-timeout" class="input" type="number" bind:value={timeout} min="1" max="60" />
      </div>
      <div>
        <label for="m-ip" class="label">{$t('monitorForm.ipVersion')}</label>
        <select id="m-ip" class="input" bind:value={ipVersion}>
          <option value="auto">{$t('monitorForm.ipAuto')}</option>
          <option value="ipv4">IPv4</option>
          <option value="ipv6">IPv6</option>
        </select>
      </div>
    </div>

    <div class="flex flex-wrap gap-x-6 gap-y-2">
      <div class="flex items-center gap-2">
        <input type="checkbox" id="follow" bind:checked={followRedirects} class="accent-primary" />
        <label for="follow" class="text-sm">{$t('monitorForm.followRedirects')}</label>
      </div>
      <div class="flex items-center gap-2">
        <input type="checkbox" id="ssl-check" bind:checked={sslCheckEnabled} class="accent-primary" />
        <label for="ssl-check" class="text-sm">{$t('monitorForm.sslCheck')}</label>
      </div>
      <div class="flex items-center gap-2">
        <input type="checkbox" id="cache-booster" bind:checked={cacheBooster} class="accent-primary" />
        <label for="cache-booster" class="text-sm">{$t('monitorForm.cacheBuster')}</label>
      </div>
    </div>

    <div>
      <label for="m-auth" class="label">{$t('monitorForm.authentication')}</label>
      <select id="m-auth" class="input w-auto" bind:value={authType}>
        <option value="none">{$t('monitorForm.authNone')}</option>
        <option value="basic">{$t('monitorForm.authBasic')}</option>
        <option value="digest">{$t('monitorForm.authDigest')}</option>
        <option value="bearer">{$t('monitorForm.authBearer')}</option>
      </select>
    </div>
    {#if authType === 'basic' || authType === 'digest'}
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="m-auth-user" class="label">{$t('monitorForm.authUsername')}</label>
        <input id="m-auth-user" class="input" bind:value={authUsername} />
      </div>
      <div>
        <label for="m-auth-pass" class="label">{$t('monitorForm.authPassword')}</label>
        <input id="m-auth-pass" class="input" type="password" bind:value={authPassword} />
      </div>
    </div>
    {/if}
    {#if authType === 'bearer'}
    <div>
      <label for="m-auth-token" class="label">{$t('monitorForm.bearerToken')}</label>
      <input id="m-auth-token" class="input font-mono text-xs" bind:value={authToken} />
    </div>
    {/if}

    <div>
      <label for="m-headers" class="label">{$t('monitorForm.headers')}</label>
      <textarea id="m-headers" class="input font-mono text-xs h-20 resize-none" bind:value={headersInput} placeholder="X-API-Key: mykey&#10;Accept: application/json"></textarea>
    </div>

    <div class="rounded border p-3 space-y-3" style="border-color: var(--border-color)">
      <div class="flex items-center gap-2">
        <input type="checkbox" id="content-check" bind:checked={contentCheckEnabled} class="accent-primary" />
        <label for="content-check" class="text-sm font-medium">{$t('monitorForm.contentCheck')}</label>
      </div>
      {#if contentCheckEnabled}
        <p class="text-xs" style="color: rgb(var(--text-muted))">{$t('monitorForm.contentCheckHint')}</p>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm">
            <input type="radio" bind:group={contentMode} value="json" class="accent-primary" />
            {$t('monitorForm.contentModeJson')}
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="radio" bind:group={contentMode} value="keyword" class="accent-primary" />
            {$t('monitorForm.contentModeKeyword')}
          </label>
        </div>
        {#if contentMode === 'json'}
          <div>
            <label for="content-path" class="label">{$t('monitorForm.contentPath')}</label>
            <input id="content-path" class="input font-mono text-xs" bind:value={contentPath} placeholder="status.indicator" />
            <p class="mt-1 text-xs" style="color: rgb(var(--text-muted))">{$t('monitorForm.contentPathHint')}</p>
          </div>
        {/if}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label for="content-down" class="label">{$t('monitorForm.contentDown')}</label>
            <input id="content-down" class="input text-xs" bind:value={contentDown} placeholder={contentMode === 'json' ? 'major, critical' : 'outage, down'} />
          </div>
          <div>
            <label for="content-degraded" class="label">{$t('monitorForm.contentDegraded')}</label>
            <input id="content-degraded" class="input text-xs" bind:value={contentDegraded} placeholder={contentMode === 'json' ? 'minor, maintenance' : 'degraded, partial'} />
          </div>
          <div>
            <label for="content-up" class="label">{$t('monitorForm.contentUp')}</label>
            <input id="content-up" class="input text-xs" bind:value={contentUp} placeholder={contentMode === 'json' ? 'none' : 'resolved, restored'} />
          </div>
        </div>
        <p class="text-xs" style="color: rgb(var(--text-muted))">{$t('monitorForm.contentListHint')}</p>
      {/if}
    </div>

    {#if ['POST', 'PUT', 'PATCH'].includes(method)}
    <div>
      <label for="m-body" class="label">{$t('monitorForm.requestBody')}</label>
      <textarea id="m-body" class="input font-mono text-xs h-20 resize-none" bind:value={body} placeholder='&#123;"key": "value"&#125;'></textarea>
    </div>
    {/if}
  </div>
  {/if}

  {#if tab === 'ping'}
  <div class="space-y-4">
    <h3 class="text-sm font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wide">{$t('monitorForm.sectionPing')}</h3>
    <div>
      <label for="ping-url" class="label">{$t('monitorForm.pingUrl')}</label>
      <input id="ping-url" class="input font-mono text-xs" bind:value={url} required placeholder="https://example.com" />
    </div>
    <div>
      <label for="ping-timeout" class="label">{$t('monitorForm.timeout')}</label>
      <input id="ping-timeout" class="input" type="number" bind:value={timeout} min="1" max="60" />
    </div>
  </div>
  {/if}

  {#if tab === 'heartbeat'}
  <div class="space-y-4">
    <h3 class="text-sm font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wide">{$t('monitorForm.sectionHeartbeat')}</h3>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="hb-interval" class="label">{$t('monitorForm.expectedEvery')}</label>
        <input id="hb-interval" class="input" type="number" bind:value={heartbeatInterval} min="60" />
      </div>
      <div>
        <label for="hb-grace" class="label">{$t('monitorForm.gracePeriod')}</label>
        <input id="hb-grace" class="input" type="number" bind:value={heartbeatGrace} min="0" />
      </div>
      <div>
        <label for="hb-tolerance" class="label">{$t('monitorForm.tolerateMissed')}</label>
        <input id="hb-tolerance" class="input" type="number" bind:value={toleranceMissed} min="1" />
      </div>
      <div>
        <label for="hb-surge" class="label">{$t('monitorForm.surgeProtection')}</label>
        <input id="hb-surge" class="input" type="number" bind:value={surgeLimit} min="1" placeholder={$t('monitorForm.disabled')} />
      </div>
    </div>
  </div>
  {/if}

  {#if tab === 'dns'}
  <div class="space-y-4">
    <h3 class="text-sm font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wide">{$t('monitorForm.sectionDns')}</h3>
    <div>
      <label for="dns-resolver" class="label">{$t('monitorForm.dnsResolverUrl')}</label>
      <input id="dns-resolver" class="input font-mono text-xs" bind:value={dnsResolverUrl} required
        placeholder="https://freedns.controld.com/p0" />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="dns-hostname" class="label">{$t('monitorForm.dnsHostname')}</label>
        <input id="dns-hostname" class="input font-mono text-xs" bind:value={dnsHostname} required
          placeholder="example.com" />
      </div>
      <div>
        <label for="dns-record" class="label">{$t('monitorForm.dnsRecordType')}</label>
        <select id="dns-record" class="input" bind:value={dnsRecordType}>
          {#each ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'] as rt}
            <option value={rt}>{rt}</option>
          {/each}
        </select>
      </div>
    </div>
    <div>
      <label for="dns-expected" class="label">{$t('monitorForm.dnsExpectedIp')}</label>
      <input id="dns-expected" class="input font-mono text-xs" bind:value={dnsExpectedIp}
        placeholder={$t('monitorForm.dnsExpectedIpPlaceholder')} />
      <p class="text-xs mt-1" style="color: rgb(var(--text-muted))">{$t('monitorForm.dnsExpectedIpHint')}</p>
    </div>
    <div>
      <label for="dns-timeout" class="label">{$t('monitorForm.timeout')}</label>
      <input id="dns-timeout" class="input" type="number" bind:value={timeout} min="1" max="60" />
    </div>
  </div>
  {/if}

  <div class="space-y-4">
    <h3 class="text-sm font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wide">{$t('monitorForm.sectionAlerts')}</h3>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="m-tolerance" class="label">{$t('monitorForm.tolerateFailures')}</label>
        <input id="m-tolerance" class="input" type="number" bind:value={toleranceFailures} min="1" />
      </div>
      <div>
        <label for="m-reminder" class="label">{$t('monitorForm.reminder')}</label>
        <input id="m-reminder" class="input" type="number" bind:value={reminderHours} min="1" placeholder={$t('monitorForm.disabled')} />
      </div>
    </div>
  </div>

  <div class="space-y-3">
    <h3 class="text-sm font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wide">{$t('monitorForm.sectionNotifications')}</h3>
    {#if allChannels.length === 0}
      <p class="text-sm" style="color: rgb(var(--text-muted))">
        {$t('monitorForm.noChannels')} <a href="/settings" class="underline" style="color: var(--color-primary)">{$t('monitorForm.addOne')}</a>.
      </p>
    {:else}
      <div class="grid grid-cols-2 gap-2">
        {#each allChannels as ch}
          <label class="flex items-center gap-2 cursor-pointer text-sm p-2 hover:bg-[rgb(var(--bg-subtle))]">
            <input type="checkbox"
              checked={selectedChannelIds.includes(ch.id)}
              on:change={() => toggleChannel(ch.id)}
              class="accent-primary"
            />
            {ch.name}
          </label>
        {/each}
      </div>
    {/if}
  </div>

  {#if error}
    <p class="text-sm text-red-400">{error}</p>
  {/if}

  <div class="flex gap-2 pt-1">
    <button type="submit" class="btn-primary" disabled={saving}>
      {saving ? $t('monitorForm.saving') : mode === 'edit' ? $t('monitorForm.saveChanges') : $t('monitorForm.createMonitor')}
    </button>
    <button type="button" class="btn-outline ml-auto" on:click={() => dispatch('cancel')}>{$t('monitorForm.cancel')}</button>
  </div>
</form>

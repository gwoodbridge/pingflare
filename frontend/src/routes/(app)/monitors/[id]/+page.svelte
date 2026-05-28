<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { api } from '$lib/api'
  import { t, locale } from '$lib/i18n'
  import { get } from 'svelte/store'
  import type { Monitor, StatusLog, Incident, DailyUptime } from '$lib/api'
  import StatusBadge from '$lib/components/StatusBadge.svelte'
  import UptimeChart from '$lib/components/UptimeChart.svelte'
  import ResponseTimeChart from '$lib/components/ResponseTimeChart.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import PageLoader from '$lib/components/PageLoader.svelte'
  import HeaderPattern from '$lib/components/HeaderPattern.svelte'
  import { formatRelative, formatDuration, formatTs, formatUptime, parseTags } from '$lib/utils'

  function logMsg(msg: string | null): string {
    if (!msg) return ''
    if (msg.startsWith('notify.')) return $t(msg as Parameters<typeof $t>[0])
    return msg
  }

  $: id = $page.params.id as string

  let monitor: Monitor | null = null
  let logs: StatusLog[] = []
  let recentLogs: StatusLog[] = []
  let incidents: Incident[] = []
  let daily: DailyUptime[] = []
  let uptime30: number | null = null
  let uptime1: number | null = null
  let uptime7: number | null = null
  let uptime90: number | null = null
  let hbToken: string | null = null
  let checkCount = 0
  let loading = true
  let error = ''
  let ticker: ReturnType<typeof setInterval>
  let copied = false
  let running = false
  let logsPage = 0

  async function load() {
    try {
      monitor = await api.monitors.get(id)
      ;[logs, recentLogs, incidents, daily] = await Promise.all([
        api.monitors.logs(id, 24),
        api.monitors.recentLogs(id, 200),
        api.monitors.incidents(id),
        api.monitors.daily(id, 90),
      ])
      const [u1, u7, u30, u90, countData] = await Promise.all([
        api.monitors.uptime(id, 1),
        api.monitors.uptime(id, 7),
        api.monitors.uptime(id, 30),
        api.monitors.uptime(id, 90),
        api.monitors.checkCount(id),
      ])
      uptime1 = u1.uptime
      uptime7 = u7.uptime
      uptime30 = u30.uptime
      uptime90 = u90.uptime
      checkCount = countData.count
      if (monitor?.type === 'heartbeat') {
        const tok = await api.monitors.hbToken(id)
        hbToken = tok.token
      }
      error = ''
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  async function runChecks() {
    running = true
    try {
      await api.cron.run()
      await load()
    } finally {
      running = false
    }
  }

  async function resetStats() {
    if (!confirm(get(t)('monitor.resetConfirm'))) return
    try {
      await api.monitors.resetStats(id)
      await load()
    } catch (e) {
      error = String(e)
    }
  }

  async function deleteMonitor() {
    if (!monitor) return
    if (!confirm(get(t)('monitor.deleteConfirm', { name: monitor.name }))) return
    try {
      await api.monitors.delete(id)
      goto('/monitors')
    } catch (e) {
      error = String(e)
    }
  }

  async function toggleActive() {
    if (!monitor) return
    const next = !monitor.active
    const msg = next ? get(t)('monitor.enableConfirm') : get(t)('monitor.disableConfirm')
    if (!confirm(msg)) return
    try {
      monitor = await api.monitors.toggleActive(id, next)
    } catch (e) {
      error = String(e)
    }
  }

  async function regenToken() {
    if (!confirm(get(t)('monitor.regenConfirm'))) return
    const tok = await api.monitors.regenToken(id)
    hbToken = tok.token
  }

  async function copyToken() {
    if (!hbToken) return
    await navigator.clipboard.writeText(`${location.origin}/h/${hbToken}`)
    copied = true
    setTimeout(() => copied = false, 2000)
  }

  onMount(() => { load(); ticker = setInterval(load, 10_000) })
  onDestroy(() => clearInterval(ticker))

  $: avgResponseTime = logs.length && logs.filter(l => l.responseTimeMs).length
    ? Math.round(logs.filter(l => l.responseTimeMs).reduce((s, l) => s + (l.responseTimeMs ?? 0), 0) / logs.filter(l => l.responseTimeMs).length)
    : null

  $: openIncidents = incidents.filter(i => !i.resolvedAt).length
  $: tags = monitor ? parseTags(monitor.tags) : []

  $: headerCount = (() => { try { return Object.keys(JSON.parse(monitor?.headers ?? '{}')).length } catch { return 0 } })()
  $: protocol = monitor?.url?.startsWith('https://') ? 'HTTPS' : monitor?.url?.startsWith('http://') ? 'HTTP' : ''

  $: totalLogPages = Math.max(1, Math.ceil(recentLogs.length / 20))
  $: pagedLogs = recentLogs.slice(logsPage * 20, (logsPage + 1) * 20)
  $: { if (logsPage >= totalLogPages) logsPage = Math.max(0, totalLogPages - 1) }
</script>

<svelte:head><title>{monitor?.name ?? 'Monitor'} - Pingflare</title></svelte:head>

{#if loading}
  <PageLoader />

{:else if !monitor}
  <div class="p-6 space-y-4">
    {#if error}<p class="text-sm text-red-400">{error}</p>{/if}
    <p style="color: rgb(var(--text-muted))">{$t('monitor.notFound')}</p>
    <a href="/monitors" class="btn-primary inline-flex">{$t('monitor.back')}</a>
  </div>

{:else}
<div style="background-color: rgb(var(--bg))">

  <div class="relative overflow-hidden" style="border-bottom: 1px solid var(--border-color)">
    <HeaderPattern />
    <div class="relative px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto">
      <a href="/monitors" class="inline-flex items-center gap-1 text-xs mb-4 transition-colors hover:text-[var(--color-primary)]"
        style="color: rgb(var(--text-muted))">{$t('monitor.back')}</a>
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-start gap-3 min-w-0">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl md:text-3xl font-semibold tracking-tight" style="color: rgb(var(--text))">{monitor.name}</h1>
              <StatusBadge status={monitor.lastStatus} />
              {#if monitor.sslCheckEnabled && monitor.sslStatus !== 'unknown'}
                <span class="text-xs px-2 py-0.5 rounded font-medium {monitor.sslStatus === 'ok' ? 'text-green-600' : 'text-red-400'}"
                  style="background: {monitor.sslStatus === 'ok' ? 'rgb(34 197 94 / .1)' : 'rgb(239 68 68 / .1)'}">
                  {$t('monitor.ssl')}: {monitor.sslStatus === 'ok' ? $t('monitor.sslOk') : $t('monitor.sslError')}
                </span>
              {/if}
            </div>
            {#if monitor.url}
              <p class="text-xs font-mono mt-1 truncate max-w-xs md:max-w-none" style="color: rgb(var(--text-muted))">{monitor.url}</p>
            {:else if monitor.type === 'dns' && monitor.dnsResolverUrl}
              <p class="text-xs font-mono mt-1 truncate max-w-xs md:max-w-none" style="color: rgb(var(--text-muted))">{monitor.dnsResolverUrl}</p>
            {:else if monitor.type === 'ping' && monitor.url}
              <p class="text-xs font-mono mt-1 truncate max-w-xs md:max-w-none" style="color: rgb(var(--text-muted))">{monitor.url}</p>
            {/if}
            {#if monitor.type === 'http'}
              <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style="color: rgb(var(--text-muted))">
                <span>{$t('monitor.configInterval')}: {monitor.interval}s</span>
                {#if protocol}<span>{$t('monitor.configProtocol')}: {protocol}</span>{/if}
                <span>{$t('monitor.configMethod')}: {monitor.method}</span>
                <span>{$t('monitor.configTimeout')}: {monitor.timeout}s</span>
                {#if headerCount > 0}<span>{$t('monitor.configHeaders')}: {headerCount}</span>{/if}
                {#if monitor.cacheBooster}<span class="text-[var(--color-primary)]">{$t('monitor.configCacheBooster')}: ON</span>{/if}
                {#if monitor.sslCheckEnabled}<span class="text-[var(--color-primary)]">{$t('monitor.configSslCheck')}: ON</span>{/if}
              </div>
            {/if}
            {#if monitor.type === 'dns'}
              <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style="color: rgb(var(--text-muted))">
                <span>{$t('monitor.configInterval')}: {monitor.interval}s</span>
                {#if monitor.dnsHostname}<span>{$t('monitor.configDnsHostname')}: {monitor.dnsHostname}</span>{/if}
                {#if monitor.dnsRecordType}<span>{$t('monitor.configDnsRecordType')}: {monitor.dnsRecordType}</span>{/if}
                <span>{$t('monitor.configTimeout')}: {monitor.timeout}s</span>
                {#if monitor.dnsExpectedIp}<span class="text-[var(--color-primary)]">{$t('monitor.configDnsExpected')}: {monitor.dnsExpectedIp}</span>{/if}
              </div>
            {/if}
            {#if monitor.type === 'ping'}
              <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style="color: rgb(var(--text-muted))">
                <span>{$t('monitor.configInterval')}: {monitor.interval}s</span>
                <span>{$t('monitor.configTimeout')}: {monitor.timeout}s</span>
              </div>
            {/if}
            {#if tags.length > 0}
              <div class="flex gap-1.5 mt-2 flex-wrap">
                {#each tags as tag}
                  <span class="text-xs px-2 py-0.5 rounded font-medium"
                    style="background: rgb(255 102 51 / .08); color: var(--color-primary)">{tag}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="flex gap-2 shrink-0">
          {#if monitor.lastStatus === 'pending'}
            <button class="btn-outline text-xs" on:click={runChecks} disabled={running} title={$t('monitor.checkNow')}>
              <Icon name="arrow-path" size={14} cls={running ? 'animate-spin' : ''} />
              <span class="hidden sm:inline">{running ? $t('monitor.checking') : $t('monitor.checkNow')}</span>
            </button>
          {/if}
          <a href="/monitors/{id}/edit" class="btn-outline">
            <Icon name="pencil" size={14} />
            <span class="hidden sm:inline">{$t('monitor.edit')}</span>
          </a>
        </div>
      </div>
    </div>
  </div>

  <div class="px-4 py-5 md:px-8 md:py-8 max-w-5xl mx-auto space-y-4">

    {#if error}
      <div class="flex items-center gap-2 px-4 py-3 rounded text-sm"
        style="background: rgb(239 68 68 / .08); color: #ef4444; border: 1px solid rgb(239 68 68 / .3)">
        <Icon name="exclamation-triangle" size={14} />
        {error}
      </div>
    {/if}

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div class="stat-card">
        <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.uptime30d')}</div>
        <div class="text-2xl font-bold tracking-tight tabular-nums text-green-500">{formatUptime(uptime30)}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.avgResponse')}</div>
        <div class="text-2xl font-bold tracking-tight tabular-nums" style="color: rgb(var(--text))">
          {avgResponseTime != null ? `${avgResponseTime}ms` : '-'}
        </div>
      </div>
      <div class="stat-card" style="{openIncidents > 0 ? 'border-color: rgb(239 68 68 / .45)' : ''}">
        <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.openIncidents')}</div>
        <div class="text-2xl font-bold tracking-tight tabular-nums {openIncidents > 0 ? 'text-red-400' : ''}"
          style="{openIncidents === 0 ? 'color: rgb(var(--text))' : ''}">{openIncidents}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.lastCheck')}</div>
        <div class="text-base font-semibold" style="color: rgb(var(--text))">{formatRelative(monitor.lastCheckedAt, $locale)}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.totalChecks')}</div>
        <div class="text-2xl font-bold tracking-tight tabular-nums" style="color: rgb(var(--text))">{checkCount.toLocaleString()}</div>
      </div>
    </div>


<div class="card">
      <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.uptime90d')}</h2>
      <UptimeChart data={daily} />
    </div>

    <div class="card">
      <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.overallUptime')}</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 divide-x" style="border: 1px solid var(--border-color); margin: -1px">
        {#each [
          { label: $t('monitor.last24h'), value: uptime1 },
          { label: $t('monitor.last7d'),  value: uptime7 },
          { label: $t('monitor.last30d'), value: uptime30 },
          { label: $t('monitor.last90d'), value: uptime90 },
        ] as period, i}
          <div class="flex flex-col items-center justify-center py-5 px-3 {i > 1 ? 'col-span-1' : ''}"
            style="border-color: var(--border-color)">
            <div class="text-xs mb-1.5" style="color: rgb(var(--text-muted))">{period.label}</div>
            <div class="text-xl font-bold tabular-nums {period.value === null ? '' : period.value >= 99 ? 'text-green-500' : period.value >= 95 ? 'text-yellow-400' : 'text-red-400'}"
              style="{period.value === null ? 'color: rgb(var(--text-muted))' : ''}">
              {formatUptime(period.value)}
            </div>
          </div>
        {/each}
      </div>
    </div>

    {#if monitor.type === 'http' || monitor.type === 'dns' || monitor.type === 'ping'}
    <div class="card">
      <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.responseTime')}</h2>
      <ResponseTimeChart {logs} height={80} />
    </div>
    {/if}

    {#if monitor.type === 'heartbeat' && hbToken}
    <div class="card space-y-3">
      <div>
        <h2 class="text-sm font-semibold" style="color: rgb(var(--text))">{$t('monitor.heartbeatUrl')}</h2>
        <p class="text-xs mt-0.5" style="color: rgb(var(--text-muted))">
          {$t('monitor.heartbeatUrlDesc')}
        </p>
      </div>
      <div class="flex flex-col sm:flex-row gap-2">
        <code class="flex-1 input text-xs font-mono truncate"
          style="background-color: rgb(var(--bg-subtle))">
          {location.origin}/h/{hbToken}
        </code>
        <div class="flex gap-2">
          <button class="btn-outline text-xs flex-1 sm:flex-none justify-center" on:click={copyToken}>
            <Icon name={copied ? 'check-circle' : 'clipboard'} size={14} />
            {copied ? $t('monitor.copied') : $t('monitor.copy')}
          </button>
          <button class="btn-outline text-xs flex-1 sm:flex-none justify-center" on:click={regenToken}>
            <Icon name="arrow-path" size={14} />
            {$t('monitor.regen')}
          </button>
        </div>
      </div>
    </div>
    {/if}

    <div class="card">
      <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.incidents')}</h2>
      {#if incidents.length === 0}
        <div class="flex items-center gap-2 text-sm" style="color: rgb(var(--text-muted))">
          <Icon name="check-circle" size={18} cls="text-green-500" />
          {$t('monitor.noIncidents')}
        </div>
      {:else}
        <div class="space-y-0">
          {#each incidents.slice(0, 20) as incident}
            <div class="flex items-center justify-between py-3 text-sm"
              style="border-bottom: 1px solid var(--border-color)">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full shrink-0 {incident.resolvedAt ? 'bg-green-500' : 'bg-red-500 animate-pulse'}"></span>
                <span class="font-medium {incident.resolvedAt ? '' : 'text-red-400'}"
                  style="{incident.resolvedAt ? 'color: rgb(var(--text))' : ''}">
                  {incident.resolvedAt ? $t('monitor.resolved') : $t('monitor.ongoing')}
                </span>
                <span class="text-xs hidden sm:inline" style="color: rgb(var(--text-muted))">{formatTs(incident.startedAt)}</span>
              </div>
              <span class="text-xs tabular-nums" style="color: rgb(var(--text-muted))">
                {incident.resolvedAt ? formatDuration(incident.durationSeconds) : $t('monitor.ongoingFor', { duration: formatRelative(incident.startedAt, $locale) })}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold" style="color: rgb(var(--text))">{$t('monitor.recentChecks')}</h2>
        {#if recentLogs.length > 0}
          <span class="text-xs" style="color: rgb(var(--text-muted))">
            {logsPage * 20 + 1}–{Math.min((logsPage + 1) * 20, recentLogs.length)} / {recentLogs.length}
          </span>
        {/if}
      </div>
      {#if recentLogs.length === 0}
        <p class="text-sm" style="color: rgb(var(--text-muted))">
          {$t('monitor.noLogs')} {monitor.lastStatus === 'pending' ? $t('monitor.noLogsPending') : ''}
        </p>
      {:else}
        <table class="w-full text-xs">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color)">
              <th class="text-left pb-2 pr-3 font-medium w-14" style="color: rgb(var(--text-muted))">{$t('monitor.colStatus')}</th>
              <th class="text-left pb-2 pr-3 font-medium hidden sm:table-cell w-40" style="color: rgb(var(--text-muted))">{$t('monitor.colTime')}</th>
              {#if monitor.type === 'http' || monitor.type === 'dns' || monitor.type === 'ping'}
              <th class="text-left pb-2 pr-3 font-medium hidden sm:table-cell w-24" style="color: rgb(var(--text-muted))">{$t('monitor.colResponse')}</th>
              {/if}
              <th class="text-left pb-2 font-medium" style="color: rgb(var(--text-muted))">{$t('monitor.colMessage')}</th>
            </tr>
          </thead>
          <tbody>
            {#each pagedLogs as log}
              <tr class="hover:bg-[rgb(var(--bg-muted))] transition-colors" style="border-bottom: 1px solid var(--border-color)">
                <td class="py-2.5 pr-3">
                  <span class="font-mono font-bold tabular-nums
                    {log.status === 'up' ? 'text-green-500' : log.status === 'down' ? 'text-red-400' : 'text-primary'}">
                    {log.status.toUpperCase()}
                  </span>
                </td>
                <td class="py-2.5 pr-3 hidden sm:table-cell tabular-nums" style="color: rgb(var(--text-muted))">{formatTs(log.checkedAt)}</td>
                {#if monitor.type === 'http' || monitor.type === 'dns' || monitor.type === 'ping'}
                <td class="py-2.5 pr-3 hidden sm:table-cell" style="color: rgb(var(--text-muted))">
                  <span class="inline-flex items-center gap-1.5">
                    {#if log.countryCode}
                      <span class="fi fi-{log.countryCode.toLowerCase()} shrink-0"
                        title="{log.countryCode} · {log.originIp ?? ''} · DC {log.colo}"
                        style="width:16px;height:12px;border-radius:2px"></span>
                    {/if}
                    <span class="font-mono tabular-nums">{log.responseTimeMs != null ? `${log.responseTimeMs}ms` : '—'}</span>
                  </span>
                </td>
                {/if}
                <td class="py-2.5" style="color: rgb(var(--text-muted))">
                  <span class="break-words">{logMsg(log.message)}</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if totalLogPages > 1}
          <div class="flex items-center justify-between mt-3">
            <button
              class="btn-outline text-xs py-1 px-2"
              disabled={logsPage === 0}
              on:click={() => logsPage--}
            >{$t('monitor.prevPage')}</button>
            <span class="text-xs" style="color: rgb(var(--text-muted))">{logsPage + 1} / {totalLogPages}</span>
            <button
              class="btn-outline text-xs py-1 px-2"
              disabled={logsPage + 1 >= totalLogPages}
              on:click={() => logsPage++}
            >{$t('monitor.nextPage')}</button>
          </div>
        {/if}
      {/if}
    </div>

    <div class="rounded-lg overflow-hidden" style="border: 1px solid rgb(239 68 68 / .35)">
      <div class="px-4 py-3" style="background: rgb(239 68 68 / .07); border-bottom: 1px solid rgb(239 68 68 / .25)">
        <h2 class="text-sm font-semibold text-red-400">{$t('monitor.dangerZone')}</h2>
      </div>
      <div class="px-4 py-4 space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium" style="color: rgb(var(--text))">{monitor.active ? $t('monitor.disable') : $t('monitor.enable')}</p>
            <p class="text-xs mt-0.5" style="color: rgb(var(--text-muted))">
              {monitor.active ? $t('monitor.disableConfirm') : $t('monitor.enableConfirm')}
            </p>
          </div>
          <button class="btn-outline text-xs shrink-0 {monitor.active ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-500 hover:text-green-400'}" on:click={toggleActive}>
            <Icon name={monitor.active ? 'pause' : 'play'} size={14} />
            {monitor.active ? $t('monitor.disable') : $t('monitor.enable')}
          </button>
        </div>
        <div style="border-top: 1px solid var(--border-color)"></div>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium" style="color: rgb(var(--text))">{$t('monitor.resetStats')}</p>
            <p class="text-xs mt-0.5" style="color: rgb(var(--text-muted))">{$t('monitor.resetConfirm')}</p>
          </div>
          <button class="btn-outline text-xs text-red-400 hover:text-red-300 shrink-0" on:click={resetStats}>
            <Icon name="arrow-path" size={14} />
            {$t('monitor.resetStats')}
          </button>
        </div>
        <div style="border-top: 1px solid var(--border-color)"></div>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium" style="color: rgb(var(--text))">{$t('monitor.deleteMonitor')}</p>
            <p class="text-xs mt-0.5" style="color: rgb(var(--text-muted))">{$t('monitor.deleteConfirm', { name: monitor.name })}</p>
          </div>
          <button class="btn-outline text-xs text-red-400 hover:text-red-300 shrink-0" on:click={deleteMonitor}>
            <Icon name="trash" size={14} />
            {$t('monitor.deleteMonitor')}
          </button>
        </div>
      </div>
    </div>

  </div>
</div>
{/if}

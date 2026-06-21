<script lang="ts">
  import { page } from '$app/stores'
  import { onMount, onDestroy } from 'svelte'
  import { theme } from '$lib/stores'
  import { t, locale } from '$lib/i18n'
  import { formatRelative, formatDuration, formatTs, formatUptime, parseTags } from '$lib/utils'
  import Icon from '$lib/components/Icon.svelte'
  import HeaderPattern from '$lib/components/HeaderPattern.svelte'
  import StatusBadge from '$lib/components/StatusBadge.svelte'
  import UptimeChart from '$lib/components/UptimeChart.svelte'
  import ResponseTimeChart from '$lib/components/ResponseTimeChart.svelte'
  import HeartbeatBorder from '$lib/components/HeartbeatBorder.svelte'
  import type { StatusLog, DailyUptime } from '$lib/api'

  const slug = $page.params.slug
  const monitorId = $page.params.monitorId

  interface PublicMonitorData {
    name: string
    type: 'http' | 'heartbeat'
    url: string | null
    tags: string
    lastStatus: 'up' | 'down' | 'degraded' | 'pending'
    lastCheckedAt: number | null
    uptime1: number | null
    uptime7: number | null
    uptime30: number | null
    uptime90: number | null
    avgResponseMs: number | null
    daily: DailyUptime[]
    logs: { checkedAt: number; status: string; responseTimeMs: number | null; message: string | null }[]
    incidents: { startedAt: number; resolvedAt: number | null; durationSeconds: number | null }[]
  }

  let data: PublicMonitorData | null = null
  let loading = true
  let error = ''
  let isProtected = false
  let wrongPassword = false
  let password = ''
  let ticker: ReturnType<typeof setInterval>

  async function load(pw?: string) {
    const headers: Record<string, string> = {}
    if (pw) headers['X-Status-Password'] = pw
    const res = await fetch(`/api/public/status/${slug}/monitors/${monitorId}`, { headers })
    const json = await res.json()
    if (res.status === 401) {
      isProtected = true
      wrongPassword = json.error === 'wrong_password'
      loading = false
      return
    }
    if (!res.ok) { error = json.error ?? `Error ${res.status}`; loading = false; return }
    data = json as PublicMonitorData
    isProtected = false
    wrongPassword = false
    loading = false
  }

  async function submitPassword() {
    loading = true
    await load(password)
  }

  let isFullscreen = false

  function onFullscreenChange() {
    isFullscreen = !!document.fullscreenElement
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  onMount(() => {
    load()
    ticker = setInterval(() => load(password || undefined), 30_000)
    document.addEventListener('fullscreenchange', onFullscreenChange)
  })
  onDestroy(() => {
    clearInterval(ticker)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
  })

  function logMsg(msg: string | null): string {
    if (!msg) return ''
    if (msg.startsWith('notify.')) return $t(msg as Parameters<typeof $t>[0])
    return msg
  }

  $: tags = data ? parseTags(data.tags) : []
  $: openIncidents = data ? data.incidents.filter(i => !i.resolvedAt).length : 0
  $: typedLogs = data ? (data.logs as unknown as StatusLog[]) : []
</script>

<svelte:head>
  <title>{data?.name ?? 'Monitor'} - Status</title>
</svelte:head>

<div class="min-h-screen" style="background-color: rgb(var(--bg)); color: rgb(var(--text))">

  <header style="background-color: rgb(var(--bg-subtle)); border-bottom: 1px solid var(--border-color)">
    <div class="max-w-5xl mx-auto flex items-center h-14 px-4 gap-3">
      <a href="/" aria-label="StayPut" class="shrink-0 mr-1">
        <img src="/logo.png" alt="StayPut" class="h-6 object-contain" />
      </a>
      <div class="flex items-center gap-1.5 text-sm flex-1 min-w-0">
        <a href="/s/{slug}" class="shrink-0 font-medium transition-colors hover:text-[var(--color-primary)]"
          style="color: rgb(var(--text-muted))">StayPut</a>
        <span style="color: rgb(var(--text-muted))">/</span>
        <span class="font-medium truncate" style="color: rgb(var(--text))">{data?.name ?? '…'}</span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="btn-outline p-2"
          aria-label={$theme === 'dark' ? $t('pub.toLightMode') : $t('pub.toDarkMode')}
          on:click={() => theme.toggle()}>
          <Icon name={$theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <button
          type="button"
          class="btn-outline p-2"
          aria-label={isFullscreen ? $t('pub.exitFullscreen') : $t('pub.enterFullscreen')}
          on:click={toggleFullscreen}>
          {#if isFullscreen}
            <Icon name="arrows-pointing-in" size={18} />
          {:else}
            <Icon name="arrows-pointing-out" size={18} />
          {/if}
        </button>
      </div>
    </div>
  </header>

  {#if loading && !isProtected}
    <div class="max-w-5xl mx-auto px-4 py-10 space-y-4">
      {#each [1,2,3] as _}
        <div class="h-24 rounded animate-pulse" style="background-color: rgb(var(--card)); border: 1px solid var(--border-color)"></div>
      {/each}
    </div>

  {:else if isProtected && !data}
    <div class="max-w-5xl mx-auto px-4 py-16">
      <div class="rounded p-8 max-w-sm mx-auto text-center space-y-4"
        style="background-color: rgb(var(--card)); border: 1px solid var(--border-color)">
        <div class="w-10 h-10 rounded-full flex items-center justify-center mx-auto"
          style="background: rgb(249 115 22 / .1); color: var(--color-primary)">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
          </svg>
        </div>
        {#if wrongPassword}
          <p class="text-xs text-red-400">{$t('pub.wrongPassword')}</p>
        {/if}
        <form on:submit|preventDefault={submitPassword} class="space-y-3">
          <input type="password" bind:value={password} placeholder={$t('pub.enterPassword')} required class="input" />
          <button type="submit" class="btn-primary w-full">
            {loading ? $t('pub.checking') : $t('pub.accessPage')}
          </button>
        </form>
      </div>
    </div>

  {:else if error}
    <div class="max-w-5xl mx-auto px-4 py-10">
      <div class="flex items-center gap-2 px-4 py-3 rounded text-sm"
        style="background: rgb(239 68 68 / .08); color: #ef4444; border: 1px solid rgb(239 68 68 / .3)">
        <Icon name="exclamation-triangle" size={14} />{error}
      </div>
    </div>

  {:else if data}
    <div class="relative overflow-hidden">
      <HeaderPattern />
      <HeartbeatBorder status={data.lastStatus} />
      <div class="relative max-w-5xl mx-auto px-4 py-8 md:py-10">
        <div class="flex items-start gap-3 min-w-0">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl md:text-2xl font-semibold tracking-tight" style="color: rgb(var(--text))">{data.name}</h1>
              <StatusBadge status={data.lastStatus} />
            </div>
            {#if data.url}
              <p class="text-xs font-mono mt-1 truncate max-w-xs md:max-w-none" style="color: rgb(var(--text-muted))">{data.url}</p>
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
      </div>
    </div>

    <div class="max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-4">

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="stat-card">
          <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.uptime30d')}</div>
          <div class="text-2xl font-bold tracking-tight tabular-nums text-green-500">{formatUptime(data.uptime30)}</div>
        </div>
        <div class="stat-card">
          <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.avgResponse')}</div>
          <div class="text-2xl font-bold tracking-tight tabular-nums" style="color: rgb(var(--text))">
            {data.avgResponseMs != null ? `${data.avgResponseMs}ms` : '-'}
          </div>
        </div>
        <div class="stat-card" style="{openIncidents > 0 ? 'border-color: rgb(239 68 68 / .45)' : ''}">
          <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.openIncidents')}</div>
          <div class="text-2xl font-bold tracking-tight tabular-nums {openIncidents > 0 ? 'text-red-400' : ''}"
            style="{openIncidents === 0 ? 'color: rgb(var(--text))' : ''}">{openIncidents}</div>
        </div>
        <div class="stat-card">
          <div class="text-xs mb-2" style="color: rgb(var(--text-muted))">{$t('monitor.lastCheck')}</div>
          <div class="text-base font-semibold" style="color: rgb(var(--text))">{formatRelative(data.lastCheckedAt, $locale)}</div>
        </div>
      </div>

      <div class="card">
        <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.uptime90d')}</h2>
        <UptimeChart data={data.daily} />
      </div>

      <div class="card">
        <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.overallUptime')}</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 divide-x" style="border: 1px solid var(--border-color); margin: -1px">
          {#each [
            { label: $t('monitor.last24h'),  value: data.uptime1  },
            { label: $t('monitor.last7d'),   value: data.uptime7  },
            { label: $t('monitor.last30d'),  value: data.uptime30 },
            { label: $t('monitor.last90d'),  value: data.uptime90 },
          ] as period}
            <div class="flex flex-col items-center justify-center py-5 px-3"
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

      {#if data.type === 'http'}
        <div class="card">
          <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.responseTime')}</h2>
          <ResponseTimeChart logs={typedLogs} height={80} />
        </div>
      {/if}

      <div class="card">
        <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.incidents')}</h2>
        {#if data.incidents.length === 0}
          <div class="flex items-center gap-2 text-sm" style="color: rgb(var(--text-muted))">
            <Icon name="check-circle" size={18} cls="text-green-500" />
            {$t('monitor.noIncidents')}
          </div>
        {:else}
          <div class="space-y-0">
            {#each data.incidents as incident}
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
                  {incident.resolvedAt
                    ? formatDuration(incident.durationSeconds)
                    : $t('monitor.ongoingFor', { duration: formatRelative(incident.startedAt, $locale) })}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="card">
        <h2 class="text-sm font-semibold mb-4" style="color: rgb(var(--text))">{$t('monitor.recentChecks')}</h2>
        {#if data.logs.length === 0}
          <p class="text-sm" style="color: rgb(var(--text-muted))">{$t('monitor.noLogs')}</p>
        {:else}
          <div class="text-xs max-h-72 overflow-auto -mx-1.5">
            {#each data.logs.slice(0, 50) as log}
              <div class="flex items-center gap-2 px-1.5 py-2 hover:bg-[rgb(var(--bg-muted))] transition-colors">
                <span class="font-mono font-bold w-10 shrink-0 tabular-nums
                  {log.status === 'up' ? 'text-green-500' : log.status === 'down' ? 'text-red-400' : 'text-primary'}">
                  {log.status.toUpperCase()}
                </span>
                <span class="hidden sm:block w-36 shrink-0 tabular-nums" style="color: rgb(var(--text-muted))">{formatTs(log.checkedAt)}</span>
                {#if log.responseTimeMs != null}
                  <span class="hidden sm:block w-16 shrink-0 font-mono tabular-nums" style="color: rgb(var(--text-muted))">{log.responseTimeMs}ms</span>
                {/if}
                <span class="truncate" style="color: rgb(var(--text-muted))">{logMsg(log.message)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    </div>
  {/if}

</div>

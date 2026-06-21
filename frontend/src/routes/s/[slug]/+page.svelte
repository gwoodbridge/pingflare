<script lang="ts">
  import { page } from '$app/stores'
  import { onMount, onDestroy } from 'svelte'
  import { theme } from '$lib/stores'
  import { t } from '$lib/i18n'
  import Icon from '$lib/components/Icon.svelte'
  import HeaderPattern from '$lib/components/HeaderPattern.svelte'
  import HeartbeatBorder from '$lib/components/HeartbeatBorder.svelte'
  import type { PublicStatusPage, PublicIncident, IncidentStatus } from '$lib/api'

  const slug = $page.params.slug

  let data: PublicStatusPage | null = null
  let loading = true
  let error = ''
  let isProtected = false
  let wrongPassword = false
  let password = ''
  let protectedPage: { name: string; description: string | null } | null = null
  let ticker: ReturnType<typeof setInterval>
  let isFullscreen = false
  let countdown = 60

  async function load(pw?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (pw) headers['X-Status-Password'] = pw
    const res = await fetch(`/api/public/status/${slug}`, { headers })
    const json = await res.json()
    if (res.status === 401) {
      isProtected = true
      wrongPassword = json.error === 'wrong_password'
      if (json.page) protectedPage = json.page
      loading = false
      return
    }
    if (!res.ok) { error = json.error ?? `Error ${res.status}`; loading = false; return }
    data = json as PublicStatusPage
    isProtected = false
    wrongPassword = false
    loading = false
  }

  function onFullscreenChange() {
    isFullscreen = !!document.fullscreenElement
  }

  onMount(() => {
    load()
    ticker = setInterval(() => {
      countdown = countdown <= 1 ? 60 : countdown - 1
      if (countdown === 60) load(password || undefined)
    }, 1000)
    document.addEventListener('fullscreenchange', onFullscreenChange)
  })
  onDestroy(() => {
    clearInterval(ticker)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
  })

  async function submitPassword() {
    loading = true
    await load(password)
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // Trust the server's worst-of rollup; map its "down" to the template's "outage".
  $: overallStatus = !data ? 'unknown' : data.overall === 'down' ? 'outage' : data.overall

  $: faviconColor = overallStatus === 'operational' ? '#22c55e' : overallStatus === 'outage' ? '#ef4444' : overallStatus === 'degraded' ? '#f97316' : '#9ca3af'
  $: faviconHref = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${faviconColor}"/></svg>`)}`

  $: activeIncidents   = data?.incidents.filter(i => !i.resolvedAt) ?? []
  $: resolvedIncidents = data?.incidents.filter(i => i.resolvedAt).slice(0, 10) ?? []

  function uptimeColor(uptime: number | null): string {
    if (uptime === null) return 'rgb(var(--text-muted))'
    if (uptime >= 99) return '#22c55e'
    if (uptime >= 95) return '#4ade80'
    if (uptime >= 80) return '#facc15'
    return '#ef4444'
  }

  function barColor(uptime: number | null): string {
    if (uptime === null) return 'bg-neutral-200 dark:bg-neutral-600'
    if (uptime >= 99) return 'bg-green-500'
    if (uptime >= 95) return 'bg-green-400'
    if (uptime >= 80) return 'bg-yellow-400'
    return 'bg-red-400'
  }

  $: statusLabel = (s: string): string =>
    ({ up: $t('pub.statusOperational'), down: $t('pub.statusOutage'), degraded: $t('pub.degraded'), pending: $t('pub.statusPending') } as Record<string,string>)[s] ?? s

  function statusDotCls(s: string): string {
    return ({ up: 'bg-green-500', down: 'bg-red-500', degraded: 'bg-amber-500', pending: 'bg-orange-400' } as Record<string,string>)[s] ?? 'bg-[rgb(var(--text-muted))]'
  }

  function statusAccentColor(s: string): string {
    return ({ up: '#22c55e', down: '#ef4444', degraded: '#f59e0b', pending: 'var(--color-primary)' } as Record<string,string>)[s] ?? '#22c55e'
  }

  function incidentBadgeCls(s: IncidentStatus): string {
    return ({
      investigating: 'text-red-400 bg-red-500/10 border-red-500/20',
      identified:    'text-orange-400 bg-orange-500/10 border-orange-500/20',
      monitoring:    'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
      resolved:      'text-green-400 bg-green-500/10 border-green-500/20',
    } as Record<string,string>)[s] ?? ''
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  function tIncidentStatus(s: string): string {
    return $t(('incidentStatus.' + s) as Parameters<typeof $t>[0])
  }

</script>

<svelte:head>
  <title>{data?.page.name ?? 'Status'} - Status Page</title>
  {#if data?.page.description}
    <meta name="description" content={data.page.description} />
  {/if}
  <link rel="icon" type="image/svg+xml" href={faviconHref} />
</svelte:head>

<div class="min-h-screen" style="background-color: rgb(var(--bg)); color: rgb(var(--text))">

  <header style="background-color: rgb(var(--bg-subtle)); border-bottom: 1px solid var(--border-color)">
    <div class="max-w-5xl mx-auto flex items-center h-14 px-4 gap-3">
      <a href="/" aria-label="Pingflare" class="shrink-0 mr-1">
        <img src="/logo.png" alt="Pingflare" class="h-6 object-contain" />
      </a>
      <span class="text-sm font-medium truncate flex-1" style="color: rgb(var(--text))">Pingflare</span>
      <div class="flex items-center gap-1 shrink-0">
        {#if data}
          <span class="text-xs tabular-nums px-1.5" style="color: rgb(var(--text-muted))">{countdown}s</span>
        {/if}
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

  {#if data || isProtected}
    <div class="relative overflow-hidden">
      <HeaderPattern />
      <HeartbeatBorder status={overallStatus === 'operational' ? 'up' : overallStatus === 'outage' ? 'down' : 'pending'} />
      <div class="relative max-w-5xl mx-auto px-4 py-8 md:py-10">
        {#if data}
          <div class="mb-3">
            {#if overallStatus === 'operational'}
              <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                style="background: rgb(34 197 94 / .1); color: #22c55e; border: 1px solid rgb(34 197 94 / .2)">
                <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                {$t('pub.allOperational')}
              </span>
            {:else if overallStatus === 'outage'}
              <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                style="background: rgb(239 68 68 / .1); color: #ef4444; border: 1px solid rgb(239 68 68 / .2)">
                <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                {$t('pub.outage')}
              </span>
            {:else if overallStatus === 'degraded'}
              <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                style="background: rgb(249 115 22 / .1); color: #f97316; border: 1px solid rgb(249 115 22 / .2)">
                <span class="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></span>
                {$t('pub.degraded')}
              </span>
            {/if}
          </div>
          <h1 class="text-2xl md:text-3xl font-semibold tracking-tight" style="color: rgb(var(--text))">{data.page.name}</h1>
          {#if data.page.description}
            <p class="mt-1 text-sm" style="color: rgb(var(--text-muted))">{data.page.description}</p>
          {/if}
        {:else if isProtected && protectedPage}
          <h1 class="text-2xl md:text-3xl font-semibold tracking-tight" style="color: rgb(var(--text))">{protectedPage.name}</h1>
          {#if protectedPage.description}
            <p class="mt-1 text-sm" style="color: rgb(var(--text-muted))">{protectedPage.description}</p>
          {/if}
        {:else if isProtected}
          <h1 class="text-2xl font-semibold tracking-tight" style="color: rgb(var(--text))">{$t('pub.protected')}</h1>
        {/if}
      </div>
    </div>
  {/if}

  <div class="max-w-5xl mx-auto px-4 py-8 space-y-8">

    {#if loading && !isProtected}
      <div class="space-y-3">
        {#each [1,2,3] as _}
          <div class="h-20 rounded animate-pulse" style="background-color: rgb(var(--card)); border: 1px solid var(--border-color)"></div>
        {/each}
      </div>
    {/if}

    {#if isProtected && !data}
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
    {/if}

    {#if error}
      <div class="flex items-center gap-2 px-4 py-3 rounded text-sm"
        style="background: rgb(239 68 68 / .08); color: #ef4444; border: 1px solid rgb(239 68 68 / .3)">
        <Icon name="exclamation-triangle" size={14} />{error}
      </div>
    {/if}

    {#if data}

      {#if activeIncidents.length > 0}
        <section class="space-y-3">
          <h2 class="section-title">{$t('pub.activeIncidents')}</h2>
          {#each activeIncidents as inc}
            <div class="card space-y-3" style="border-color: rgb(239 68 68 / .35)">
              <div class="flex items-start gap-3">
                <div class="flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-semibold text-sm" style="color: rgb(var(--text))">{inc.title}</h3>
                    <span class="text-xs px-2 py-0.5 rounded border font-medium {incidentBadgeCls(inc.status)}">{tIncidentStatus(inc.status)}</span>
                  </div>
                  <p class="text-xs mt-1" style="color: rgb(var(--text-muted))">{$t('pub.started')} {formatDate(inc.startedAt)}</p>
                </div>
              </div>
              {#if inc.updates.length > 0}
                <div class="space-y-3 pl-3" style="border-left: 2px solid var(--border-color)">
                  {#each inc.updates as u}
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs px-1.5 py-0.5 rounded border {incidentBadgeCls(u.status)}">{tIncidentStatus(u.status)}</span>
                        <span class="text-xs" style="color: rgb(var(--text-muted))">{formatDate(u.createdAt)}</span>
                      </div>
                      <p class="text-sm mt-1" style="color: rgb(var(--text))">{u.message}</p>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </section>
      {/if}

      <section class="space-y-3">
        <h2 class="section-title">{$t('pub.services')}</h2>
        {#if data.monitors.length === 0}
          <p class="text-sm" style="color: rgb(var(--text-muted))">{$t('pub.noMonitors')}</p>
        {:else}
          <div class="space-y-2">
            {#each data.monitors as m}
              <a href="/s/{slug}/{m.id}" class="card py-3 px-4 block relative overflow-hidden hover:border-[var(--color-primary)] transition-colors" style="text-decoration: none">
                <div class="absolute left-0 top-0 bottom-0 w-0.5 transition-all"
                  style="background-color: {statusAccentColor(m.status)}; opacity: {m.status === 'up' ? '0.5' : '1'}"></div>
                <div class="flex items-center gap-3 mb-2">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0 {statusDotCls(m.status)}
                    {m.status === 'down' || m.status === 'degraded' ? 'animate-pulse' : ''}"></span>
                  <span class="font-medium text-sm flex-1" style="color: rgb(var(--text))">{m.name}</span>
                  <span class="text-xs font-medium tabular-nums" style="color: {uptimeColor(m.uptime90d)}">
                    {m.uptime90d !== null ? `${m.uptime90d.toFixed(2)}% ${$t('pub.uptime')}` : statusLabel(m.status)}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    style="color: rgb(var(--text-muted)); flex-shrink:0">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
                <div class="flex gap-0.5">
                  {#each m.daily as day}
                    <div
                      class="flex-1 h-5 rounded-sm {barColor(day.uptime)}"
                      title="{day.date}: {day.uptime !== null ? day.uptime.toFixed(1) + '%' : $t('pub.noData')}"
                    ></div>
                  {/each}
                </div>
                <div class="flex justify-between text-xs mt-1.5" style="color: rgb(var(--text-muted))">
                  <span>{$t('pub.90daysAgo')}</span>
                  <span>{$t('pub.today')}</span>
                </div>
              </a>
            {/each}
          </div>
        {/if}
      </section>

      {#if resolvedIncidents.length > 0}
        <section class="space-y-3">
          <h2 class="section-title">{$t('pub.pastIncidents')}</h2>
          {#each resolvedIncidents as inc}
            <div class="card space-y-2">
              <div class="flex items-start gap-3">
                <div class="flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-semibold text-sm" style="color: rgb(var(--text))">{inc.title}</h3>
                    <span class="text-xs px-2 py-0.5 rounded border font-medium {incidentBadgeCls('resolved')}">{$t('incidentStatus.resolved')}</span>
                  </div>
                  <p class="text-xs mt-0.5" style="color: rgb(var(--text-muted))">
                    {formatDate(inc.startedAt)}{inc.resolvedAt ? ` - ${formatDate(inc.resolvedAt)}` : ''}
                  </p>
                </div>
              </div>
              {#if inc.updates.length > 0}
                <div class="space-y-2 pl-3" style="border-left: 2px solid var(--border-color)">
                  {#each inc.updates as u}
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs px-1.5 py-0.5 rounded border {incidentBadgeCls(u.status)}">{tIncidentStatus(u.status)}</span>
                        <span class="text-xs" style="color: rgb(var(--text-muted))">{formatDate(u.createdAt)}</span>
                      </div>
                      <p class="text-sm mt-1" style="color: rgb(var(--text))">{u.message}</p>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </section>
      {:else if activeIncidents.length === 0}
        <div class="card text-center py-6">
          <p class="text-sm" style="color: rgb(var(--text-muted))">{$t('pub.noIncidents')}</p>
        </div>
      {/if}


    {/if}
  </div>
</div>

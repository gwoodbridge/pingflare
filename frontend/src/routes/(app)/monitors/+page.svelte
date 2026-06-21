<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { api } from '$lib/api'
  import { monitors } from '$lib/stores'
  import { t, locale, nMonitors } from '$lib/i18n'
  import MonitorCard from '$lib/components/MonitorCard.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import PageLoader from '$lib/components/PageLoader.svelte'
  import HeaderPattern from '$lib/components/HeaderPattern.svelte'
  import { parseTags } from '$lib/utils'

  let loading = true
  let error = ''
  let filter = ''
  let typeFilter: 'all' | 'http' | 'heartbeat' | 'dns' | 'ping' = 'all'
  let statusFilter: 'all' | 'up' | 'down' | 'degraded' | 'pending' = 'all'
  let ticker: ReturnType<typeof setInterval>

  async function load() {
    try {
      monitors.set(await api.monitors.list())
      error = ''
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  onMount(() => { load(); ticker = setInterval(load, 10_000) })
  onDestroy(() => clearInterval(ticker))

  async function deleteMonitor(id: string, name: string) {
    if (!confirm(get(t)('confirm.deleteMonitor', { name }))) return
    await api.monitors.delete(id)
    monitors.update(list => list.filter(m => m.id !== id))
  }

  $: filtered = $monitors.filter(m => {
    if (typeFilter !== 'all' && m.type !== typeFilter) return false
    if (statusFilter !== 'all' && m.lastStatus !== statusFilter) return false
    if (filter) {
      const q = filter.toLowerCase()
      const tags = parseTags(m.tags).join(' ')
      return m.name.toLowerCase().includes(q) || (m.url ?? '').toLowerCase().includes(q) || tags.includes(q)
    }
    return true
  })

  $: configuredLabel = (() => {
    const n = $monitors.length
    const suffix = n === 1 ? $t('monitors.configuredOne') : $t('monitors.configuredMany')
    return `${nMonitors($locale, n)} ${suffix}`
  })()
</script>

<svelte:head><title>{$t('monitors.heading')} - Pingflare</title></svelte:head>

<div style="background-color: rgb(var(--bg))">

  <div class="relative overflow-hidden" style="border-bottom: 1px solid var(--border-color)">
    <HeaderPattern />
    <div class="relative px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-semibold tracking-tight" style="color: rgb(var(--text))">{$t('monitors.heading')}</h1>
        <p class="mt-1 text-sm" style="color: rgb(var(--text-muted))">
          {configuredLabel}
        </p>
      </div>
      <a href="/monitors/new" class="btn-primary shrink-0">
        <Icon name="plus" size={14} />
        <span>{$t('monitors.addMonitor')}</span>
      </a>
    </div>
  </div>

  <div class="px-4 py-5 md:px-8 md:py-6 max-w-5xl mx-auto space-y-4">

    {#if error}
      <div class="flex items-center gap-2 px-4 py-3 rounded text-sm"
        style="background: rgb(239 68 68 / .08); color: #ef4444; border: 1px solid rgb(239 68 68 / .3)">
        <Icon name="exclamation-triangle" size={14} />
        {error}
      </div>
    {/if}

    <div class="flex gap-2 flex-wrap">
      <input class="input w-full sm:w-52 text-sm" bind:value={filter} placeholder={$t('monitors.searchPlaceholder')} />
      <select class="input w-full sm:w-auto text-sm" bind:value={typeFilter}>
        <option value="all">{$t('monitors.allTypes')}</option>
        <option value="http">{$t('monitors.http')}</option>
        <option value="heartbeat">{$t('monitors.heartbeat')}</option>
        <option value="dns">{$t('monitors.dns')}</option>
        <option value="ping">{$t('monitors.ping')}</option>
      </select>
      <select class="input w-full sm:w-auto text-sm" bind:value={statusFilter}>
        <option value="all">{$t('monitors.allStatuses')}</option>
        <option value="up">{$t('monitors.up')}</option>
        <option value="down">{$t('monitors.down')}</option>
        <option value="degraded">{$t('monitors.degraded')}</option>
        <option value="pending">{$t('monitors.pending')}</option>
      </select>
    </div>

    {#if loading}
      <PageLoader />
    {:else if filtered.length === 0}
      <div class="rounded text-center py-12 text-sm"
        style="border: 1px solid var(--border-color); background-color: rgb(var(--card)); color: rgb(var(--text-muted))">
        {$t('monitors.noMatch')}
      </div>
    {:else}
      <div class="space-y-2">
        {#each filtered as monitor (monitor.id)}
          <div class="relative group">
            <MonitorCard {monitor} />
            <div class="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1.5
              opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
              <a href="/monitors/{monitor.id}/edit"
                class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                style="background-color: rgb(var(--card)); border: 1px solid var(--border-color); color: rgb(var(--text-muted))">
                <Icon name="pencil" size={11} />
                <span class="hidden sm:inline">{$t('monitors.edit')}</span>
              </a>
              <button
                class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-red-400 transition-colors"
                style="background-color: rgb(var(--card)); border: 1px solid rgb(239 68 68 / .3)"
                on:click|preventDefault={() => deleteMonitor(monitor.id, monitor.name)}>
                <Icon name="trash" size={11} />
                <span class="hidden sm:inline">{$t('monitors.delete')}</span>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  </div>
</div>

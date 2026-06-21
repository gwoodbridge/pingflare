<script lang="ts">
  import { formatRelative, formatUptime, parseTags } from '$lib/utils'
  import type { Monitor } from '$lib/api'
  import { t, locale } from '$lib/i18n'

  export let monitor: Monitor
  export let uptime: number | null = null

  $: isDown = monitor.lastStatus === 'down'
  $: isDegraded = monitor.lastStatus === 'degraded'
  $: isPending = monitor.lastStatus === 'pending'
  $: isUp = monitor.lastStatus === 'up'

  $: accentColor = isDown
    ? '#ef4444'
    : isDegraded
    ? '#f59e0b'
    : isPending
    ? 'var(--color-primary)'
    : '#22c55e'

  let hovered = false

  $: cardBorderColor = hovered
    ? 'var(--color-primary)'
    : isDown
    ? 'rgb(239 68 68 / 0.45)'
    : 'var(--border-color)'
</script>

<a href="/monitors/{monitor.id}"
  class="group relative flex items-center gap-4 rounded overflow-hidden transition-colors duration-200 cursor-pointer"
  style="
    background-color: rgb(var(--card));
    border: 1px solid {cardBorderColor};
    padding: 1rem 1.25rem;
  "
  on:mouseenter={() => hovered = true}
  on:mouseleave={() => hovered = false}>

  <div class="absolute left-0 top-0 bottom-0 w-0.5 transition-all"
    style="background-color: {accentColor}; opacity: {isUp ? '0.5' : '1'}"></div>

  <div class="flex items-center shrink-0 pl-2">
    <span class="block w-2 h-2 rounded-full transition-all"
      style="background-color: {accentColor}; {(isDown || isDegraded) ? 'animation: pulse 1.5s ease-in-out infinite' : ''}"></span>
  </div>

  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="font-semibold text-sm transition-colors group-hover:text-[var(--color-primary)]"
        style="color: rgb(var(--text))">
        {monitor.name}
      </span>
      <span class="text-xs px-2 py-0.5 rounded font-medium"
        style="background-color: rgb(var(--bg-muted)); color: rgb(var(--text-muted))">
        {monitor.type}
      </span>
      {#each parseTags(monitor.tags) as tag}
        <span class="text-xs px-2 py-0.5 rounded font-medium"
          style="background: rgb(255 102 51 / .08); color: var(--color-primary)">
          {tag}
        </span>
      {/each}
    </div>
    {#if monitor.url}
      <p class="mt-0.5 text-xs font-mono truncate" style="color: rgb(var(--text-muted))">{monitor.url}</p>
    {/if}
  </div>

  <div class="shrink-0 flex items-center gap-6 text-xs" style="color: rgb(var(--text-muted))">
    {#if uptime !== null}
      <div class="text-right hidden sm:block">
        <div class="font-semibold tabular-nums" style="color: {accentColor}">
          {formatUptime(uptime)}
        </div>
        <div class="mt-0.5 text-[11px]">{$t('monitorCard.uptime')}</div>
      </div>
    {/if}
    <div class="text-right hidden md:block">
      <div class="font-medium tabular-nums" style="color: rgb(var(--text))">{monitor.interval}s</div>
      <div class="mt-0.5 text-[11px]">{$t('monitorCard.interval')}</div>
    </div>
    <div class="text-right">
      <div class="font-medium" style="color: rgb(var(--text))">{formatRelative(monitor.lastCheckedAt, $locale)}</div>
      <div class="mt-0.5 text-[11px]">{$t('monitorCard.lastCheck')}</div>
    </div>
  </div>

  <svg class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    style="color: rgb(var(--text-muted))">
    <path d="M9 18l6-6-6-6"/>
  </svg>

</a>

<style>
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
  }
</style>

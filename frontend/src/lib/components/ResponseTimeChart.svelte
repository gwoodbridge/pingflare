<script lang="ts">
  import type { StatusLog } from '$lib/api'
  import { formatTs } from '$lib/utils'
  import { t } from '$lib/i18n'

  export let logs: StatusLog[] = []
  export let height = 60

  $: points = logs
    .filter(l => l.responseTimeMs !== null)
    .slice(0, 120)
    .reverse()

  $: maxMs = Math.max(...points.map(p => p.responseTimeMs!), 1)

  function toPath(pts: StatusLog[]): string {
    if (!pts.length) return ''
    const w = 100 / (pts.length - 1 || 1)
    return pts.map((p, i) => {
      const x = i * w
      const y = height - (p.responseTimeMs! / maxMs) * (height - 4) - 2
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')
  }

  function xPct(i: number): number {
    return (i / (points.length - 1 || 1)) * 100
  }
  function yPct(ms: number): number {
    return ((height - (ms / maxMs) * (height - 4) - 2) / height) * 100
  }

  let wrapEl: HTMLDivElement
  let hoveredIdx: number | null = null

  function onMouseMove(e: MouseEvent) {
    if (!wrapEl || points.length < 2) return
    const rect = wrapEl.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const idx = Math.round(ratio * (points.length - 1))
    hoveredIdx = Math.max(0, Math.min(points.length - 1, idx))
  }

  function onMouseLeave() {
    hoveredIdx = null
  }

  $: hovered = hoveredIdx !== null ? points[hoveredIdx] : null
  $: dotLeft = hoveredIdx !== null ? xPct(hoveredIdx) : null
  $: dotTop  = hovered ? yPct(hovered.responseTimeMs!) : null
</script>

<div class="relative">
  {#if points.length < 2}
    <div class="flex items-center justify-center text-xs" style="height:{height}px; color: rgb(var(--text-muted))">
      {$t('chart.notEnoughData')}
    </div>
  {:else}
    <div
      bind:this={wrapEl}
      role="img"
      aria-label="Response time chart"
      class="relative cursor-crosshair"
      style="height:{height}px"
      on:mousemove={onMouseMove}
      on:mouseleave={onMouseLeave}
    >
      <svg
        viewBox="0 0 100 {height}"
        preserveAspectRatio="none"
        class="w-full h-full"
      >
        <path
          d="{toPath(points)} L 100 {height} L 0 {height} Z"
          fill="#ff6633"
          fill-opacity="0.15"
        />
        <path
          d={toPath(points)}
          fill="none"
          stroke="#ff6633"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      {#if dotLeft !== null && dotTop !== null}
        <div
          class="absolute top-0 bottom-0 pointer-events-none"
          style="left:{dotLeft}%; width:1px; background: rgb(var(--text-muted) / 0.35); transform:translateX(-50%)"
        ></div>
        <div
          class="absolute pointer-events-none"
          style="left:{dotLeft}%; top:{dotTop}%; width:7px; height:7px; background:#ff6633; border-radius:50%; transform:translate(-50%,-50%)"
        ></div>
      {/if}
    </div>

    <div class="mt-2 text-xs min-h-[1.25rem]">
      {#if hovered}
        <div class="flex items-center gap-2" style="color: rgb(var(--text-muted))">
          <span class="font-mono font-bold w-20 shrink-0 tabular-nums
            {hovered.status === 'up' ? 'text-green-500' : hovered.status === 'down' ? 'text-red-400' : ''}"
            style="{hovered.status !== 'up' && hovered.status !== 'down' ? 'color: var(--color-primary)' : ''}">
            {hovered.status.toUpperCase()}
          </span>
          <span class="w-36 shrink-0 tabular-nums hidden sm:block">{formatTs(hovered.checkedAt)}</span>
          {#if hovered.responseTimeMs != null}
            <span class="w-16 shrink-0 font-mono tabular-nums hidden sm:block">{hovered.responseTimeMs}ms</span>
          {/if}
          <span class="truncate">{hovered.message ?? ''}</span>
        </div>
      {:else}
        <div class="flex justify-between" style="color: rgb(var(--text-muted))">
          <span>{$t('chart.latestMs', { ms: String(points[points.length - 1]?.responseTimeMs ?? '') })}</span>
          <span>{$t('chart.maxMs', { ms: String(maxMs) })}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<script lang="ts">
  export let status: 'up' | 'down' | 'degraded' | 'pending' = 'up'
  $: color = status === 'up' ? '#22c55e' : status === 'down' ? '#ef4444' : status === 'degraded' ? '#f59e0b' : '#f97316'
</script>

<div class="absolute bottom-0 left-0 right-0 overflow-hidden" style="height: 28px">
  <svg
    class="absolute inset-0 w-full h-full"
    viewBox="0 0 1000 28"
    preserveAspectRatio="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M 0 14 L 460 14 L 467 12 L 472 1 L 479 27 L 486 14 L 496 14 L 501 8 L 506 14 L 1000 14 L 1000 28 L 0 28 Z"
      style="fill: rgb(var(--bg))"
    />

    <path
      pathLength="1000"
      d="M 0 14 L 460 14 L 467 12 L 472 1 L 479 27 L 486 14 L 496 14 L 501 8 L 506 14 L 1000 14"
      fill="none"
      stroke="currentColor"
      stroke-opacity="0.2"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
    />

    <path
      pathLength="1000"
      d="M 0 14 L 460 14 L 467 12 L 472 1 L 479 27 L 486 14 L 496 14 L 501 8 L 506 14 L 1000 14"
      fill="none"
      stroke={color}
      stroke-width="2"
      stroke-linecap="round"
      stroke-dasharray="80 1000"
      stroke-dashoffset="80"
      vector-effect="non-scaling-stroke"
    >
      <animate
        attributeName="stroke-dashoffset"
        from="80"
        to="-1000"
        dur="1.5s"
        calcMode="linear"
        repeatCount="indefinite"
      />
    </path>
  </svg>
</div>

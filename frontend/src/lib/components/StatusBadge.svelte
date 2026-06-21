<script lang="ts">
  export let status: 'up' | 'down' | 'degraded' | 'pending'
</script>

<span class="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium
  {status === 'up'       ? 'badge-up'      : ''}
  {status === 'down'     ? 'badge-down'    : ''}
  {status === 'degraded' ? 'badge-degraded': ''}
  {status === 'pending'  ? 'badge-pending' : ''}
">
  <span class="h-1.5 w-1.5 rounded-full shrink-0
    {status === 'up'       ? 'bg-green-500' : ''}
    {status === 'down'     ? 'bg-red-400 animate-pulse' : ''}
    {status === 'degraded' ? 'bg-amber-500 animate-pulse' : ''}
    {status === 'pending'  ? 'bg-[var(--color-primary)]' : ''}
  "></span>
  {status === 'up' ? 'Operational' : status === 'down' ? 'Down' : status === 'degraded' ? 'Degraded' : 'Pending'}
</span>

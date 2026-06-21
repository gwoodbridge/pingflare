<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { api } from '$lib/api'
  import { t } from '$lib/i18n'
  import type { StatusPage, Monitor } from '$lib/api'
  import Icon from '$lib/components/Icon.svelte'
  import HeaderPattern from '$lib/components/HeaderPattern.svelte'

  let pages: StatusPage[] = []
  let allMonitors: Monitor[] = []
  let loading = true
  let error = ''

  let showCreate = false
  let editPage: StatusPage | null = null
  let formName = ''
  let formSlug = ''
  let formDescription = ''
  let formPassword = ''
  let formMonitorIds: string[] = []
  let formShowAllMonitors = false
  let formHideMonitorUrls = false
  let formEnablePassword = false
  let saving = false
  let formError = ''

  onMount(async () => {
    try {
      ;[pages, allMonitors] = await Promise.all([api.statusPages.list(), api.monitors.list()])
    } catch (e) { error = String(e) }
    finally { loading = false }
  })

  function openCreate() {
    editPage = null
    formName = ''; formSlug = ''; formDescription = ''; formPassword = ''
    formMonitorIds = []; formShowAllMonitors = false; formHideMonitorUrls = false; formEnablePassword = false; formError = ''
    showCreate = true
  }

  async function openEdit(page: StatusPage) {
    editPage = page
    formName = page.name
    formSlug = page.slug
    formDescription = page.description ?? ''
    formPassword = ''
    formError = ''
    formShowAllMonitors = page.showAllMonitors ?? false
    formHideMonitorUrls = page.hideMonitorUrls ?? false
    formEnablePassword = !!page.passwordHash
    formMonitorIds = await api.statusPages.monitors(page.id)
    showCreate = false
  }

  function cancel() { showCreate = false; editPage = null }

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function save() {
    saving = true; formError = ''
    try {
      let password: string | undefined
      if (editPage) {
        password = formEnablePassword ? (formPassword || undefined) : ''
      } else {
        password = formEnablePassword ? (formPassword || undefined) : undefined
      }
      const payload = {
        name: formName, slug: formSlug,
        description: formDescription || null,
        password,
        showAllMonitors: formShowAllMonitors,
        hideMonitorUrls: formHideMonitorUrls,
        monitorIds: formShowAllMonitors ? [] : formMonitorIds,
      }
      if (editPage) {
        const updated = await api.statusPages.update(editPage.id, payload)
        pages = pages.map(p => p.id === updated.id ? updated : p)
      } else {
        const created = await api.statusPages.create(payload)
        pages = [...pages, created]
      }
      cancel()
    } catch (e) { formError = String(e) }
    finally { saving = false }
  }

  async function remove(page: StatusPage) {
    if (!confirm(get(t)('confirm.deletePage', { name: page.name }))) return
    try {
      await api.statusPages.delete(page.id)
      pages = pages.filter(p => p.id !== page.id)
    } catch (e) { error = String(e) }
  }

  function toggleMonitor(id: string) {
    formMonitorIds = formMonitorIds.includes(id)
      ? formMonitorIds.filter(m => m !== id)
      : [...formMonitorIds, id]
  }

  function copyUrl(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/s/${slug}`)
  }

  $: showForm = showCreate || editPage !== null
</script>

<svelte:head><title>{$t('statusPages.heading')} - Pingflare</title></svelte:head>

<div style="background-color: rgb(var(--bg))">

  <div class="relative overflow-hidden" style="border-bottom: 1px solid var(--border-color)">
    <HeaderPattern />
    <div class="relative px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-semibold tracking-tight" style="color: rgb(var(--text))">{$t('statusPages.heading')}</h1>
        <p class="mt-1 text-sm" style="color: rgb(var(--text-muted))">
          {$t('statusPages.subtitle')}
        </p>
      </div>
      <button class="btn-primary shrink-0" on:click={openCreate}>
        <Icon name="plus" size={14} />
        <span>{$t('statusPages.newPage')}</span>
      </button>
    </div>
  </div>

  <div class="px-4 py-5 md:px-8 md:py-8 max-w-5xl mx-auto space-y-4">

    {#if error}
      <div class="flex items-center gap-2 px-4 py-3 rounded text-sm"
        style="background: rgb(239 68 68 / .08); color: #ef4444; border: 1px solid rgb(239 68 68 / .3)">
        <Icon name="exclamation-triangle" size={14} />{error}
      </div>
    {/if}

    {#if showCreate}
    <div class="card space-y-5">
      <h2 class="text-sm font-semibold" style="color: rgb(var(--text))">{$t('statusPages.newStatusPage')}</h2>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2 sm:col-span-1">
          <label class="label" for="sp-name">{$t('statusPages.labelName')}</label>
          <input id="sp-name" class="input" bind:value={formName}
            on:input={() => { formSlug = slugify(formName) }}
            required placeholder="My Services" />
        </div>
        <div class="col-span-2 sm:col-span-1">
          <label class="label" for="sp-slug">{$t('statusPages.labelSlug', { slug: 'slug' })}</label>
          <input id="sp-slug" class="input font-mono text-xs" bind:value={formSlug}
            required pattern="[a-z0-9-]+" placeholder="my-services" />
        </div>
        <div class="col-span-2">
          <label class="label" for="sp-desc">{$t('statusPages.labelDescOpt')}</label>
          <input id="sp-desc" class="input" bind:value={formDescription} placeholder="Real-time status for our services" />
        </div>
        <div class="col-span-2">
          <label class="flex items-center gap-2 cursor-pointer text-sm p-2 rounded hover:bg-[rgb(var(--bg-subtle))]"
            style="border: 1px solid var(--border-color)">
            <input type="checkbox" bind:checked={formEnablePassword}
              on:change={() => { if (!formEnablePassword) formPassword = '' }}
              class="accent-primary" />
            <span style="color: rgb(var(--text))">{$t('statusPages.enablePassword')}</span>
          </label>
          {#if formEnablePassword}
            <input id="sp-pass" class="input mt-2" type="password" bind:value={formPassword}
              placeholder={$t('statusPages.placeholderPwd')} />
          {/if}
        </div>
      </div>
      <div>
        <p class="label mb-2">{$t('statusPages.monitorsToDisplay')}</p>
        <label class="flex items-center gap-2 cursor-pointer text-sm p-2 rounded mb-2 hover:bg-[rgb(var(--bg-subtle))]"
          style="border: 1px solid var(--border-color)">
          <input type="checkbox" bind:checked={formShowAllMonitors} class="accent-primary" />
          <span style="color: rgb(var(--text))">{$t('statusPages.showAllMonitors')}</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm p-2 rounded mb-2 hover:bg-[rgb(var(--bg-subtle))]"
          style="border: 1px solid var(--border-color)">
          <input type="checkbox" bind:checked={formHideMonitorUrls} class="accent-primary" />
          <span style="color: rgb(var(--text))">{$t('statusPages.hideMonitorUrls')}</span>
        </label>
        {#if !formShowAllMonitors}
          {#if allMonitors.length === 0}
            <p class="text-sm" style="color: rgb(var(--text-muted))">{$t('statusPages.noMonitors')}</p>
          {:else}
            <div class="grid grid-cols-2 gap-1">
              {#each allMonitors as m}
                <label class="flex items-center gap-2 cursor-pointer text-sm p-2 rounded hover:bg-[rgb(var(--bg-subtle))]">
                  <input type="checkbox"
                    checked={formMonitorIds.includes(m.id)}
                    on:change={() => toggleMonitor(m.id)}
                    class="accent-primary" />
                  <span style="color: rgb(var(--text))">{m.name}</span>
                  <span class="text-xs ml-auto" style="color: rgb(var(--text-muted))">{m.type}</span>
                </label>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
      {#if formError}<p class="text-sm text-red-400">{formError}</p>{/if}
      <div class="flex gap-2">
        <button class="btn-primary" on:click={save} disabled={saving}>
          {saving ? $t('statusPages.creating') : $t('statusPages.createPage')}
        </button>
        <button class="btn-outline ml-auto" on:click={cancel}>{$t('statusPages.cancel')}</button>
      </div>
    </div>
    {/if}

    {#if editPage}
    <div class="card space-y-5">
      <h2 class="text-sm font-semibold" style="color: rgb(var(--text))">{$t('statusPages.editPage', { name: editPage.name })}</h2>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2 sm:col-span-1">
          <label class="label" for="ep-name">{$t('statusPages.labelName')}</label>
          <input id="ep-name" class="input" bind:value={formName} required />
        </div>
        <div class="col-span-2 sm:col-span-1">
          <label class="label" for="ep-slug">{$t('statusPages.labelSlugEdit')}</label>
          <input id="ep-slug" class="input font-mono text-xs" bind:value={formSlug} required pattern="[a-z0-9-]+" />
        </div>
        <div class="col-span-2">
          <label class="label" for="ep-desc">{$t('statusPages.labelDesc')}</label>
          <input id="ep-desc" class="input" bind:value={formDescription} />
        </div>
        <div class="col-span-2">
          <label class="flex items-center gap-2 cursor-pointer text-sm p-2 rounded hover:bg-[rgb(var(--bg-subtle))]"
            style="border: 1px solid var(--border-color)">
            <input type="checkbox" bind:checked={formEnablePassword}
              on:change={() => { if (!formEnablePassword) formPassword = '' }}
              class="accent-primary" />
            <span style="color: rgb(var(--text))">{$t('statusPages.enablePassword')}</span>
          </label>
          {#if formEnablePassword}
            <input id="ep-pass" class="input mt-2" type="password" bind:value={formPassword}
              placeholder={editPage.passwordHash ? '••••••••' : $t('statusPages.placeholderPwd')} />
            {#if editPage.passwordHash}
              <p class="text-xs mt-1" style="color: rgb(var(--text-muted))">{$t('statusPages.pwdHintKeep')}</p>
            {/if}
          {/if}
        </div>
      </div>
      <div>
        <p class="label mb-2">{$t('statusPages.monitorsToDisplay')}</p>
        <label class="flex items-center gap-2 cursor-pointer text-sm p-2 rounded mb-2 hover:bg-[rgb(var(--bg-subtle))]"
          style="border: 1px solid var(--border-color)">
          <input type="checkbox" bind:checked={formShowAllMonitors} class="accent-primary" />
          <span style="color: rgb(var(--text))">{$t('statusPages.showAllMonitors')}</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm p-2 rounded mb-2 hover:bg-[rgb(var(--bg-subtle))]"
          style="border: 1px solid var(--border-color)">
          <input type="checkbox" bind:checked={formHideMonitorUrls} class="accent-primary" />
          <span style="color: rgb(var(--text))">{$t('statusPages.hideMonitorUrls')}</span>
        </label>
        {#if !formShowAllMonitors}
          {#if allMonitors.length === 0}
            <p class="text-sm" style="color: rgb(var(--text-muted))">{$t('statusPages.noMonitors')}</p>
          {:else}
            <div class="grid grid-cols-2 gap-1">
              {#each allMonitors as m}
                <label class="flex items-center gap-2 cursor-pointer text-sm p-2 rounded hover:bg-[rgb(var(--bg-subtle))]">
                  <input type="checkbox"
                    checked={formMonitorIds.includes(m.id)}
                    on:change={() => toggleMonitor(m.id)}
                    class="accent-primary" />
                  <span style="color: rgb(var(--text))">{m.name}</span>
                  <span class="text-xs ml-auto" style="color: rgb(var(--text-muted))">{m.type}</span>
                </label>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
      {#if formError}<p class="text-sm text-red-400">{formError}</p>{/if}
      <div class="flex gap-2">
        <button class="btn-primary" on:click={save} disabled={saving}>
          {saving ? $t('statusPages.creating') : $t('statusPages.saveChanges')}
        </button>
        <button class="btn-outline ml-auto" on:click={cancel}>{$t('statusPages.cancel')}</button>
      </div>
    </div>
    {/if}

    {#if loading}
      <div class="py-8 text-center text-sm" style="color: rgb(var(--text-muted))">{$t('statusPages.loading')}</div>
    {:else if pages.length === 0 && !showForm}
      <div class="rounded text-center py-20 space-y-5"
        style="border: 1px solid var(--border-color); background-color: rgb(var(--card));
">
        <div class="w-14 h-14 rounded flex items-center justify-center mx-auto"
          style="background: rgb(255 102 51 / .08); color: var(--color-primary)">
          <Icon name="globe" size={24} />
        </div>
        <div>
          <p class="text-lg font-semibold tracking-tight" style="color: rgb(var(--text))">{$t('statusPages.empty')}</p>
          <p class="text-sm mt-1.5 max-w-xs mx-auto" style="color: rgb(var(--text-muted))">
            {$t('statusPages.emptyDesc')}
          </p>
        </div>
        <button class="btn-primary inline-flex" on:click={openCreate}>
          <Icon name="plus" size={14} />
          {$t('statusPages.createFirst')}
        </button>
      </div>
    {:else}
      <div class="space-y-2">
        {#each pages as page (page.id)}
          <div class="rounded flex items-center gap-4 px-5 py-4 transition-all"
            style="background-color: rgb(var(--card)); border: 1px solid var(--border-color)">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-sm" style="color: rgb(var(--text))">{page.name}</span>
                {#if page.passwordHash}
                  <span class="text-xs px-1.5 py-0.5 rounded"
                    style="background: rgb(var(--bg-muted)); color: rgb(var(--text-muted))">{$t('statusPages.passwordProtected')}</span>
                {/if}
              </div>
              {#if page.description}
                <p class="text-xs mt-0.5 truncate" style="color: rgb(var(--text-muted))">{page.description}</p>
              {/if}
              <a href="/s/{page.slug}" target="_blank"
                class="text-xs font-mono mt-1 inline-flex items-center gap-1 hover:underline"
                style="color: var(--color-primary)"
              >/s/{page.slug} <Icon name="arrow-up-right" size={11} /></a>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button class="btn-ghost px-2.5 py-1.5 text-xs" title={$t('statusPages.copyUrl')}
                on:click={() => copyUrl(page.slug)}>
                <Icon name="clipboard" size={14} /> {$t('statusPages.copyUrl')}
              </button>
              <button class="btn-ghost px-2.5 py-1.5 text-xs" on:click={() => openEdit(page)}>
                <Icon name="pencil" size={14} /> {$t('statusPages.edit')}
              </button>
              <button
                class="btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-400"
                on:click={() => remove(page)}>
                <Icon name="trash" size={14} /> {$t('statusPages.delete')}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  </div>
</div>

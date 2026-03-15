<script lang="ts">
  import { onMount } from 'svelte'
  import { createCloudStore, type CloudFile } from '../lib/cloud.svelte'

  const {
    userId,
    projectName,
    onClose,
    onLoadProject,
    onGetProjectContent,
    onGetThumbnail,
  }: {
    userId: string
    projectName: string
    onClose: () => void
    onLoadProject: (content: string, name: string) => void
    onGetProjectContent: () => string
    onGetThumbnail: () => Promise<Blob>
  } = $props()

  const cloud = createCloudStore(userId)

  let saveName = $state(projectName || 'Project')
  let saving = $state(false)
  let loadingName = $state<string | null>(null)

  onMount(() => {
    cloud.listProjects()
  })

  async function handleSave() {
    if (!saveName.trim()) return
    saving = true
    const content = onGetProjectContent()
    const thumb = await onGetThumbnail()
    await cloud.saveProject(saveName.trim(), content, thumb)
    saving = false
  }

  async function handleLoad(file: CloudFile) {
    loadingName = file.name
    const content = await cloud.loadProject(file.name)
    loadingName = null
    if (content != null) {
      const name = file.name.replace(/\.ooo$/, '')
      onLoadProject(content, name)
    }
  }

  async function handleDelete(file: CloudFile) {
    if (!confirm(`Delete "${file.name.replace(/\.ooo$/, '')}"?`)) return
    await cloud.deleteProject(file.name)
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  let sharingName = $state<string | null>(null)
  let shareUrl = $state<string | null>(null)
  let linkInput: HTMLInputElement

  async function handleShare(file: CloudFile) {
    sharingName = file.name
    shareUrl = null
    const content = await cloud.loadProject(file.name)
    if (!content) { sharingName = null; return }
    // Fetch existing thumbnail from private bucket
    let thumb: Blob | undefined
    if (file.thumbUrl) {
      try {
        const res = await fetch(file.thumbUrl)
        if (res.ok) thumb = await res.blob()
      } catch {}
    }
    const url = await cloud.shareProject(file.name, content, thumb)
    sharingName = null
    if (url) {
      shareUrl = url
    }
  }

  function copyLink() {
    if (!shareUrl) return
    linkInput.select()
    navigator.clipboard.writeText(shareUrl)
  }

  const fileCount = $derived(cloud.files.length)
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}></div>

<div class="panel">
  <header class="panel-header">
    <span class="panel-title">My Projects</span>
    <span class="file-count">{fileCount}/{cloud.maxProjects}</span>
    <button class="close-btn" onclick={onClose}>×</button>
  </header>

  <div class="save-bar">
    <input
      class="save-input"
      type="text"
      bind:value={saveName}
      placeholder="Project name"
      onkeydown={(e) => { if (e.key === 'Enter') handleSave() }}
    />
    <button class="save-btn" onclick={handleSave} disabled={saving || cloud.loading || !saveName.trim()}>
      {saving ? '...' : 'Save'}
    </button>
  </div>

  {#if shareUrl}
    <div class="share-bar">
      <input
        bind:this={linkInput}
        class="share-link-input"
        type="text"
        value={shareUrl}
        readonly
        onclick={() => linkInput.select()}
      />
      <button class="copy-btn" onclick={copyLink}>Copy</button>
      <button class="share-close-btn" onclick={() => shareUrl = null}>×</button>
    </div>
  {/if}

  {#if cloud.error}
    <div class="error-msg">{cloud.error}</div>
  {/if}

  <div class="file-list">
    {#if cloud.loading && cloud.files.length === 0}
      <div class="empty-state">Loading...</div>
    {:else if cloud.files.length === 0}
      <div class="empty-state">No saved projects yet</div>
    {:else}
      <div class="projects-grid">
        {#each cloud.files as file}
          <div class="project-card">
            <div class="card-thumb">
              {#if file.thumbUrl}
                <img src={file.thumbUrl} alt="" class="thumb-img" />
              {:else}
                <div class="thumb-placeholder"></div>
              {/if}
            </div>
            <div class="card-info">
              <span class="card-name">{file.name.replace(/\.ooo$/, '')}</span>
              <span class="card-date">{formatDate(file.updated_at)}</span>
            </div>
            <div class="card-actions">
              <button class="card-action-btn" onclick={() => handleLoad(file)} disabled={loadingName === file.name} title="Load project">
                {loadingName === file.name ? '...' : 'Load'}
              </button>
              <button class="card-action-btn" onclick={() => handleShare(file)} disabled={sharingName === file.name} title="Copy share link">
                {sharingName === file.name ? '...' : 'Share'}
              </button>
              <button class="card-action-btn delete" onclick={() => handleDelete(file)} title="Delete project">×</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="panel-footer">
    <span class="footer-note">Free plan: up to {cloud.maxProjects} projects.</span>
    <span class="footer-links">
      <a class="footer-link" href="https://bsky.app/profile/fooorma.bsky.social" target="_blank" rel="noopener">Follow us</a>
      <span class="footer-sep">·</span>
      <a class="footer-link" href="mailto:hola@elenatorro.com">Need more? Contact us</a>
    </span>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 400;
  }

  .panel {
    position: fixed;
    top: 44px;
    right: 0;
    bottom: 0;
    width: 420px;
    background: var(--bg-panel);
    border-left: 1px solid var(--border);
    z-index: 450;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
  }

  .file-count {
    font-size: 10px;
    color: var(--text-5);
    font-family: monospace;
  }

  .close-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--text-4);
    font-size: 18px;
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background .12s, color .12s;
  }
  .close-btn:hover { background: var(--bg-hover); color: var(--text-2); }

  .save-bar {
    display: flex;
    gap: 6px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .save-input {
    flex: 1;
    font-size: 12px;
    color: var(--text-2);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 8px;
    height: 28px;
    outline: none;
    font-family: inherit;
    min-width: 0;
    transition: border-color .12s;
  }
  .save-input:focus { border-color: var(--accent); }

  .save-btn {
    background: var(--accent);
    border: none;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    padding: 5px 12px;
    height: 28px;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity .12s;
    flex-shrink: 0;
  }
  .save-btn:hover { opacity: .9; }
  .save-btn:disabled { opacity: .5; cursor: default; }

  .error-msg {
    font-size: 11px;
    color: #ef4444;
    padding: 6px 14px;
    line-height: 1.3;
    flex-shrink: 0;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px;
  }

  .empty-state {
    text-align: center;
    color: var(--text-5);
    font-size: 12px;
    padding: 32px 0;
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .project-card {
    position: relative;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg-elevated);
    transition: border-color .15s;
  }
  .project-card:hover { border-color: var(--text-5); }

  .card-thumb {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    background: var(--bg-sunken);
    overflow: hidden;
  }

  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    background: #fff;
  }

  .thumb-placeholder {
    width: 100%;
    height: 100%;
    background: var(--bg-sunken);
  }

  .card-info {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .card-name {
    font-size: 11px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-date {
    font-size: 9px;
    color: var(--text-5);
    font-family: monospace;
  }

  .share-bar {
    display: flex;
    gap: 4px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--accent) 5%, transparent);
    flex-shrink: 0;
  }

  .share-link-input {
    flex: 1;
    font-size: 11px;
    color: var(--accent);
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 6px;
    height: 26px;
    outline: none;
    font-family: monospace;
    min-width: 0;
    cursor: text;
  }
  .share-link-input:focus { border-color: var(--accent); }

  .copy-btn {
    background: var(--accent);
    border: none;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    height: 26px;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity .12s;
  }
  .copy-btn:hover { opacity: .9; }

  .share-close-btn {
    background: none;
    border: none;
    color: var(--text-4);
    font-size: 14px;
    cursor: pointer;
    padding: 0 2px;
    display: flex;
    align-items: center;
    transition: color .12s;
  }
  .share-close-btn:hover { color: var(--text-2); }

  .card-actions {
    display: flex;
    gap: 4px;
    padding: 0 6px 6px;
  }

  .card-action-btn {
    flex: 1;
    background: none;
    border: 1px solid var(--border);
    color: var(--text-3);
    font-size: 10px;
    padding: 3px 0;
    border-radius: 4px;
    cursor: pointer;
    transition: border-color .12s, color .12s;
  }
  .card-action-btn:hover { border-color: var(--text-5); color: var(--text-1); }
  .card-action-btn:disabled { opacity: .5; cursor: default; }
  .card-action-btn.delete { flex: 0; padding: 3px 6px; }
  .card-action-btn.delete:hover { border-color: #ef4444; color: #ef4444; }

  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .footer-note {
    font-size: 10px;
    color: var(--text-5);
  }

  .footer-link {
    font-size: 10px;
    color: var(--accent);
    text-decoration: none;
  }
  .footer-link:hover { text-decoration: underline; }

  .footer-links {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .footer-sep {
    color: var(--text-5);
    font-size: 10px;
  }
</style>

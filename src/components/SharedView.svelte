<script lang="ts">
  import { onMount } from 'svelte'
  import { loadSharedProject } from '../lib/cloud.svelte'
  import { parseProject } from '../lib/persist/index'
  import { evaluateQuery } from '../lib/query/index'
  import { renderLayers2D } from '../lib/layers/renderer2d'
  import { BUILTIN_PALETTES } from '../lib/palettes/index'
  import { BUILTIN_PATTERNS } from '../lib/patterns/index'
  import type { Layer } from '../lib/layers/types'

  const { userId, slug, onBack, theme, onToggleTheme }: {
    userId: string
    slug: string
    onBack: () => void
    theme: 'dark' | 'light'
    onToggleTheme: () => void
  } = $props()

  let loading = $state(true)
  let errorMsg = $state<string | null>(null)
  let projectName = $state('')
  let authorName = $state<string | null>(null)
  let canvas: HTMLCanvasElement

  onMount(async () => {
    const result = await loadSharedProject(userId, slug)
    if (!result) {
      errorMsg = 'Project not found'
      loading = false
      return
    }

    try {
      const project = parseProject(result.content)
      projectName = slug || project.projectName || 'Untitled'
      authorName = result.authorName
      const artW = project.artW
      const artH = project.artH
      const allPalettes = [...BUILTIN_PALETTES, ...(project.customPalettes ?? [])]
      const allPatterns = [...BUILTIN_PATTERNS, ...(project.customPatterns ?? [])].filter(p => p.code)

      // Resolve code layers
      const resolved: Layer[] = project.layers.map(l => {
        if (l.mode === 'code' && l.query) {
          const { shapes, errors } = evaluateQuery(l.query, artW, artH, allPalettes, allPatterns, { sandboxed: true })
          if (errors.length) console.warn('Layer eval errors:', errors)
          return { ...l, shapes }
        }
        return l
      })

      // Render
      canvas.width = artW
      canvas.height = artH
      const ctx = canvas.getContext('2d')!
      renderLayers2D(ctx, resolved, artW, artH)
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, artW, artH)
      ctx.globalCompositeOperation = 'source-over'
    } catch (e) {
      errorMsg = 'Failed to render project'
      console.error(e)
    }
    loading = false
  })
</script>

<div class="view-page">
  <header class="view-topbar">
    <button class="back-btn" onclick={onBack}>← Back</button>
    <span class="view-logo">fooorma</span>
    {#if projectName}
      <span class="view-name">{projectName}{#if authorName} <span class="view-author">by {authorName}</span>{/if}</span>
    {/if}
    <div class="spacer"></div>
    <button class="theme-btn" onclick={onToggleTheme} title="Toggle light/dark theme">{theme === 'dark' ? '◑' : '◐'}</button>
  </header>

  <main class="view-content">
    {#if loading}
      <div class="view-status">Loading...</div>
    {:else if errorMsg}
      <div class="view-status view-error">{errorMsg}</div>
    {/if}
    <canvas bind:this={canvas} class="view-canvas" class:hidden={loading || !!errorMsg}></canvas>
  </main>
</div>

<style>
  .view-page {
    position: fixed;
    inset: 0;
    background: var(--bg-panel);
    z-index: 500;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .view-topbar {
    height: 44px;
    background: var(--bg-bar);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 10px;
    flex-shrink: 0;
  }

  .back-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-3);
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 5px;
    cursor: pointer;
    transition: border-color .15s, color .15s;
  }
  .back-btn:hover { border-color: var(--text-5); color: var(--text-2); }

  .view-logo {
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: .08em;
  }

  .view-name {
    font-size: 13px;
    color: var(--text-3);
  }

  .view-author {
    color: var(--text-5);
  }

  .spacer { flex: 1; }

  .theme-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-3);
    font-size: 14px;
    padding: 5px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: border-color .15s, color .15s;
  }
  .theme-btn:hover { border-color: var(--text-5); color: var(--text-2); }

  .view-content {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .view-status {
    font-size: 14px;
    color: var(--text-4);
  }

  .view-error {
    color: #ef4444;
  }

  .view-canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.2);
  }

  .hidden {
    display: none;
  }
</style>

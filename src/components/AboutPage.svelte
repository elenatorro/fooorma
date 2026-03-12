<script lang="ts">
  const { onBack }: { onBack: () => void } = $props()
</script>

<div class="about-page">
  <header class="about-topbar">
    <button class="back-btn" onclick={onBack}>← Back</button>
    <span class="about-logo">fooorma</span>
    <span class="about-beta">beta</span>
  </header>

  <main class="about-content">
    <div class="about-hero">
      <h1 class="hero-title">fooorma</h1>
      <p class="hero-tagline">Procedural Art Studio</p>
    </div>

    <section class="section">
      <h2>About</h2>
      <p>fooorma is a procedural art studio for creating generative designs through code and manual tools. Build layered compositions using a visual query language, tile systems, stamps, palettes, and real-time preview.</p>
      <p><!-- TODO: Add more project description --></p>
    </section>

    <section class="section">
      <h2>Links</h2>
      <ul class="links-list">
        <li><!-- TODO: Website URL --></li>
        <li><a href="https://github.com/elenatorro/fooorma">https://github.com/elenatorro/fooorma</a></li>
        <li><!-- TODO: Documentation URL --></li>
      </ul>
    </section>

    <section class="section">
      <h2>Contact</h2>
      <p><a href="mailto:hola@elenatorro.com">hola@elenatorro.com</a></p>
    </section>

    <section class="section">
      <h2>Changelog</h2>

      <div class="changelog-entry">
        <div class="changelog-version">v0.1.0-beta <span class="changelog-date">2026-03-12</span></div>
        <ul class="changelog-list">
          <li>Layer system with manual and code modes</li>
          <li>Shape primitives: rect, ellipse, triangle, arc, line, curve, spline</li>
          <li>3D shapes: cube, sphere, cylinder, torus with materials</li>
          <li>Tile system with square auto-tiles and explicit grids</li>
          <li>Stamp system for reusable shape groups</li>
          <li>Custom palettes and built-in color sets</li>
          <li>Effects: shadow, blur, bevel, noise, warp</li>
          <li>Gradients: linear and radial</li>
          <li>Transform system: rotate, scale, skew, 3D rotations</li>
          <li>Code editor with syntax highlighting and autocomplete</li>
          <li>Export to PNG and CMYK TIFF</li>
          <li>CMYK soft-proof preview</li>
          <li>Project save/load (.ooo format)</li>
          <li>MCP server for AI-assisted creation</li>
          <li>Dark and light themes</li>
          <li>PWA support</li>
        </ul>
      </div>

      <!-- TODO: Add future changelog entries here
      <div class="changelog-entry">
        <div class="changelog-version">v0.2.0 <span class="changelog-date">YYYY-MM-DD</span></div>
        <ul class="changelog-list">
          <li>...</li>
        </ul>
      </div>
      -->
    </section>

    <footer class="about-footer">
      <span><!-- TODO: Copyright / license info --></span>
    </footer>
  </main>
</div>

<style>
  .about-page {
    position: fixed;
    inset: 0;
    background: var(--bg-panel);
    z-index: 500;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .about-topbar {
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

  .about-logo {
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: .08em;
  }

  .about-beta {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .about-content {
    flex: 1;
    overflow-y: auto;
    padding: 48px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .about-hero {
    text-align: center;
    margin-bottom: 48px;
  }

  .hero-title {
    font-family: monospace;
    font-size: 36px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: .08em;
    margin: 0 0 8px;
  }

  .hero-tagline {
    font-size: 15px;
    color: var(--text-5);
    margin: 0;
  }

  .section {
    width: 100%;
    max-width: 560px;
    padding: 0 24px;
    margin-bottom: 36px;
  }

  .section h2 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--text-5);
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .section p {
    font-size: 13px;
    color: var(--text-3);
    line-height: 1.65;
    margin: 0 0 8px;
  }

  .links-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: var(--accent);
  }

  .changelog-entry {
    margin-bottom: 20px;
  }

  .changelog-version {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-2);
    margin-bottom: 8px;
  }

  .changelog-date {
    font-weight: 400;
    font-size: 11px;
    color: var(--text-6);
    margin-left: 6px;
  }

  .changelog-list {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
    color: var(--text-4);
    line-height: 1.8;
  }

  .about-footer {
    width: 100%;
    max-width: 560px;
    padding: 20px 24px 0;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-6);
  }
</style>

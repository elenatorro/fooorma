# Forma - Procedural Art Studio

## Project Overview

Cross-platform procedural art studio (desktop + PWA) built with Svelte 5, Tauri 2, and WebGPU/WebGL2.

## Tech Stack

- **Frontend**: Svelte 5, TypeScript (strict), Vite
- **Desktop**: Tauri 2 (Rust backend)
- **Rendering**: WebGPU (primary), WebGL2 (fallback)
- **Package manager**: pnpm

## Key Scripts

```bash
pnpm dev           # Frontend dev server (port 5173)
pnpm build         # Production build
pnpm check         # Type-check (svelte-check + tsc)
pnpm tauri:dev     # Desktop app in dev mode
pnpm tauri:build   # Build native app
```

## Project Structure

```
src/
  App.svelte                  # Root component
  main.ts                     # Entry point
  components/
    TopBar.svelte             # Size presets + export
    RightPanel.svelte         # Sketch selector + parameter sliders
    Viewport.svelte           # Canvas with zoom/pan
    StatusBar.svelte          # Status footer
  lib/
    sketches/
      index.ts                # Sketch registry
      types.ts                # SketchDef, ParamDef interfaces
      ripple.ts / cells.ts / warp.ts / marble.ts / crystal.ts
    renderer/
      index.ts                # createRenderer() factory (auto-selects API)
      types.ts                # Renderer interface
      webgpu.ts               # WebGPU implementation
      webgl2.ts               # WebGL2 fallback
src-tauri/
  src/main.rs / lib.rs        # Tauri app entry + init
  tauri.conf.json             # Window: 1440×900, min 1024×600
  Cargo.toml                  # tauri v2, serde, serde_json
```

## Architecture

### Sketch System
Each sketch is a `SketchDef` with:
- WGSL shader (WebGPU)
- GLSL shader (WebGL2)
- Up to 8 named parameters (`ParamDef` with min/max/default/step)

### Rendering Pipeline
- `createRenderer()` transparently selects WebGPU or WebGL2
- Shared uniform buffer layout (48 bytes): `time (f32)`, `width (f32)`, `height (f32)`, `params[8] (f32)`
- RAF loop drives animation

### Canvas / Viewport
- Default artboard: 794×1123 px (A4 portrait)
- Canvas range: 100–8192 px
- Viewport = window width − 260 px (right panel) − margins
- Zoom: 0.05–20×, pan via Space+drag or scroll

## Shape / Model Consistency Rule

**Any new shape type, shape property, or model change must be reflected across all three surfaces simultaneously — no exceptions:**

1. **Query language** (`src/lib/query/index.ts`) — `evaluateQuery`: add the function and expose it in the `new Function` call; update `shapesToCode` to serialize it back
2. **Manual UI** (`src/components/RightPanel.svelte`) — shape type button list, property sliders/controls for that shape's unique params, stroke/effects visibility conditions
3. **Code UI** (`src/components/RightPanel.svelte`) — `apiSnippets` array with correct signature and an example snippet

Missing any surface is a bug. Always check all three before considering a shape task done.

## Coding Conventions

- **Svelte 5 runes**: use `$state`, `$props`, `$derived`, `$effect`
- TypeScript strict mode throughout
- Sketches are self-contained modules — add new ones by creating a file in `src/lib/sketches/` and registering in `index.ts`
- Renderer abstraction hides API differences; shaders must be provided in both WGSL and GLSL

## Configuration Notes

- Vite port **5173** is hardcoded (required by Tauri)
- PWA enabled with Workbox caching (js, css, html, wasm, svg, png)
- App ID: `dev.forma.app`
- No CSP restrictions (`"csp": null`)

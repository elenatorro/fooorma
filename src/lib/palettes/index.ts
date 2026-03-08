export interface Palette {
  id: string
  name: string
  colors: string[]
  builtin?: boolean
}

/** Convert a palette name to a valid JS identifier for the sandbox. */
export function paletteVarName(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('')
  return (/^[a-zA-Z]/.test(words) ? words : 'P' + words) || 'Palette'
}

export const BUILTIN_PALETTES: Palette[] = [
  {
    id: 'builtin-neon',
    name: 'Neon',
    builtin: true,
    colors: ['#ff2d78', '#ff6b2d', '#ffe620', '#2dff6e', '#2dffee', '#2d6aff', '#cc2dff'],
  },
  {
    id: 'builtin-pastel',
    name: 'Pastel',
    builtin: true,
    colors: ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#dbb3ff'],
  },
  {
    id: 'builtin-sunset',
    name: 'Sunset',
    builtin: true,
    colors: ['#2d1b69', '#7b2d8b', '#c84b7f', '#f0845a', '#f7c68a', '#fff4d0'],
  },
  {
    id: 'builtin-ocean',
    name: 'Ocean',
    builtin: true,
    colors: ['#0d3460', '#1a6785', '#4ecdc4', '#a8f0e2', '#f0f7ff', '#e0fbfc'],
  },
  {
    id: 'builtin-earth',
    name: 'Earth',
    builtin: true,
    colors: ['#3d2b1f', '#6b4423', '#a0714f', '#c8a882', '#8b9e6e', '#4a7c59'],
  },
  {
    id: 'builtin-mono',
    name: 'Mono',
    builtin: true,
    colors: ['#0e0e10', '#2e2e34', '#555560', '#888890', '#c8c8d0', '#f2f2f6'],
  },
  {
    id: 'builtin-aurora',
    name: 'Aurora',
    builtin: true,
    colors: ['#0d0221', '#190d4a', '#3b1f8c', '#6b2fa0', '#a85ccf', '#4ecdc4', '#a8f0e2'],
  },
  {
    id: 'builtin-ember',
    name: 'Ember',
    builtin: true,
    colors: ['#1a0a00', '#5c1a00', '#c0392b', '#e74c3c', '#f39c12', '#f1c40f', '#fff3cd'],
  },
]

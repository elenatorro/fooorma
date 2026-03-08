import type { Layer } from '../layers/types'
import type { Palette } from '../palettes/index'
import { shapesToCode, evaluateQuery } from '../query/index'

export interface ProjectData {
  layers: Layer[]
  artW: number
  artH: number
  customPalettes?: Palette[]
}

// ── Serialize ──────────────────────────────────────────────────────────────

export function serializeProject({ layers, artW, artH, customPalettes = [] }: ProjectData): string {
  const out: string[] = ['// forma v1', `// Artboard: ${artW} × ${artH}`, '']

  for (const p of customPalettes) {
    out.push(`// @palette "${p.name}" ${p.colors.join(' ')}`)
  }
  if (customPalettes.length > 0) out.push('')

  for (const layer of layers) {
    let header = `// @layer "${layer.name}"`
    if (!layer.visible)  header += ' hidden'
    if (layer.bgColor)   header += ` bg:${layer.bgColor}`
    if (layer.mode === 'manual') header += ' mode:manual'
    out.push(header)

    const query = layer.mode === 'code'
      ? layer.query.trim()
      : shapesToCode(layer.shapes).trim()
    if (query) out.push(query)
    out.push('')
  }

  return out.join('\n')
}

// ── Deserialize ────────────────────────────────────────────────────────────

export function parseProject(content: string): ProjectData {
  const lines = content.split('\n')
  let artW = 794
  let artH = 1123

  type RawLayer = {
    name: string
    visible: boolean
    bgColor?: string
    mode: 'manual' | 'code'
    queryLines: string[]
  }

  const rawLayers: RawLayer[] = []
  const customPalettes: Palette[] = []
  let cur: RawLayer | null = null

  for (const line of lines) {
    if (line.startsWith('// forma v')) continue

    // Artboard dimensions — handle both × (U+00D7) and x
    const artMatch = line.match(/^\/\/ Artboard: (\d+) [×x] (\d+)/)
    if (artMatch) {
      artW = parseInt(artMatch[1])
      artH = parseInt(artMatch[2])
      continue
    }

    // Custom palette
    const paletteMatch = line.match(/^\/\/ @palette "([^"]*)"(.*)$/)
    if (paletteMatch) {
      const colors = paletteMatch[2].trim().split(/\s+/).filter(c => /^#[0-9a-fA-F]{6}$/.test(c))
      if (colors.length > 0) {
        customPalettes.push({ id: crypto.randomUUID(), name: paletteMatch[1], colors })
      }
      continue
    }

    // Layer header
    const layerMatch = line.match(/^\/\/ @layer "([^"]*)"(.*)$/)
    if (layerMatch) {
      const rest = layerMatch[2]
      cur = {
        name:    layerMatch[1],
        visible: !rest.includes(' hidden'),
        bgColor: rest.match(/ bg:(#[0-9a-fA-F]{6})/)?.[1],
        mode:    rest.includes(' mode:manual') ? 'manual' : 'code',
        queryLines: [],
      }
      rawLayers.push(cur)
      continue
    }

    if (cur) cur.queryLines.push(line)
  }

  const allPalettes = customPalettes
  const layers: Layer[] = rawLayers.map(r => {
    const query = r.queryLines.join('\n').trim()
    const base = {
      id:      crypto.randomUUID(),
      name:    r.name,
      visible: r.visible,
      bgColor: r.bgColor,
      query,
    }
    if (r.mode === 'manual') {
      const { shapes } = evaluateQuery(query, artW, artH, allPalettes)
      return { ...base, mode: 'manual' as const, shapes }
    }
    return { ...base, mode: 'code' as const, shapes: [] }
  })

  // Always ensure at least one layer
  if (layers.length === 0) {
    layers.push({ id: crypto.randomUUID(), name: 'Layer 1', visible: true, mode: 'code', shapes: [], query: '' })
  }

  return { layers, artW, artH, customPalettes }
}

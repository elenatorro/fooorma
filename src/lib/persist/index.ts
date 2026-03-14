import type { Layer, Pattern } from '../layers/types'
import type { Palette } from '../palettes/index'
import { shapesToCode } from '../query/index'

export interface ProjectData {
  projectName?: string
  layers: Layer[]
  artW: number
  artH: number
  customPalettes?: Palette[]
  customPatterns?: Pattern[]
}

// ── Serialize ──────────────────────────────────────────────────────────────

export function serializeProject({ projectName, layers, artW, artH, customPalettes = [], customPatterns = [] }: ProjectData): string {
  const out: string[] = ['// fooorma v1']
  if (projectName) out.push(`// Project: ${projectName}`)
  out.push(`// Artboard: ${artW} × ${artH}`, '')

  for (const p of customPalettes) {
    out.push(`// @palette "${p.name}" ${p.colors.join(' ')}`)
  }
  if (customPalettes.length > 0) out.push('')

  // Serialize stamps (code-based patterns) as plain code blocks
  const stamps = customPatterns.filter(p => p.code)
  for (const s of stamps) {
    out.push(`// @stamp "${s.name}"`)
    out.push(s.code!)
    out.push('// @endstamp')
  }
  if (stamps.length > 0) out.push('')

  // Serialize template patterns (non-code)
  const templates = customPatterns.filter(p => !p.code && !p.builtin)
  for (const p of templates) {
    out.push(`// @pattern "${p.name}" ${p.type} ${p.shape} ${p.color} ${p.opacity} ${p.count} ${p.cols} ${p.rows}`)
  }
  if (templates.length > 0) out.push('')

  for (const layer of layers) {
    let header = `// @layer "${layer.name}"`
    if (!layer.visible)  header += ' hidden'
    if (layer.bgColor)   header += ` bg:${layer.bgColor}`
    out.push(header)

    const query = layer.mode === 'code'
      ? layer.query.trim()
      : shapesToCode(layer.shapes, artW, artH).trim()
    if (query) out.push(query)
    out.push('')
  }

  return out.join('\n')
}

// ── Deserialize ────────────────────────────────────────────────────────────

export function parseProject(content: string): ProjectData {
  const lines = content.split('\n')
  let projectName: string | undefined
  let artW = 794
  let artH = 1123

  type RawLayer = {
    name: string
    visible: boolean
    bgColor?: string
    queryLines: string[]
  }

  const rawLayers: RawLayer[] = []
  const customPalettes: Palette[] = []
  const customPatterns: Pattern[] = []
  let cur: RawLayer | null = null
  let stampName: string | null = null
  let stampLines: string[] = []

  for (const line of lines) {
    // Collecting stamp code block
    if (stampName !== null) {
      if (line === '// @endstamp') {
        customPatterns.push({
          id: crypto.randomUUID(), name: stampName,
          type: 'single', shape: 'rect', color: '#8b5cf6', opacity: 1,
          count: 1, cols: 1, rows: 1,
          code: stampLines.join('\n'),
        })
        stampName = null
        stampLines = []
      } else {
        stampLines.push(line)
      }
      continue
    }

    if (line.startsWith('// fooorma v') || line.startsWith('// forma v')) continue

    const projectMatch = line.match(/^\/\/ Project: (.+)$/)
    if (projectMatch) {
      projectName = projectMatch[1]
      continue
    }

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

    // Stamp block start
    const stampMatch = line.match(/^\/\/ @stamp "([^"]*)"$/)
    if (stampMatch) {
      stampName = stampMatch[1]
      stampLines = []
      continue
    }

    // Template pattern
    const patternMatch = line.match(/^\/\/ @pattern "([^"]*)" (\S+) (\S+) (#[0-9a-fA-F]{6}) ([\d.]+) (\d+) (\d+) (\d+)$/)
    if (patternMatch) {
      customPatterns.push({
        id: crypto.randomUUID(),
        name: patternMatch[1],
        type: patternMatch[2] as Pattern['type'],
        shape: patternMatch[3] as Pattern['shape'],
        color: patternMatch[4],
        opacity: parseFloat(patternMatch[5]),
        count: parseInt(patternMatch[6]),
        cols: parseInt(patternMatch[7]),
        rows: parseInt(patternMatch[8]),
      })
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
        queryLines: [],
      }
      rawLayers.push(cur)
      continue
    }

    if (cur) cur.queryLines.push(line)
  }

  const allPalettes = customPalettes
  const stampPatterns = customPatterns.filter(p => p.code)
  const layers: Layer[] = rawLayers.map(r => {
    const query = r.queryLines.join('\n').trim()
    const base = {
      id:      crypto.randomUUID(),
      name:    r.name,
      visible: r.visible,
      bgColor: r.bgColor,
      query,
    }
    return { ...base, mode: 'code' as const, shapes: [] }
  })

  // Always ensure at least one layer
  if (layers.length === 0) {
    layers.push({ id: crypto.randomUUID(), name: 'Layer 1', visible: true, mode: 'code', shapes: [], query: '' })
  }

  return { projectName, layers, artW, artH, customPalettes, customPatterns }
}

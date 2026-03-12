import type { Layer, Pattern } from '../layers/types'
import type { Palette } from '../palettes/index'

export interface BridgeCallbacks {
  // State
  getState: () => {
    layers: Layer[]
    artW: number
    artH: number
    customPalettes: Palette[]
    customPatterns: Pattern[]
    activeLayerId: string | null
  }
  getSerializedProject: () => string

  // Artboard
  setArtboardSize: (w: number, h: number) => void

  // Layers
  addLayer: (name?: string) => string  // returns layerId
  deleteLayer: (id: string) => void
  renameLayer: (id: string, name: string) => void
  setLayerVisible: (id: string, visible: boolean) => void
  setLayerBg: (id: string, bgColor: string | undefined) => void
  setLayerMode: (id: string, mode: 'manual' | 'code') => void
  setLayerCode: (id: string, code: string) => void
  moveLayer: (srcId: string, targetId: string) => void
  selectLayer: (id: string) => void

  // Palettes
  addPalette: (name: string, colors: string[]) => string
  updatePalette: (id: string, name?: string, colors?: string[]) => void
  deletePalette: (id: string) => void

  // Patterns / stamps
  addPattern: (name: string, code: string) => string
  deletePattern: (id: string) => void

  // File
  applyFile: (content: string) => void
}

export function createHandler(cb: BridgeCallbacks): (method: string, params?: Record<string, unknown>) => unknown {
  return (method, params) => {
    switch (method) {
      // State
      case 'getState':
        return cb.getState()
      case 'getSerializedProject':
        return cb.getSerializedProject()

      // Artboard
      case 'setArtboardSize':
        cb.setArtboardSize(params!.width as number, params!.height as number)
        return { ok: true }

      // Layers
      case 'addLayer':
        return { layerId: cb.addLayer(params?.name as string | undefined) }
      case 'deleteLayer':
        cb.deleteLayer(params!.layerId as string)
        return { ok: true }
      case 'renameLayer':
        cb.renameLayer(params!.layerId as string, params!.name as string)
        return { ok: true }
      case 'setLayerVisible':
        cb.setLayerVisible(params!.layerId as string, params!.visible as boolean)
        return { ok: true }
      case 'setLayerBg':
        cb.setLayerBg(params!.layerId as string, (params!.bgColor as string) ?? undefined)
        return { ok: true }
      case 'setLayerMode':
        cb.setLayerMode(params!.layerId as string, params!.mode as 'manual' | 'code')
        return { ok: true }
      case 'setLayerCode':
        cb.setLayerCode(params!.layerId as string, params!.code as string)
        return { ok: true }
      case 'moveLayer':
        cb.moveLayer(params!.srcId as string, params!.targetId as string)
        return { ok: true }
      case 'selectLayer':
        cb.selectLayer(params!.layerId as string)
        return { ok: true }

      // Palettes
      case 'addPalette':
        return { paletteId: cb.addPalette(params!.name as string, params!.colors as string[]) }
      case 'updatePalette':
        cb.updatePalette(params!.paletteId as string, params?.name as string | undefined, params?.colors as string[] | undefined)
        return { ok: true }
      case 'deletePalette':
        cb.deletePalette(params!.paletteId as string)
        return { ok: true }

      // Patterns / stamps
      case 'addPattern':
        return { patternId: cb.addPattern(params!.name as string, params!.code as string) }
      case 'deletePattern':
        cb.deletePattern(params!.patternId as string)
        return { ok: true }

      // File
      case 'applyFile':
        cb.applyFile(params!.content as string)
        return { ok: true }

      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }
}

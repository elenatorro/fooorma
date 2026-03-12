/** WebSocket protocol between MCP server ↔ Fooorma PWA */

export interface BridgeRequest {
  id: string
  method: string
  params?: Record<string, unknown>
}

export interface BridgeResponse {
  id: string
  result?: unknown
  error?: string
}

/** All methods the MCP server can call on the PWA */
export type BridgeMethod =
  // State
  | 'getState'
  | 'getSerializedProject'
  // Artboard
  | 'setArtboardSize'
  // Layers
  | 'addLayer'
  | 'deleteLayer'
  | 'renameLayer'
  | 'setLayerVisible'
  | 'setLayerBg'
  | 'setLayerMode'
  | 'setLayerCode'
  | 'moveLayer'
  | 'selectLayer'
  // Palettes
  | 'addPalette'
  | 'updatePalette'
  | 'deletePalette'
  // Patterns / stamps
  | 'addPattern'
  | 'updatePattern'
  | 'deletePattern'
  // File
  | 'applyFile'

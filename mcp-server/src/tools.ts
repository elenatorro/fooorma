import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { WsBridge } from './ws-bridge.js'

export function registerTools(server: Server, bridge: WsBridge) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // ── State ──
      {
        name: 'fooorma_get_state',
        description: 'Get the full project state: layers, artboard size, palettes, patterns, active layer',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'fooorma_get_serialized',
        description: 'Export the current project as .ooo file text',
        inputSchema: { type: 'object' as const, properties: {} },
      },

      // ── Artboard ──
      {
        name: 'fooorma_set_artboard_size',
        description: 'Set the artboard dimensions in pixels',
        inputSchema: {
          type: 'object' as const,
          properties: {
            width:  { type: 'number', description: 'Width in pixels (100–8192)' },
            height: { type: 'number', description: 'Height in pixels (100–8192)' },
          },
          required: ['width', 'height'],
        },
      },

      // ── Layers ──
      {
        name: 'fooorma_add_layer',
        description: 'Add a new layer. Returns the new layer ID.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            name: { type: 'string', description: 'Layer name (optional)' },
          },
        },
      },
      {
        name: 'fooorma_delete_layer',
        description: 'Delete a layer by ID',
        inputSchema: {
          type: 'object' as const,
          properties: { layerId: { type: 'string' } },
          required: ['layerId'],
        },
      },
      {
        name: 'fooorma_rename_layer',
        description: 'Rename a layer',
        inputSchema: {
          type: 'object' as const,
          properties: {
            layerId: { type: 'string' },
            name:    { type: 'string' },
          },
          required: ['layerId', 'name'],
        },
      },
      {
        name: 'fooorma_set_layer_visible',
        description: 'Show or hide a layer',
        inputSchema: {
          type: 'object' as const,
          properties: {
            layerId: { type: 'string' },
            visible: { type: 'boolean' },
          },
          required: ['layerId', 'visible'],
        },
      },
      {
        name: 'fooorma_set_layer_bg',
        description: 'Set a layer background color (hex) or remove it (null)',
        inputSchema: {
          type: 'object' as const,
          properties: {
            layerId: { type: 'string' },
            bgColor: { type: ['string', 'null'] as any, description: 'Hex color like #1a1a2e, or null to remove' },
          },
          required: ['layerId'],
        },
      },
      {
        name: 'fooorma_set_layer_mode',
        description: "Switch a layer between 'manual' and 'code' mode",
        inputSchema: {
          type: 'object' as const,
          properties: {
            layerId: { type: 'string' },
            mode:    { type: 'string', enum: ['manual', 'code'] },
          },
          required: ['layerId', 'mode'],
        },
      },
      {
        name: 'fooorma_set_layer_code',
        description: 'Set the code query for a code-mode layer. This is the primary way to create procedural art.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            layerId: { type: 'string' },
            code:    { type: 'string', description: 'fooorma code (e.g. rect(0.5, 0.5, 0.3, 0.3))' },
          },
          required: ['layerId', 'code'],
        },
      },
      {
        name: 'fooorma_move_layer',
        description: 'Reorder a layer by moving it to a target position',
        inputSchema: {
          type: 'object' as const,
          properties: {
            srcId:    { type: 'string', description: 'Layer ID to move' },
            targetId: { type: 'string', description: 'Layer ID to move before' },
          },
          required: ['srcId', 'targetId'],
        },
      },
      {
        name: 'fooorma_select_layer',
        description: 'Set the active layer',
        inputSchema: {
          type: 'object' as const,
          properties: { layerId: { type: 'string' } },
          required: ['layerId'],
        },
      },

      // ── Palettes ──
      {
        name: 'fooorma_add_palette',
        description: 'Create a custom palette. Returns the palette ID.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            name:   { type: 'string' },
            colors: { type: 'array', items: { type: 'string' }, description: 'Array of hex colors' },
          },
          required: ['name', 'colors'],
        },
      },
      {
        name: 'fooorma_update_palette',
        description: 'Update a custom palette',
        inputSchema: {
          type: 'object' as const,
          properties: {
            paletteId: { type: 'string' },
            name:      { type: 'string' },
            colors:    { type: 'array', items: { type: 'string' } },
          },
          required: ['paletteId'],
        },
      },
      {
        name: 'fooorma_delete_palette',
        description: 'Delete a custom palette',
        inputSchema: {
          type: 'object' as const,
          properties: { paletteId: { type: 'string' } },
          required: ['paletteId'],
        },
      },

      // ── Patterns / stamps ──
      {
        name: 'fooorma_add_stamp',
        description: 'Create a stamp (reusable code snippet). Returns the stamp ID.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            name: { type: 'string', description: 'Stamp name' },
            code: { type: 'string', description: 'fooorma code for the stamp (shapes in 0–1 local space)' },
          },
          required: ['name', 'code'],
        },
      },
      {
        name: 'fooorma_delete_pattern',
        description: 'Delete a custom pattern or stamp',
        inputSchema: {
          type: 'object' as const,
          properties: { patternId: { type: 'string' } },
          required: ['patternId'],
        },
      },

      // ── File ──
      {
        name: 'fooorma_apply_file',
        description: 'Load a .ooo file content, replacing the current project',
        inputSchema: {
          type: 'object' as const,
          properties: {
            content: { type: 'string', description: '.ooo file content' },
          },
          required: ['content'],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      let result: unknown

      switch (name) {
        case 'fooorma_get_state':
          result = await bridge.call('getState')
          break
        case 'fooorma_get_serialized':
          result = await bridge.call('getSerializedProject')
          break
        case 'fooorma_set_artboard_size':
          result = await bridge.call('setArtboardSize', { width: args?.width, height: args?.height })
          break
        case 'fooorma_add_layer':
          result = await bridge.call('addLayer', { name: args?.name })
          break
        case 'fooorma_delete_layer':
          result = await bridge.call('deleteLayer', { layerId: args?.layerId })
          break
        case 'fooorma_rename_layer':
          result = await bridge.call('renameLayer', { layerId: args?.layerId, name: args?.name })
          break
        case 'fooorma_set_layer_visible':
          result = await bridge.call('setLayerVisible', { layerId: args?.layerId, visible: args?.visible })
          break
        case 'fooorma_set_layer_bg':
          result = await bridge.call('setLayerBg', { layerId: args?.layerId, bgColor: args?.bgColor })
          break
        case 'fooorma_set_layer_mode':
          result = await bridge.call('setLayerMode', { layerId: args?.layerId, mode: args?.mode })
          break
        case 'fooorma_set_layer_code':
          result = await bridge.call('setLayerCode', { layerId: args?.layerId, code: args?.code })
          break
        case 'fooorma_move_layer':
          result = await bridge.call('moveLayer', { srcId: args?.srcId, targetId: args?.targetId })
          break
        case 'fooorma_select_layer':
          result = await bridge.call('selectLayer', { layerId: args?.layerId })
          break
        case 'fooorma_add_palette':
          result = await bridge.call('addPalette', { name: args?.name, colors: args?.colors })
          break
        case 'fooorma_update_palette':
          result = await bridge.call('updatePalette', { paletteId: args?.paletteId, name: args?.name, colors: args?.colors })
          break
        case 'fooorma_delete_palette':
          result = await bridge.call('deletePalette', { paletteId: args?.paletteId })
          break
        case 'fooorma_add_stamp':
          result = await bridge.call('addPattern', { name: args?.name, code: args?.code })
          break
        case 'fooorma_delete_pattern':
          result = await bridge.call('deletePattern', { patternId: args?.patternId })
          break
        case 'fooorma_apply_file':
          result = await bridge.call('applyFile', { content: args?.content })
          break
        default:
          return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true }
      }

      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      return { content: [{ type: 'text' as const, text }] }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true }
    }
  })
}

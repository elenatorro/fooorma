/** WebSocket protocol between MCP server ↔ fooorma PWA (mirrors mcp-server/src/protocol.ts) */

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

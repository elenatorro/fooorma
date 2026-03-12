import { WebSocketServer, WebSocket } from 'ws'
import type { BridgeRequest, BridgeResponse } from './protocol.js'

const REQUEST_TIMEOUT = 15_000

export class WsBridge {
  private wss: WebSocketServer
  private client: WebSocket | null = null
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private idCounter = 0

  constructor(port: number) {
    this.wss = new WebSocketServer({ port })
    this.wss.on('connection', (ws) => {
      // Replace previous client (handles page reloads)
      if (this.client && this.client.readyState === WebSocket.OPEN) {
        this.client.close()
      }
      this.client = ws
      console.error(`[fooorma-mcp] PWA connected`)

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as BridgeResponse
          const p = this.pending.get(msg.id)
          if (!p) return
          this.pending.delete(msg.id)
          clearTimeout(p.timer)
          if (msg.error) p.reject(new Error(msg.error))
          else p.resolve(msg.result)
        } catch { /* ignore malformed messages */ }
      })

      ws.on('close', () => {
        if (this.client === ws) {
          this.client = null
          console.error(`[fooorma-mcp] PWA disconnected`)
        }
      })
    })

    console.error(`[fooorma-mcp] WebSocket server listening on port ${port}`)
  }

  get isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN
  }

  async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('fooorma is not connected. Open the app in your browser with ?mcp to enable the bridge.')
    }

    const id = String(++this.idCounter)
    const req: BridgeRequest = { id, method, params }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timed out: ${method}`))
      }, REQUEST_TIMEOUT)

      this.pending.set(id, { resolve, reject, timer })
      this.client!.send(JSON.stringify(req))
    })
  }

  close() {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('Bridge closing'))
    }
    this.pending.clear()
    this.wss.close()
  }
}

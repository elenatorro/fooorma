import type { BridgeRequest, BridgeResponse } from './protocol'
import type { BridgeCallbacks } from './handler'
import { createHandler } from './handler'

const RECONNECT_INTERVAL = 10_000  // retry every 10s, silently

export class FooormaBridge {
  private ws: WebSocket | null = null
  private handler: (method: string, params?: Record<string, unknown>) => unknown
  private port: number
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  connected = $state(false)

  constructor(callbacks: BridgeCallbacks, port = 9876) {
    this.handler = createHandler(callbacks)
    this.port = port
    this.connect()
  }

  private connect() {
    if (this.destroyed) return
    try {
      this.ws = new WebSocket(`ws://localhost:${this.port}`)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.connected = true
      console.log('[mcp] connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const req = JSON.parse(event.data as string) as BridgeRequest
        let result: unknown
        let error: string | undefined

        try {
          result = this.handler(req.method, req.params)
        } catch (e) {
          error = e instanceof Error ? e.message : String(e)
        }

        const res: BridgeResponse = { id: req.id, result, error }
        this.ws?.send(JSON.stringify(res))
      } catch { /* ignore malformed messages */ }
    }

    this.ws.onclose = () => {
      this.connected = false
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // Silently ignore — onclose handles reconnect
    }
  }

  private scheduleReconnect() {
    if (this.destroyed) return
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_INTERVAL)
  }

  disconnect() {
    this.destroyed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }
}

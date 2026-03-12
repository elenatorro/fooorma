#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { WsBridge } from './ws-bridge.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'

const WS_PORT = parseInt(process.env.FOOORMA_WS_PORT ?? '9876')

const server = new Server(
  { name: 'fooorma-mcp', version: '0.1.0' },
  { capabilities: { tools: {}, resources: {} } },
)

const bridge = new WsBridge(WS_PORT)

registerTools(server, bridge)
registerResources(server)

const transport = new StdioServerTransport()
await server.connect(transport)

// Graceful shutdown
process.on('SIGINT', () => {
  bridge.close()
  process.exit(0)
})
process.on('SIGTERM', () => {
  bridge.close()
  process.exit(0)
})

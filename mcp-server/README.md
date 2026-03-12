# fooorma MCP Server

MCP (Model Context Protocol) server that lets Claude and other LLMs control the fooorma app directly through your browser.

## Architecture

```
Claude Desktop / Claude Code
    ↕ stdio (MCP protocol)
fooorma-mcp (this server)      ← WebSocket server on localhost:9876
    ↕ WebSocket
fooorma PWA (browser tab)      ← connects when opened with ?mcp
```

The MCP server runs locally and acts as a bridge between Claude and your running fooorma app. It opens a WebSocket server that the PWA connects to when you open the app with the `?mcp` parameter.

## Setup

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Connect to Claude Code

The easiest way — runs TypeScript directly, no build step:

```bash
claude mcp add fooorma npx tsx /absolute/path/to/forma/mcp-server/src/index.ts
```

Alternatively, build first and point to the compiled JS:

```bash
npm run build
claude mcp add fooorma node /absolute/path/to/forma/mcp-server/dist/index.js
```

### 3. Connect to Claude Desktop

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Option A — Direct run (no build):**

```json
{
  "mcpServers": {
    "fooorma": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/forma/mcp-server/src/index.ts"]
    }
  }
}
```

**Option B — Pre-built:**

```bash
cd mcp-server
npm run build
```

```json
{
  "mcpServers": {
    "fooorma": {
      "command": "node",
      "args": ["/absolute/path/to/forma/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after editing.

### 4. Open fooorma with MCP enabled

Open fooorma with the `?mcp` query parameter to enable the WebSocket connection:

```
http://localhost:5173?mcp
```

The `?mcp` parameter tells the app to connect to the MCP server's WebSocket. Without it, the app runs standalone with no MCP bridge.

You should see in the MCP server logs:
```
[fooorma-mcp] WebSocket server listening on port 9876
[fooorma-mcp] PWA connected
```

## Configuration

### WebSocket port

Default port is `9876`. To change it:

**Server side** — set the `FOOORMA_WS_PORT` environment variable:

```json
{
  "mcpServers": {
    "fooorma": {
      "command": "node",
      "args": ["/path/to/forma/mcp-server/dist/index.js"],
      "env": {
        "FOOORMA_WS_PORT": "9999"
      }
    }
  }
}
```

**PWA side** — add `?mcp&mcpPort=9999` to the URL:

```
http://localhost:5173?mcp&mcpPort=9999
```

Both sides must use the same port.

## Development

For development with auto-reload:

```bash
cd mcp-server
npm run dev
```

This uses `tsx --watch` to recompile on changes.

## Available tools

### Project state
| Tool | Description |
|------|-------------|
| `fooorma_get_state` | Get full project state (layers, artboard, palettes, patterns) |
| `fooorma_get_serialized` | Export project as `.ooo` file text |
| `fooorma_apply_file` | Load `.ooo` file content, replacing current project |

### Artboard
| Tool | Description |
|------|-------------|
| `fooorma_set_artboard_size` | Set artboard dimensions (width, height in pixels) |

### Layers
| Tool | Description |
|------|-------------|
| `fooorma_add_layer` | Add a new layer (returns layer ID) |
| `fooorma_delete_layer` | Delete a layer |
| `fooorma_rename_layer` | Rename a layer |
| `fooorma_set_layer_visible` | Show/hide a layer |
| `fooorma_set_layer_bg` | Set layer background color |
| `fooorma_set_layer_mode` | Switch between manual/code mode |
| `fooorma_set_layer_code` | Set code for a code-mode layer |
| `fooorma_move_layer` | Reorder layers |
| `fooorma_select_layer` | Set the active layer |

### Palettes
| Tool | Description |
|------|-------------|
| `fooorma_add_palette` | Create a custom color palette |
| `fooorma_update_palette` | Update palette name/colors |
| `fooorma_delete_palette` | Delete a custom palette |

### Stamps
| Tool | Description |
|------|-------------|
| `fooorma_add_stamp` | Create a reusable stamp (code snippet) |
| `fooorma_delete_pattern` | Delete a stamp or pattern |

## Available resources

Static documentation that Claude can read without needing the PWA to be connected:

| Resource URI | Description |
|--------------|-------------|
| `fooorma://api-reference` | Complete fooorma code API reference |
| `fooorma://project-format` | `.ooo` file format documentation |
| `fooorma://coordinate-system` | How coordinates and sizes work in fooorma |

## Example usage with Claude

Once connected, you can ask Claude things like:

- "Create a new layer with a grid of colorful circles"
- "Add a palette called Sunset with warm colors"
- "Set the artboard to 1920x1080"
- "Show me the current project state"
- "Write a tile pattern with noise-based variation"

Claude will use the MCP tools to manipulate fooorma in real time — you'll see changes appear immediately in your browser.

## Troubleshooting

**"fooorma PWA is not connected"**
The app isn't connected to the WebSocket server. Make sure:
1. The MCP server is running
2. fooorma is open in a browser tab with `?mcp`
3. Both are using the same port (default 9876)
4. No firewall is blocking localhost WebSocket connections

**Tools timeout after 15 seconds**
The PWA may have disconnected (page reload, tab closed). Refresh the fooorma tab.

**Changes don't appear in the app**
Check the browser console for WebSocket errors. The PWA auto-reconnects if disconnected, but it may take a few seconds.

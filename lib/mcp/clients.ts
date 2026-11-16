import { API_URL } from '@/lib/api/client'

/**
 * The assistants Settings → Developers shows set-up steps for (PULSE-54, option A, owner 24-09-2026; the MCP page
 * became the Developers page's AI assistants in the settings overhaul, copy deck §11.3).
 *
 * The wording follows the MCP docs page (docs.ciphera.net/pulse/mcp) so the two never disagree.
 * Claude (web), Claude Code, Cursor and VS Code were driven end to end against Pulse in M4, and
 * Cline's CLI on 15-11-2026. Claude's steps start in its connector directory, where Pulse Analytics
 * is listed since 15-11-2026, with the custom connector as the alternative. ChatGPT, Le Chat and
 * Copilot Studio follow their vendors' documentation until the owner's hosted run (M4, PULSE-42).
 * Any other client has no tile: the line under the tiles says it can connect with the server URL
 * (owner's pick A1, 16-11-2026).
 *
 * A mark here is the VENDOR's, drawn on a picker tile to say where the steps apply. It is not a
 * claim about a connecting client's identity: rows in the connection list still draw a logo only
 * for a client Pulse has verified (AppMark).
 */

export type McpClientId = 'claude' | 'claude-code' | 'chatgpt' | 'cursor' | 'vscode' | 'lechat' | 'copilot' | 'cline'

export interface McpStep {
  title: string
  text: string
  /** A value to paste, shown in a CopyBlock beside the step. */
  copy?: { label: string; code: string }
}

export interface McpClient {
  id: McpClientId
  name: string
  /** A CDN path under /connect (versioned file names). */
  mark: string
  steps: (url: string) => McpStep[]
}

/**
 * The MCP endpoint of THIS environment's API: production shows pulse-api.ciphera.net/mcp,
 * staging shows its own origin plus /mcp (there the API is served from the app's origin).
 * Derived from the API origin the app already talks to, so a build can never show another
 * environment's URL.
 */
export function mcpServerUrl(apiUrl: string = API_URL): string {
  return new URL(apiUrl).origin + '/mcp'
}

const done = (name: string): McpStep => ({
  title: 'All done',
  text: `Ask ${name} about your analytics, for example “What were my top referrers this month?”`,
})
const allow = 'Pulse opens: choose which sites it can read, then click Allow.'

export const MCP_CLIENTS: McpClient[] = [
  {
    id: 'claude',
    name: 'Claude',
    mark: '/connect/claude-v1.svg',
    steps: (url) => [
      { title: "Find it in Claude's directory", text: 'In Claude, open Customize → Connectors and select Discover. Search for Pulse Analytics.' },
      { title: 'Connect', text: 'Select Connect to Claude. Pulse opens: choose your sites and click Allow.' },
      { title: 'Or add it by its address', text: 'Under Customize → Connectors, click +, then Add custom connector, and paste this URL.', copy: { label: 'Server URL', code: url } },
    ],
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    mark: '/connect/claude-v1.svg',
    steps: (url) => [
      { title: 'Add Pulse Analytics', text: 'Run this in your terminal.', copy: { label: 'Terminal', code: `claude mcp add --transport http pulse ${url}` } },
      { title: 'Sign in', text: `${allow} Claude Code finishes on its own.`, copy: { label: 'Terminal', code: 'claude mcp login pulse' } },
      done('Claude Code'),
    ],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    mark: '/connect/chatgpt-v1.png',
    steps: (url) => [
      { title: 'Turn on developer mode', text: 'Settings → Security and login → Developer mode. It is on Plus, Pro, Business, Enterprise and Edu, on the web.' },
      { title: 'Add Pulse Analytics', text: 'Create an app for a remote MCP server with this URL and OAuth authentication.', copy: { label: 'Server URL', code: url } },
      { title: 'Connect', text: allow },
      done('ChatGPT'),
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    mark: '/connect/cursor-v1.png',
    steps: (url) => [
      {
        title: 'Add Pulse Analytics',
        text: 'Paste into .cursor/mcp.json in a project, or ~/.cursor/mcp.json for every project.',
        copy: { label: 'mcp.json', code: JSON.stringify({ mcpServers: { pulse: { url, auth: { CLIENT_ID: 'pulse-analytics-cursor' } } } }, null, 2) },
      },
      { title: 'Sign in', text: `Approve the server once, then sign in. ${allow}`, copy: { label: 'Terminal', code: 'cursor-agent mcp enable pulse\ncursor-agent mcp login pulse' } },
      done('Cursor'),
    ],
  },
  {
    id: 'vscode',
    name: 'VS Code',
    mark: '/connect/vscode-v1.png',
    steps: (url) => [
      { title: 'Add Pulse Analytics', text: 'Paste into .vscode/mcp.json.', copy: { label: 'mcp.json', code: JSON.stringify({ servers: { pulse: { type: 'http', url } } }, null, 2) } },
      { title: 'Start it', text: 'Run MCP: List Servers from the Command Palette, choose pulse, then Start Server.' },
      { title: 'Sign in', text: 'Let VS Code authenticate and open the website, then click Allow in Pulse.' },
      done('VS Code'),
    ],
  },
  {
    id: 'lechat',
    name: 'Le Chat',
    mark: '/connect/mistral-v1.png',
    steps: (url) => [
      { title: 'Add a connector', text: 'Open Connectors, click + Add Connector and choose Custom MCP Connector. Adding one is an administrator feature.' },
      { title: 'Name it and paste the URL', text: 'Name it pulseanalytics, with no spaces or symbols.', copy: { label: 'Server URL', code: url } },
      { title: 'Connect', text: 'Click Connect, then Allow in Pulse.' },
      done('Le Chat'),
    ],
  },
  {
    id: 'copilot',
    name: 'Copilot Studio',
    mark: '/connect/copilotstudio-v1.png',
    steps: (url) => [
      { title: 'Add an MCP tool', text: 'In your agent, open Tools → Add a tool → New tool → Model Context Protocol. The environment needs generative orchestration.' },
      { title: 'Enter the server URL', text: 'Give it a name and a description.', copy: { label: 'Server URL', code: url } },
      { title: 'Choose OAuth', text: 'OAuth 2.0 → Dynamic discovery, then Create and Next.' },
      { title: 'Connect', text: 'Create a new connection, click Allow in Pulse, then Add to agent.' },
    ],
  },
  {
    id: 'cline',
    name: 'Cline',
    mark: '/connect/cline-v1.png',
    steps: (url) => [
      { title: 'Add Pulse Analytics', text: 'Run this in your terminal.', copy: { label: 'Terminal', code: `cline mcp add pulse ${url} --transport streamableHttp --yes` } },
      { title: 'Sign in', text: 'Run cline mcp, choose Authorize OAuth, then pulse. Pulse opens in your browser: click Allow.', copy: { label: 'Terminal', code: 'cline mcp' } },
    ],
  },
]

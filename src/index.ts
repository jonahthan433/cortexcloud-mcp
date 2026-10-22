#!/usr/bin/env node
/**
 * @cortexcloud.org/mcp — stdio bridge to the hosted CortexCloud MCP server.
 *
 * The hosted server at https://api.cortexcloud.org/mcp is the single source of
 * truth for tools, schemas and prices, so this package never duplicates (and
 * never drifts from) the tool surface. It exists for MCP clients that can only
 * speak stdio and cannot connect to a remote HTTP endpoint directly.
 *
 *   [stdio client]  <--MCP-->  this bridge  <--Streamable HTTP-->  api.cortexcloud.org/mcp
 *
 * Free tools work out of the box. Paid tool calls return the x402 challenge
 * inside the tool result — the agent sees the price, payee, asset and network
 * before anything is signed. Clients that can attach a payment header can
 * forward one with CORTEXCLOUD_PAYMENT_SIGNATURE.
 *
 * Env:
 *   CORTEXCLOUD_BASE               default https://api.cortexcloud.org
 *   CORTEXCLOUD_PAYMENT_SIGNATURE  optional x402 payment header to forward
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const VERSION = '0.5.0';
const BASE = (process.env.CORTEXCLOUD_BASE ?? 'https://api.cortexcloud.org').replace(/\/$/, '');
const ENDPOINT = new URL('/mcp', BASE);

const headers: Record<string, string> = {};
const signature = process.env.CORTEXCLOUD_PAYMENT_SIGNATURE;
if (signature) headers['payment-signature'] = signature;

const upstream = new Client(
  { name: 'cortexcloud-bridge', version: VERSION },
  { capabilities: {} },
);

async function main(): Promise<void> {
  await upstream.connect(
    new StreamableHTTPClientTransport(ENDPOINT, { requestInit: { headers } }),
  );

  const server = new Server(
    { name: 'cortexcloud', version: VERSION },
    { capabilities: { tools: {} } },
  );

  // Tool list is served by the upstream, never cached here: a route or price
  // change ships on the server and every client sees it on the next call.
  server.setRequestHandler(ListToolsRequestSchema, async () => upstream.listTools());

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await upstream.callTool(request.params);
    } catch (e) {
      return {
        content: [{ type: 'text', text: `CortexCloud bridge error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  });

  await server.connect(new StdioServerTransport());
  // stderr only: stdout is the MCP wire.
  process.stderr.write(`cortexcloud-mcp ${VERSION} -> ${ENDPOINT.href}\n`);
}

main().catch((e) => {
  process.stderr.write(`cortexcloud-mcp failed to start: ${(e as Error).message}\n`);
  process.exit(1);
});

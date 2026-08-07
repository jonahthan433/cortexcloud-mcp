#!/usr/bin/env node
/**
 * CortexCloud MCP server — pay-per-call access to the CortexCloud x402 API.
 *
 * Every paid tool call triggers the x402 flow automatically via @x402/fetch:
 * 402 challenge -> sign payment authorization -> facilitator settles USDC on
 * Base from the operator's wallet -> request retried with payment header.
 *
 * Env:
 *   EVM_PRIVATE_KEY  (required) viem 0x-prefixed private key of the paying wallet
 *   EVM_RPC_URL      (optional) default https://mainnet.base.org
 *   CORTEXCLOUD_BASE (optional) default https://api.cortexcloud.org/x402/v1
 *   BUILDER_CODE     (optional) default bc_cortexcloud (attribution code)
 *
 * Dual transport: run as the bin (stdio) for local Claude Desktop / Cursor, or
 * import createServer() and host it over Streamable HTTP (src/http.ts).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import { BuilderCodeClientExtension } from '@x402/extensions';
import { privateKeyToAccount } from 'viem/accounts';
import { pathToFileURL } from 'node:url';

const BASE = (process.env.CORTEXCLOUD_BASE ?? 'https://api.cortexcloud.org/x402/v1').replace(/\/$/, '');
const key = process.env.EVM_PRIVATE_KEY;
if (!key) {
  console.error('EVM_PRIVATE_KEY required — the wallet that pays USDC for API calls.');
  process.exit(1);
}
const account = privateKeyToAccount(key as `0x${string}`);

// Default x402 selector picks accepts[0] (the primary wallet). Prefer the
// second wallet when it's advertised, so sweep/agent traffic lands there.
const TARGET_WALLET = (process.env.CORTEXCLOUD_PAYTO ?? '0x5a0353bc9c75b893a9b5735d3e79f1bd988ea143').toLowerCase();
const client = new x402Client((_v, accepts) => {
  const hit = accepts.find((a) => a.payTo?.toLowerCase() === TARGET_WALLET);
  return hit ?? accepts[0];
})
  .register('eip155:8453', new ExactEvmScheme(account, { rpcUrl: process.env.EVM_RPC_URL ?? 'https://mainnet.base.org' }))
  .registerExtension(new BuilderCodeClientExtension(process.env.BUILDER_CODE ?? 'bc_cortexcloud'));
const fetchWithPay = wrapFetchWithPayment(fetch, client);

async function call(path: string, body?: Record<string, unknown>): Promise<string> {
  try {
    const res = await fetchWithPay(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) return `HTTP ${res.status}: ${text.slice(0, 2000)}`;
    return text;
  } catch (e) {
    return `ERROR: ${(e as Error).message}`;
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'cortexcloud', version: '0.2.0' });

  // ------ LLM / embeddings ------
  server.registerTool('chat_completions', {
    description: 'OpenAI-compatible chat completions. Paid per call in USDC on Base via x402 (payTo wallet advertised in the 402 challenge).',
    inputSchema: {
      model: z.string().describe('Model id, e.g. llama-3.3-70b-versatile, openai/gpt-4o-mini'),
      messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string() })).describe('Chat messages'),
      temperature: z.number().optional(),
      max_tokens: z.number().optional(),
      stream: z.boolean().optional(),
    },
  }, async ({ model, messages, temperature, max_tokens, stream }) => ({
    content: [{ type: 'text', text: await call('/chat/completions', { model, messages, temperature, max_tokens, stream }) }],
  }));

  server.registerTool('responses', {
    description: 'OpenAI Responses API (alias of chat). Paid per call in USDC via x402.',
    inputSchema: {
      model: z.string(),
      input: z.union([z.string(), z.array(z.object({ role: z.string(), content: z.string() }))]),
      temperature: z.number().optional(),
      max_output_tokens: z.number().optional(),
    },
  }, async ({ model, input, temperature, max_output_tokens }) => ({
    content: [{ type: 'text', text: await call('/responses', { model, input, temperature, max_output_tokens }) }],
  }));

  server.registerTool('embeddings', {
    description: 'OpenAI-compatible text embeddings. Paid per call in USDC via x402.',
    inputSchema: {
      input: z.union([z.string(), z.array(z.string())]).describe('Text or list of texts to embed'),
      model: z.string().describe('Embedding model id'),
    },
  }, async ({ input, model }) => ({
    content: [{ type: 'text', text: await call('/embeddings', { input, model }) }],
  }));

  server.registerTool('models', {
    description: 'List available AI models (free, no payment).',
    inputSchema: {},
  }, async () => ({
    content: [{ type: 'text', text: await call('/models') }],
  }));

  // ----- imaging / audio -----
  server.registerTool('image_generation', {
    description: 'AI image generation. Paid per image in USD via x402.',
    inputSchema: {
      prompt: z.string(),
      n: z.number().int().min(1).max(4).optional().describe('Number of images'),
      size: z.enum(['256x256', '512x512', '1024x1024']).optional(),
    },
  }, async ({ prompt, n, size }) => ({
    content: [{ type: 'text', text: await call('/images/generations', { prompt, n, size }) }],
  }));

  server.registerTool('text_to_speech', {
    description: 'Text-to-speech audio generation. Paid per call in USD via x402.',
    inputSchema: {
      input: z.string().describe('Text to speak'),
      model: z.string().optional().describe('TTS model id'),
      voice: z.string().optional(),
    },
  }, async ({ input, model, voice }) => ({
    content: [{ type: 'text', text: await call('/audio/speech', { input, model, voice }) }],
  }));

  // ----- Web / news search (Exa) -----
  server.registerTool('web_search', {
    description: 'Web search (Exa AI). Paid per query in USDC via x402.',
    inputSchema: {
      query: z.string().describe('Search query'),
      numResults: z.number().int().min(1).max(20).optional().describe('Number of results (default 10)'),
      type: z.enum(['neural', 'keyword']).optional(),
      includeDomains: z.array(z.string()).optional(),
      excludeDomains: z.array(z.string()).optional(),
    },
  }, async (args) => ({
    content: [{ type: 'text', text: await call('/search', args) }],
  }));

  server.registerTool('search_contents', {
    description: 'Fetch full content for Exa search result IDs. Paid in USD via x402.',
    inputSchema: {
      ids: z.array(z.string()).describe('Exa result IDs'),
      text: z.boolean().optional(),
      summary: z.boolean().optional(),
    },
  }, async ({ ids, text, summary }) => ({
    content: [{ type: 'text', text: await call('/search/contents', { ids, text, summary }) }],
  }));

  server.registerTool('news', {
    description: 'Recent finance/crypto news via Exa. Paid $0.02 per call via x402.',
    inputSchema: { q: z.string().describe('Query, e.g. bitcoin'), limit: z.number().int().min(1).max(30).optional() },
  }, async ({ q, limit }) => ({
    content: [{ type: 'text', text: await call(`/data/news${qs({ q, limit })}`) }],
  }));

  // ----- Crypto market -----
  server.registerTool('prices', {
    description: 'Crypto prices by coin id. Paid per call in USD via x402.',
    inputSchema: {
      ids: z.string().describe('Comma-separated coin ids, e.g. bitcoin,ethereum'),
      vs: z.string().optional().describe('Quote currency, default usd'),
    },
  }, async ({ ids, vs }) => ({
    content: [{ type: 'text', text: await call(`/data/prices${qs({ ids, vs })}`) }],
  }));

  server.registerTool('coins_search', {
    description: 'Search crypto coins by query. Paid per call in USD via x402.',
    inputSchema: { q: z.string().describe('Search query') },
  }, async ({ q }) => ({
    content: [{ type: 'text', text: await call(`/data/coins/search${qs({ q })}`) }],
  }));

  server.registerTool('crypto_history', {
    description: 'Coin price history over N days. Paid per call in USD via x402.',
    inputSchema: { id: z.string().describe('Coin id e.g. bitcoin'), vs: z.string().optional(), days: z.number().int().optional() },
  }, async ({ id, vs, days }) => ({
    content: [{ type: 'text', text: await call(`/crypto/history${qs({ id, vs, days })}`) }],
  }));

  // ----- FX -----
  server.registerTool('fx_list', {
    description: 'List supported fiat currencies/rates. Paid per call in USD via x402.',
    inputSchema: {},
  }, async () => ({
    content: [{ type: 'text', text: await call('/fx/list') }],
  }));

  server.registerTool('fx_price', {
    description: 'FX rate between two currencies. Paid per call via x402.',
    inputSchema: { base: z.string().optional().describe('default USD'), quote: z.string().optional().describe('default EUR') },
  }, async ({ base, quote }) => ({
    content: [{ type: 'text', text: await call(`/fx/price${qs({ base, quote })}`) }],
  }));

  // ----- DeFi / DeFi-Llama -----
  server.registerTool('defi_yields', {
    description: 'APY/TVL of top DeFi pools. Paid per call via x402.',
    inputSchema: { protocol: z.string().optional().describe('Filter by project slug, e.g. aave') },
  }, async ({ protocol }) => ({
    content: [{ type: 'text', text: await call(`/data/defi/yields${qs({ protocol })}`) }],
  }));

  server.registerTool('defi_protocols', {
    description: 'Categorized DeFi protocols list (OHLCV, categories). Paid per call via x402.',
    inputSchema: {},
  }, async () => ({
    content: [{ type: 'text', text: await call('/defillama/protocols') }],
  }));

  // ----- On-chain (Base) -----
  server.registerTool('base_balance', {
    description: 'Base native ETH balance for an address. Paid per call in USD via x402.',
    inputSchema: { address: z.string().describe('0x address') },
  }, async ({ address }) => ({
    content: [{ type: 'text', text: await call(`/data/base/balance${qs({ address })}`) }],
  }));

  server.registerTool('base_token_balance', {
    description: 'ERC-20 token balance on Base for an address. Paid per call via x402.',
    inputSchema: { address: z.string().describe('0x address'), token: z.string().describe('Token contract address') },
  }, async ({ address, token }) => ({
    content: [{ type: 'text', text: await call(`/data/base/token-balance${qs({ address, token })}`) }],
  }));

  server.registerTool('eth_balance', {
    description: 'Native ETH balance on Ethereum mainnet. Paid per call via x402.',
    inputSchema: { address: z.string().describe('0x address') },
  }, async ({ address }) => ({
    content: [{ type: 'text', text: await call(`/data/eth/balance${qs({ address })}`) }],
  }));

  server.registerTool('ethereum_rpc', {
    description: 'Proxy an Ethereum JSON-RPC call (eth_blockNumber, eth_getBalance...). Paid per call via x402.',
    inputSchema: {
      jsonrpc: z.string().optional().describe('default 2.0'), id: z.union([z.number(), z.string()]).optional(),
      method: z.string().describe('RPC method'), params: z.array(z.any()).optional(),
    },
  }, async ({ jsonrpc, id, method, params }) => ({
    content: [{ type: 'text', text: await call('/rpc/ethereum', { jsonrpc, id, method, params }) }],
  }));

  // ----- DEX -----
  server.registerTool('dex_search', {
    description: 'Search DEX pairs by query. Paid per call in USD via x402.',
    inputSchema: { q: z.string().describe('Search query') },
  }, async ({ q }) => ({
    content: [{ type: 'text', text: await call(`/data/dex/search${qs({ q })}`) }],
  }));

  server.registerTool('dex_pairs', {
    description: 'DEX pair info by chain and pair (token) address. Paid per call via x402.',
    inputSchema: { chain: z.string().describe('e.g. base, ethereum'), pair: z.string().describe('Token or pair address') },
  }, async ({ chain, pair }) => ({
    content: [{ type: 'text', text: await call(`/data/dex/pairs${qs({ chain, pair })}`) }],
  }));

  return server;
}

// Run stdio when executed directly (cortexcloud-mcp bin / Claude Desktop).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  })();
}
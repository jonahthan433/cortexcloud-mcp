#!/usr/bin/env node
/**
 * CortexCloud MCP server — optimization infrastructure for AI agents.
 *
 * Tools wrap the CortexCloud Optimization Network REST surface 1:1:
 *   cortex_estimate_optimization (free)  POST  /v1/estimate
 *   cortex_optimize              (x402)  POST  /v1/optimize
 *   cortex_get_job               (free)  GET   /v1/jobs/{job_id}
 *   cortex_list_backends         (free)  GET   /v1/backends
 *
 * The paid tool triggers the x402 flow automatically via @x402/fetch:
 * 402 challenge -> sign payment authorization -> facilitator settles USDC on
 * Base from the operator's wallet -> request retried with payment header.
 *
 * Env:
 *   EVM_PRIVATE_KEY  (required) viem 0x-prefixed private key of the paying wallet
 *   EVM_RPC_URL      (optional) default https://mainnet.base.org
 *   CORTEXCLOUD_BASE (optional) default https://api.cortexcloud.org
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

const BASE = (process.env.CORTEXCLOUD_BASE ?? 'https://api.cortexcloud.org').replace(/\/$/, '');
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

// Shared problem schema — mirrors /v1/estimate's ProblemInput (QUBO/Ising).
const problemSchema = z.object({
  problem_type: z.enum(['qubo', 'ising']).optional().describe('Defaults to qubo'),
  n: z.number().int().min(2).max(5000).describe('Number of binary variables'),
  data: z.object({
    linear: z.array(z.number()).optional().describe('Linear coefficients q_ii'),
    quadratic: z.record(z.number()).optional().describe('Sparse quadratic coefficients Q{i,j}'),
  }).describe('Problem data — either linear/quadratic (qubo) or h/J fields (ising)'),
});

export function createServer(): McpServer {
  const server = new McpServer({ name: 'cortexcloud', version: '0.4.0' });

  server.registerTool('cortex_estimate_optimization', {
    description: 'Analyze an optimization problem for free — returns a decision block: recommended mode/backend, estimated provider cost, USDC price, benchmark evidence. Always call this before paying for cortex_optimize.',
    inputSchema: {
      problem: problemSchema.describe('Optimization problem to analyze'),
    },
  }, async ({ problem }) => ({
    content: [{ type: 'text', text: await call('/v1/estimate', problem) }],
  }));

  server.registerTool('cortex_optimize', {
    description: 'Solve a QUBO/Ising optimization problem (x402-paid, USDC on Base). Returns a job_id to poll with cortex_get_job. Prices per run: classical $0.05, hybrid $0.10, quantum $0.85 (charged = max(list, provider cost x 2.0)). Use mode=auto unless you specifically need quantum.',
    inputSchema: {
      mode: z.enum(['auto', 'classical', 'hybrid', 'quantum']).optional().describe('Defaults to auto (fastest proven backend)'),
      problem: problemSchema.describe('Problem to solve'),
    },
  }, async ({ mode, problem }) => ({
    content: [{ type: 'text', text: await call('/v1/optimize', { mode: mode ?? 'auto', problem }) }],
  }));

  server.registerTool('cortex_get_job', {
    description: 'Poll an optimization job by id. Free — returns status, solution, objective, error.',
    inputSchema: {
      job_id: z.string().describe('Job id from cortex_optimize'),
    },
  }, async ({ job_id }) => ({
    content: [{ type: 'text', text: await call(`/v1/jobs/${encodeURIComponent(job_id)}`) }],
  }));

  server.registerTool('cortex_list_backends', {
    description: 'List solver backends (classical/hybrid/quantum) with availability, per-backend estimated provider cost, effective price, and sellable flag. Free — check this before choosing a quantum backend.',
    inputSchema: {},
  }, async () => ({
    content: [{ type: 'text', text: await call('/v1/backends') }],
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
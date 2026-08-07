import { z } from "zod";
import { getPaidFetch, CORTEXCLOUD_BASE_URL } from "./client.js";

const BASE = CORTEXCLOUD_BASE_URL;

async function paidJson(path: string, init?: RequestInit) {
  const paidFetch = getPaidFetch();
  const res = await paidFetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

export const chatTool = {
  name: "cortexcloud_chat",
  description:
    "Send an OpenAI-compatible chat completion to CortexCloud. Paid per call in USDC via x402.",
  inputSchema: {
    model: z.string().describe("Model id, e.g. 'groq/llama-3.3-70b-versatile'"),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string(),
        })
      )
      .describe("Conversation messages"),
    max_tokens: z.number().optional().describe("Max tokens to generate"),
    stream: z.boolean().optional().describe("Stream SSE (returns raw body)"),
  },
  async run(args: {
    model: string;
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    max_tokens?: number;
    stream?: boolean;
  }) {
    return paidJson("/x402/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        max_tokens: args.max_tokens,
        stream: args.stream,
      }),
    });
  },
};

export const modelsTool = {
  name: "cortexcloud_models",
  description:
    "List all available CortexCloud models (free, no payment required).",
  inputSchema: {},
  async run() {
    const res = await fetch(`${BASE}/x402/v1/models`);
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return { status: res.status, body: text };
    }
  },
};

export const baseBalanceTool = {
  name: "cortexcloud_base_balance",
  description:
    "Get the native ETH balance of a Base address. Paid per call in USDC via x402.",
  inputSchema: {
    address: z.string().describe("Base address, e.g. 0xabc..."),
  },
  async run(args: { address: string }) {
    return paidJson(
      `/x402/v1/data/base/balance?address=${encodeURIComponent(args.address)}`
    );
  },
};

export const baseTokenBalanceTool = {
  name: "cortexcloud_base_token_balance",
  description:
    "Get an ERC-20 token balance for a Base address. Paid per call in USDC via x402.",
  inputSchema: {
    address: z.string().describe("Base address"),
    token: z.string().describe("ERC-20 token contract address"),
  },
  async run(args: { address: string; token: string }) {
    return paidJson(
      `/x402/v1/data/base/token-balance?address=${encodeURIComponent(
        args.address
      )}&token=${encodeURIComponent(args.token)}`
    );
  },
};

export const pricesTool = {
  name: "cortexcloud_prices",
  description:
    "Get current crypto prices from CoinGecko via CortexCloud. Paid per call in USDC via x402.",
  inputSchema: {
    ids: z.string().optional().describe("Comma-separated coin ids, e.g. 'bitcoin,ethereum'"),
  },
  async run(args: { ids?: string }) {
    const q = args.ids ? `?ids=${encodeURIComponent(args.ids)}` : "";
    return paidJson(`/x402/v1/data/prices${q}`);
  },
};

export const dexSearchTool = {
  name: "cortexcloud_dex_search",
  description:
    "Search DEX token pairs via DEXScreener through CortexCloud. Paid per call in USDC via x402.",
  inputSchema: {
    query: z.string().describe("Token symbol or address to search"),
  },
  async run(args: { query: string }) {
    return paidJson(
      `/x402/v1/data/dex/search?q=${encodeURIComponent(args.query)}`
    );
  },
};

export const allTools = [
  chatTool,
  modelsTool,
  baseBalanceTool,
  baseTokenBalanceTool,
  pricesTool,
  dexSearchTool,
];

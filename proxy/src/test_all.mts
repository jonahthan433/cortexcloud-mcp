// Test every x402 paid endpoint: one signed payment each, report status.
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

const key = process.env.EVM_PRIVATE_KEY!.replace(/^0x/, "");
const account = privateKeyToAccount("0x" + key);
const publicClient = createPublicClient({ chain: base, transport: http() });

const NEW_WALLET = "0x5a0353bc9c75b893a9b5735d3e79f1bd988ea143";
const client = new x402Client((_v, accepts) => {
  const hit = accepts.find((a) => a.payTo?.toLowerCase() === NEW_WALLET);
  if (!hit) throw new Error("New wallet not in challenge accepts");
  return hit;
});
registerExactEvmScheme(client, {
  signer: toClientEvmSigner(account, publicClient),
  networks: ["eip155:8453"],
  schemeOptions: { rpcUrl: base.rpcUrls.default.http[0] },
});
const pf = wrapFetchWithPayment(globalThis["fetch"], client);

const B = "https://api.cortexcloud.org";
const CHAT = { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "hi" }], max_tokens: 8 };

// pre-sorted: method, path, query string, body (or null). body omitted => none
const tests = [
  ["POST", "/x402/v1/responses", CHAT],
  ["POST", "/x402/v1/chat/completions", CHAT],
  ["POST", "/x402/v1/embeddings", { model: "gemini-text-embedding-004", input: "hello" }],
  ["GET", "/x402/v1/models"],
  ["GET", "/x402/v1/data/prices", null, "ids=bitcoin"],
  ["GET", "/x402/v1/data/coins/search", null, "q=bitcoin"],
  ["GET", "/x402/v1/data/dex/search", null, "q=dai"],
  ["GET", "/x402/v1/data/dex/pairs", null, "chain=base&pair=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
  ["GET", "/x402/v1/data/base/balance", null, "address=0xCed8a9ff73427302cD0F0F95892EbfC2Ac83374A"],
  ["GET", "/x402/v1/data/base/token-balance", null, "address=0xCed8a9ff73427302cD0F0F95892EbfC2Ac83374A&token=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
  ["GET", "/x402/v1/data/base/nonce", null, "address=0xCed8a9ff73427302cD0F0F95892EbfC2Ac83374A"],
  ["GET", "/x402/v1/defillama/chains"],
  ["GET", "/x402/v1/defillama/protocols"],
  ["GET", "/x402/v1/defillama/protocol", null, "slug=aave"],
  ["GET", "/x402/v1/defillama/prices", null, "coins=ethereum"],
  ["GET", "/x402/v1/defillama/yields"],
  ["GET", "/x402/v1/crypto/list"],
  ["GET", "/x402/v1/crypto/price", null, "id=bitcoin"],
  ["GET", "/x402/v1/crypto/history", null, "id=bitcoin&days=1"],
  ["GET", "/x402/v1/fx/list"],
  ["GET", "/x402/v1/fx/price", null, "base=USD&quote=EUR"],
  ["GET", "/x402/v1/fx/history", null, "start=2026-08-01&end=2026-08-07"],
  ["POST", "/x402/v1/rpc/ethereum", { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }],
  ["POST", "/x402/v1/images/generations", { model: "gpt-image-1", prompt: "a red circle", size: "256x256" }],
  ["POST", "/x402/v1/images/image2image", { model: "gemini-2.5-flash-image", image_url: "https://i.ibb.co/x/red.png", prompt: "make it blue" }],
  ["POST", "/x402/v1/audio/speech", { model: "gemini-2.5-flash", input: "hello", voice: "alloy" }],
  ["POST", "/x402/v1/audio/transcriptions", { model: "whisper-1", audio_b64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgIAAAEAAAABAAgAIBgAAgAEAA==", mime: "audio/wav" }],
  ["POST", "/x402/v1/messages", { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "hi" }], max_tokens: 8 }],
  ["POST", "/x402/v1/videos/generations", { mode: "text-to-video", prompt: "a cat jumping", durationSeconds: 5 }],
  ["POST", "/x402/v1/search", { query: "base network" }],
  ["POST", "/x402/v1/search/contents", { ids: ["abc123"] }],
  ["POST", "/x402/v1/jobs", CHAT],
  ["POST", "/x402/v1/embeddings/batch", { model: "gemini-text-embedding-004", input: ["a", "b"] }],
  ["GET", "/x402/v1/data/news", null, "q=bitcoin&limit=1"],
  ["GET", "/x402/v1/data/eth/balance", null, "address=0xCed8a9ff73427302cD0F0F95892EbfC2Ac83374A"],
  ["GET", "/x402/v1/data/solana/balance", null, "address=So11111111111111111111111111111111111111112"],
  ["GET", "/x402/v1/data/defi/yields", null, "protocol=aave"],
  ["GET", "/x402/v1/data/gas", null, "chain=base"],
];

let pass = [], fail = [];
for (const [m, path, body, qs] of tests) {
  const url = B + path + (qs ? "?" + qs : "");
  const init = { method: m, headers: { "content-type": "application/json" } };
  if (body && m === "POST") init.body = JSON.stringify(body);
  try {
    const r = await pf(url, init);
    const t = (await r.text()).slice(0, 90).replace(/\n/g, " ");
    const ok = m === "GET" ? r.status === 200 : (r.status === 200 && !/error/i.test(t));
    (ok ? pass : fail).push(`${m} ${path} -> ${r.status} ${t}`);
  } catch (e) {
    fail.push(`${m} ${path} -> EXC ${(e && e.message||e).toString().slice(0,60)}`);
  }
}
console.log("=== PASS (" + pass.length + ") ==="); pass.forEach(l => console.log("  " + l));
console.log("=== NEEDS-LOOK (" + fail.length + ") ==="); fail.forEach(l => console.log("  " + l));
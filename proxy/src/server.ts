import express, { Request, Response } from "express";
import cors from "cors";
import { privateKeyToAccount } from "viem/accounts";
import type { Account } from "viem";
import { wrapFetchWithPayment } from "./pay";
import { loadOrCreateWallet, getUsdcBalance } from "./wallet";

export interface ProxyOptions {
  port?: number;
  upstream?: string;
  chain?: "base" | "baseSepolia";
  /** If set, forward Authorization: Bearer for the non-x402 /v1 routes. */
  apiKey?: string;
}

const DEFAULT_UPSTREAM = "https://api.cortexcloud.org";

/**
 * CortexCloud Proxy — local OpenAI-compatible server that auto-pays x402.
 *
 * Agents/clients point their OpenAI base_url at http://localhost:8402.
 * Any /v1/chat/completions (and /x402/v1/*) call is forwarded upstream with
 * x402 payment injected transparently. No API key required for x402 routes.
 */
export function createProxy(opts: ProxyOptions = {}) {
  const port = opts.port ?? 8402;
  const upstream = (opts.upstream ?? DEFAULT_UPSTREAM).replace(/\/$/, "");
  const chain = opts.chain ?? "base";
  const wallet = loadOrCreateWallet(chain);
  const account = privateKeyToAccount(wallet.privateKey);

  const pf = wrapFetchWithPayment(globalThis.fetch as typeof fetch, { account, chain });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "20mb" }));

  // Status / discovery for the local agent
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, wallet: wallet.address, upstream, mode: "x402-proxy" });
  });

  app.get("/v1/models", async (_req: Request, res: Response) => {
    try {
      const r = await pf(`${upstream}/v1/models`, { method: "GET" });
      const body = await r.text();
      res.status(r.status).set("content-type", "application/json").send(body);
    } catch (e: any) {
      res.status(502).json({ error: e?.message ?? "upstream error" });
    }
  });

  // Catch-all: proxy any OpenAI-compatible path to upstream, paying x402 when challenged.
  const proxyHandler = async (req: Request, res: Response) => {
    const target = `${upstream}${req.path}`;
    const headers: Record<string, string> = {};
    if (opts.apiKey && !req.path.startsWith("/x402/")) {
      headers["Authorization"] = `Bearer ${opts.apiKey}`;
    }
    const init: RequestInit = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = JSON.stringify(req.body);
      headers["content-type"] = "application/json";
    }
    try {
      const r = await pf(target, init);
      const buf = Buffer.from(await r.arrayBuffer());
      res.status(r.status);
      const ct = r.headers.get("content-type");
      if (ct) res.set("content-type", ct);
      res.send(buf);
    } catch (e: any) {
      res.status(502).json({ error: e?.message ?? "upstream error", note: "x402 payment may have failed — fund the wallet with USDC on Base." });
    }
  };

  app.all("/v1/*", proxyHandler);
  app.all("/x402/v1/*", proxyHandler);

  return {
    app,
    port,
    wallet,
    start: async () => {
      const bal = await getUsdcBalance(wallet.address, chain);
      console.log(`\nCortexCloud Proxy listening on http://localhost:${port}`);
      console.log(`  Upstream : ${upstream}`);
      console.log(`  Wallet   : ${wallet.address}`);
      console.log(`  USDC     : ${bal} (Base)`);
      if (Number(bal) < 0.01) {
        console.log(`  ⚠ Fund with a few dollars of USDC on Base to enable paid calls.`);
      }
      console.log(`  Point your OpenAI client base_url at http://localhost:${port}/v1\n`);
      app.listen(port);
    },
  };
}

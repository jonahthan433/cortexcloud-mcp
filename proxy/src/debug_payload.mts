// Debug: show exactly what payment payload the client builds for the new wallet.
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

const NEW_WALLET = "0x5a0353bc9c75b893a9b5735d3e79f1bd988ea143";
const key = process.env.EVM_PRIVATE_KEY!.replace(/^0x/, "");
const account = privateKeyToAccount("0x" + key);
const publicClient = createPublicClient({ chain: base, transport: http() });

const selector = (_v, accepts) => {
  console.log("SELECTOR sees accepts:", JSON.stringify(accepts.map(a => ({ payTo: a.payTo, amount: a.amount, scheme: a.scheme }))));
  const hit = accepts.find((a) => a.payTo?.toLowerCase() === NEW_WALLET.toLowerCase());
  console.log("SELECTOR chose:", hit ? hit.payTo : "NONE");
  if (!hit) throw new Error("New wallet not in challenge accepts");
  return hit;
};

// Intercept fetch FIRST so the client's wrapped fetch logs payment headers.
const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (url, init) => {
  let paymentHeader = null;
  const req = typeof url === "string" ? init : url;
  const hdrs = req?.headers;
  const allKeys = [];
  if (hdrs && hdrs.entries) {
    try {
      for (const [k, v] of hdrs.entries()) {
        allKeys.push(String(k));
        if (String(k).toLowerCase().includes("payment")) paymentHeader = v;
      }
    } catch (e) { allKeys.push("headers-read-failed:" + e.message); }
  }
  const shown = typeof url === "string" ? url : (url?.url ?? "Request");
  console.log("OUTGOING", String(shown).slice(0, 80), "| headers:", allKeys.join(","), "| hasPayment:", !!paymentHeader);
  if (paymentHeader) {
    try {
      const decoded = JSON.parse(Buffer.from(String(paymentHeader), "base64").toString());
      const auth = decoded?.payload?.authorization ?? {};
      console.log("PAYLOAD accepted.payTo:", decoded?.accepted?.payTo);
      console.log("PAYLOAD auth keys:", Object.keys(auth));
      console.log("PAYLOAD auth.sig len:", String(auth.signature ?? "").length, "| r/s/v:", !!(auth.r && auth.s), auth.v);
      console.log("PAYLOAD auth.from:", auth.from, "to:", auth.to);
    } catch (e) { console.log("payload decode failed:", e.message); }
  }
  return origFetch(url, init);
};

const client = new x402Client(selector);
registerExactEvmScheme(client, {
  signer: toClientEvmSigner(account, publicClient),
  networks: ["eip155:8453"],
  schemeOptions: { rpcUrl: base.rpcUrls.default.http[0] },
});
const pf = wrapFetchWithPayment(globalThis["fetch"], client);

const body = { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "hi" }], max_tokens: 8 };
const r = await pf("https://api.cortexcloud.org/x402/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
console.log("HTTP", r.status, (await r.text()).slice(0, 200));
process.exit(0);
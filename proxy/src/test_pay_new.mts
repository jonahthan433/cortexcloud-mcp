// Paid x402 test against the NEW wallet (0x5a03...ea143).
// Run: EVM_PRIVATE_KEY=... node dist/test_pay_new.js
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

// Selector forces payment to the new wallet regardless of challenge order.
const selector = (_v, accepts) => {
  const hit = accepts.find((a) => a.payTo?.toLowerCase() === NEW_WALLET.toLowerCase());
  if (!hit) throw new Error("New wallet not in challenge accepts: " + JSON.stringify(accepts.map(a => a.payTo)));
  return hit;
};

const client = new x402Client(selector);
registerExactEvmScheme(client, {
  signer: toClientEvmSigner(account, publicClient),
  networks: ["eip155:8453"],
  schemeOptions: { rpcUrl: base.rpcUrls.default.http[0] },
});
const pf = wrapFetchWithPayment(fetch, client);

const target = process.env.TARGET ?? "https://api.cortexcloud.org/x402/v1/chat/completions";
const body = { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "Reply with exactly: PAID-NEW-WALLET" }], max_tokens: 24 };
const r = await pf(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const text = await r.text();
console.log("HTTP", r.status);
console.log("BODY:", text.slice(0, 500));
process.exit(0);
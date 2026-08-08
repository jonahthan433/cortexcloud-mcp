import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

const account = privateKeyToAccount("0x" + process.env.EVM_PRIVATE_KEY!.replace(/^0x/, ""));
const publicClient = createPublicClient({ chain: base, transport: http() });
const client = new x402Client((_v, a) => a[0]);
registerExactEvmScheme(client, { signer: toClientEvmSigner(account, publicClient), networks: ["eip155:8453"], schemeOptions: { rpcUrl: base.rpcUrls.default.http[0] } });
const pf = wrapFetchWithPayment(fetch, client);

for (const addr of ["So11111111111111111111111111111111111111112",
                    "0xCed8a9ff73427302cD0F0F95892EbfC2Ac83374A"]) {
  const r = await pf("https://api.cortexcloud.org/x402/v1/data/solana/balance?address=" + addr, { method: "GET", headers: { "content-type": "application/json" } });
  console.log(addr.slice(0, 12) + "... ->", r.status, (await r.text()).slice(0, 80));
}
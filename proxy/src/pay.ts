import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { x402Client, wrapFetchWithPayment as wrapFetch } from "@x402/fetch";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

export interface PayConfig {
  /** Local viem account that will sign & pay USDC. */
  account: ReturnType<typeof privateKeyToAccount>;
  chain?: "base" | "baseSepolia";
  /** Per-request spending cap in USDC atomic units (6 decimals). */
  maxValue?: bigint;
}

/**
 * Build an x402-enabled fetch using the same @x402/fetch stack BlockRun uses.
 *
 * When the upstream (api.cortexcloud.org) responds 402, this signs & settles
 * USDC on Base automatically, then retries the request. That is what turns
 * each installed proxy into a self-funding buyer of CortexCloud resources.
 */
export function wrapFetchWithPayment(baseFetch: typeof fetch, cfg: PayConfig) {
  const chain = cfg.chain ?? "base";
  const selected = chain === "baseSepolia" ? baseSepolia : base;
  const publicClient = createPublicClient({ chain: selected, transport: http() });

  const client = new x402Client();
  registerExactEvmScheme(client, {
    signer: toClientEvmSigner(cfg.account, publicClient as any),
    networks: [`eip155:${selected.id}`],
    schemeOptions: { rpcUrl: selected.rpcUrls.default.http[0] },
  });

  return wrapFetch(baseFetch, client);
}

export { x402Client };

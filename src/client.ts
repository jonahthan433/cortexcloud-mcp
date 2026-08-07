import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

export const DEFAULT_BASE_URL = "https://api.cortexcloud.org";

let cachedFetch: typeof fetch | null = null;

/**
 * Build (and cache) an x402-enabled fetch that auto-handles 402 Payment
 * Required against CortexCloud. Lazily initialized so free tools can load
 * without a wallet key present.
 */
export function getPaidFetch(): typeof fetch {
  if (cachedFetch) return cachedFetch;
  const pk = process.env.CORTEXCLOUD_PRIVATE_KEY;
  if (!pk) {
    throw new Error(
      "CORTEXCLOUD_PRIVATE_KEY is required to call paid CortexCloud endpoints."
    );
  }
  const signer = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`
  );
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  cachedFetch = wrapFetchWithPayment(fetch, client) as typeof fetch;
  return cachedFetch;
}

export const CORTEXCLOUD_BASE_URL =
  process.env.CORTEXCLOUD_BASE_URL ?? DEFAULT_BASE_URL;

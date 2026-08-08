import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface CortexWallet {
  address: `0x${string}`;
  privateKey: `0x${string}`;
  chainId: number;
}

const SESSION_DIR = path.join(os.homedir(), ".cortexcloud");
const SESSION_FILE = path.join(SESSION_DIR, ".session");

/**
 * Load or create a self-custody wallet for x402 payments.
 * Mirrors BlockRun's model: wallet is auto-created locally on first run,
 * stored 0600, never leaves the machine. This wallet becomes a *buyer*
 * that pays CortexCloud's merchant per call.
 */
export function loadOrCreateWallet(chain: "base" | "baseSepolia" = "base"): CortexWallet {
  const selected = chain === "baseSepolia" ? baseSepolia : base;

  const envKey = process.env.CORTEX_WALLET_PRIVATE_KEY as `0x${string}` | undefined;

  let privateKey: `0x${string}`;
  if (envKey) {
    privateKey = envKey;
  } else if (fs.existsSync(SESSION_FILE)) {
    try {
      privateKey = fs.readFileSync(SESSION_FILE, "utf-8").trim() as `0x${string}`;
    } catch {
      privateKey = generatePrivateKey();
    }
  } else {
    privateKey = generatePrivateKey();
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, privateKey, { mode: 0o600 });
  }

  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey, chainId: selected.id };
}

/** Check USDC balance for a wallet on the chosen chain. */
export async function getUsdcBalance(address: `0x${string}`, chain: "base" | "baseSepolia" = "base"): Promise<string> {
  const selected = chain === "baseSepolia" ? baseSepolia : base;
  const client = createPublicClient({ chain: selected, transport: http() });
  const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
  try {
    const bal = (await client.readContract({
      address: USDC,
      abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
      functionName: "balanceOf",
      args: [address],
    } as any)) as bigint;
    return (Number(bal) / 1e6).toFixed(4);
  } catch {
    return "0.0000";
  }
}

export function publicClient(chain: "base" | "baseSepolia" = "base") {
  const selected = chain === "baseSepolia" ? baseSepolia : base;
  return createPublicClient({ chain: selected, transport: http() });
}

export type CortexPublicClient = ReturnType<typeof createPublicClient>;

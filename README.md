# @cortexcloud.org/mcp

MCP server for **CortexCloud** — pay-per-call on-chain data and intelligence for AI agents. Token, wallet, risk, whale, balance, NFT, transaction and cross-chain reads, settled in **USDC on Base** over [x402](https://x402.org). No API keys, no subscriptions, no signup.

## Two ways to connect

**1. Remote (recommended).** The hosted server speaks Streamable HTTP and is always current:

```json
{
  "mcpServers": {
    "cortexcloud": {
      "type": "http",
      "url": "https://api.cortexcloud.org/mcp"
    }
  }
}
```

**2. stdio bridge.** This package, for clients that can only launch a local process:

```json
{
  "mcpServers": {
    "cortexcloud": {
      "command": "npx",
      "args": ["-y", "@cortexcloud.org/mcp"]
    }
  }
}
```

The bridge is a transport adapter, not a second implementation: it forwards `tools/list` and `tools/call` to the hosted server, so tools, schemas and prices can never drift from the API.

## Tools

17 tools, served from the live registry:

- **Paid (15)** — `cortex_token_intel` ($0.030), `cortex_cross_chain_compare` ($0.040), `cortex_whale_alerts` ($0.030), `cortex_token_risk` ($0.020), `cortex_wallet_intel` ($0.006), and the $0.004 data routes: `cortex_token_price`, `cortex_token_balances`, `cortex_nft_ownership`, `cortex_tx_history`, `cortex_gas_oracle`, `cortex_block`, plus the batch tools `cortex_aggregate_balances`, `cortex_aggregate_nfts`, `cortex_aggregate_prices`, `cortex_aggregate_tx_history` (up to 20 items per call).
- **Free (2)** — `cortex_capabilities` (every route, chain and price) and `cortex_prices` (the price table).

The authoritative list is always `GET https://api.cortexcloud.org/v1/capabilities`, or `cortex_capabilities` over MCP.

## How payment works

A paid tool call without payment returns the x402 challenge **inside the tool result**: price, payee, asset, network, and the endpoint to call. Nothing is charged and no wallet is needed to read it.

To settle, the caller signs an EIP-3009 USDC authorization and replays the request with the `payment-signature` header. Over MCP the server relays that header to the API unchanged; it holds no funds and never signs. Over stdio, forward an existing signature with:

```bash
CORTEXCLOUD_PAYMENT_SIGNATURE=<base64 header> npx -y @cortexcloud.org/mcp
```

For a complete paid flow from code, use the REST reference client — `402 -> sign -> 200` in one file:

<https://api.cortexcloud.org/examples/paid_client.py>

## Env

| Variable | Default | Meaning |
|---|---|---|
| `CORTEXCLOUD_BASE` | `https://api.cortexcloud.org` | API base; the bridge connects to `<base>/mcp` |
| `CORTEXCLOUD_PAYMENT_SIGNATURE` | — | Optional x402 payment header forwarded on every call |

## Verified behaviour

- `initialize` advertises protocol `2025-06-18`; the upstream server reports version `0.5.0`.
- `tools/list` returns 17 tools.
- `cortex_capabilities` returns the live catalog with no payment.
- `cortex_token_price` without payment returns the 402 challenge, not an error.

## Links

- API + docs: <https://api.cortexcloud.org/docs>
- Discovery: [x402.json](https://api.cortexcloud.org/.well-known/x402.json) · [bazaar](https://api.cortexcloud.org/.well-known/bazaar) · [llms.txt](https://api.cortexcloud.org/llms.txt)
- Latency and prices: <https://api.cortexcloud.org/benchmarks.html>

MIT licensed.

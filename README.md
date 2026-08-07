# @cortexcloud/mcp

MCP server for the **CortexCloud API** — pay-per-call AI generation, data and RPC endpoints through the [x402](https://x402.org) protocol. No API keys, no subscriptions; every tool call is billed in **USDC on Base** and settles to the operator's wallet.

## Quick start (hosted)

No install required — point any MCP client at the public Streamable HTTP endpoint:

```
https://api.cortexcloud.org/mcp
```

Your MCP client handles the x402 payment handshake automatically; each call pays from the wallet your agent is authorized to spend.

## Running it yourself

### Streamable HTTP server (like the hosted one)

```bash
npm run build
EVM_PRIVATE_KEY=0x... node dist/http.js      # signs + pays calls; defaults to port 3200
# listening on http://localhost:3200/mcp
```

| Env | Default | Meaning |
|-----|---------|---------|
| `EVM_PRIVATE_KEY` | — | Wallet that signs + pays each x402 call. **Required.** |
| `PORT` | `3200` | HTTP listen port |
| `CORTEXCLOUD_URL` | `https://api.cortexcloud.org` | Upstream CortexCloud API base |
| `CORTEXCLOUD_PAYTO` | `"0x5a03…ea143"` | Wallet where call revenue settles |

### stdio (Claude Desktop / CLI)

```json
{
  "mcpServers": {
    "cortexcloud": {
      "command": "npx",
      "args": ["-y", "@cortexcloud/mcp"],
      "env": { "EVM_PRIVATE_KEY": "0x..." }
    }
  }
}
```

## Tools (22)

**AI** — `chat_completions` `responses` `embeddings` `models` `image_generation` `text_to_speech`
**Search & news** — `web_search` `search_contents` `news`
**Market/data** — `prices` `coins_search` `crypto_history` `fx_list` `fx_price` `defi_yields` `defi_protocols`
**Chain** — `base_balance` `base_token_balance` `eth_balance` `ethereum_rpc` `dex_search` `dex_pairs`

Schema for every tool is exposed via MCP's `tools/list` — no docs drift, what a client sees is what runs.

## How x402 works under the hood

Each call performs an x402 HTTP exchange against the CortexCloud API: request → payment challenge → signed `TransferWithAuthorization` → valid data. The SDK core handles the handshake; `@x402/evm` builds + signs the transfer; `@x402/fetch` drives the HTTP loop. Money in is trustless — cold settlement on-chain, no API-key storage, no subscriptions, no per-seat licensing.

## License

MIT
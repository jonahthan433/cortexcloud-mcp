# CortexCloud MCP — Registry Submission Card
server display name: CortexCloud MCP
repo:        https://github.com/jonahthan433/cortexcloud-mcp
npm:         @cortexcloud.org/mcp@0.2.0
hosted:      https://api.cortexcloud.org/mcp
transport:   Streamable HTTP (post | sse)
tools:       22
description: "Agent-native pay-per-call AI + on-chain data gateway via x402. Free sync handshake; each tool call bills a fee in USDC on Base from the caller wallet. No API keys, no subscriptions."
categories:  ai, data, blockchain, finance, search
tools list:
  chat_completions, responses, embeddings, models, image_generation, text_to_speech,
  web_search, search_contents, news, prices, coins_search, crypto_history, fx_list, fx_price,
  defi_yields, defi_protocols, base_balance, base_token_balance, eth_balance,
  ethereum_rpc, dex_search, dex_pairs
auth: none (x402 payment handshake per call)
icon: none yet (add later)
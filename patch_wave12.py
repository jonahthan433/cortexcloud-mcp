"""Deploy Wave 1 + Wave 2 x402 resources: pricing + router registration."""

# ---- 1) Patch pricing.py: add new route prices ----
PP = "/opt/CortexCloudAPI/app/x402/pricing.py"
src = open(PP, encoding="utf-8").read()
orig = src

NEW_PRICES = '''    # ---- Wave 1: Market data (keyless public upstreams) ----
    "GET /x402/v1/defillama/chains": "$0.001",
    "GET /x402/v1/defillama/protocols": "$0.001",
    "GET /x402/v1/defillama/protocol": "$0.001",
    "GET /x402/v1/defillama/prices": "$0.001",
    "GET /x402/v1/defillama/yields": "$0.001",
    "GET /x402/v1/crypto/list": "$0.001",
    "GET /x402/v1/crypto/price": "$0.001",
    "GET /x402/v1/crypto/history": "$0.002",
    "GET /x402/v1/fx/list": "$0.001",
    "GET /x402/v1/fx/price": "$0.001",
    "GET /x402/v1/fx/history": "$0.002",
    "POST /x402/v1/rpc/ethereum": "$0.001",
    # ---- Wave 2: AI modalities (provider keys) ----
    "POST /x402/v1/images/generations": "$0.04",
    "POST /x402/v1/images/image2image": "$0.04",
    "POST /x402/v1/audio/speech": "$0.015",
    "POST /x402/v1/audio/transcriptions": "$0.01",
    "POST /x402/v1/messages": "$0.005",
    "POST /x402/v1/videos/generations": "$0.20",
'''

anchor = '    "GET /x402/v1/data/dex/pairs": "$0.001",\n'
if "defillama/chains" not in src:
    src = src.replace(anchor, anchor + NEW_PRICES, 1)

# Descriptions
NEW_DESC = '''    "GET /x402/v1/defillama/protocols": "All DeFi protocols with TVL (DeFiLlama).",
    "GET /x402/v1/crypto/price": "Crypto spot price, 24h change and market cap.",
    "GET /x402/v1/fx/price": "Latest fiat FX rate (ECB data).",
    "POST /x402/v1/images/generations": "AI image generation (OpenAI) - pay per image in USDC.",
    "POST /x402/v1/audio/speech": "AI text-to-speech (OpenAI) - pay per call in USDC.",
    "POST /x402/v1/audio/transcriptions": "AI speech-to-text (Whisper) - pay per call in USDC.",
    "POST /x402/v1/messages": "Anthropic-native Messages API via CortexCloud.",
    "POST /x402/v1/videos/generations": "AI text-to-video (xAI) - pay per clip in USDC.",
'''
desc_anchor = '    "POST /x402/v1/embeddings": "OpenAI-compatible text embeddings via CortexCloud AI gateway.",\n'
if "defillama/protocols" not in src.split("ROUTE_DESCRIPTIONS", 1)[-1]:
    src = src.replace(desc_anchor, desc_anchor + NEW_DESC, 1)

open(PP, "w", encoding="utf-8").write(src)
print("pricing_patched:", src != orig)

# ---- 2) Register routers in main.py ----
MP = "/opt/CortexCloudAPI/app/main.py"
m = open(MP, encoding="utf-8").read()
morig = m

reg = '''
        from app.x402.market_routes import router as market_router
        app.include_router(market_router, prefix="/x402/v1", tags=["x402 Market Data"])

        from app.x402.media_routes import router as media_router
        app.include_router(media_router, prefix="/x402/v1", tags=["x402 AI Modalities"])
'''
onchain_anchor = '        app.include_router(onchain_router, prefix="/x402/v1", tags=["x402 On-Chain Base"])\n'
if "market_routes" not in m:
    m = m.replace(onchain_anchor, onchain_anchor + reg, 1)

open(MP, "w", encoding="utf-8").write(m)
print("main_patched:", m != morig)
print("has_market:", "market_routes" in m, "has_media:", "media_routes" in m)

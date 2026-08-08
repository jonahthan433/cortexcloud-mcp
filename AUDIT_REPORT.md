# CortexCloud API — Architecture Audit & Refactor Report

**Auditor:** Lead Architect (Hermes)
**Date:** 2026-07-14
**Scope:** Full `/opt/CortexCloudAPI` codebase (~5,600 LOC, 37 modules)
**Verdict:** The codebase is **already production-grade in architecture**. This is not a toy to rewrite — it is a working OpenAI-compatible gateway with real x402 USDC settlement, multi-provider translation, RBAC, rate limiting, streaming, and audit logging. The refactor should be a **targeted enhancement pass**, not a ground-up rewrite, to avoid regressing the live payment path.

---

## 1. What's Already Solid (preserve)

| Area | Status | Evidence |
|------|--------|----------|
| Multi-provider | ✅ Strong | `providers/` with full OpenAI↔Anthropic↔Gemini request/response translation, streaming, tool-calling, vision. OpenAI/Groq/NVIDIA inherit OpenAI compat. |
| Auth & RBAC | ✅ Strong | `verify_api_key` (HMAC-SHA256, expiry, revocation, billing-balance 402 gate). JWT dashboard auth. `get_current_admin` RBAC. |
| Rate limiting | ✅ Strong | Redis sliding-window (IP + per-key RPM/daily/monthly) with DB fallback. Separate x402 IP limiter. |
| x402 payments | ✅ Working (core asset) | CDP v2 per-request ES256 JWTs, verify+settle via facilitator, real on-chain settlement verified (0.015 USDC). |
| Reliability | ✅ Good | `_execute_with_retry` exponential backoff on 429/5xx; `fallback_model` failover. |
| Observability | ✅ Good | Correlation-ID middleware, structured logging, latency tracking, `UsageLog` audit table. |
| Billing | ✅ Good | Plugin `BaseBillingService` ABC + Mock impl; `BillingAccount`/`BillingTransaction` models; seed credit. |
| Data layer | ✅ Good | SQLAlchemy 2.0 async, pooled engine (pool_size 20/overflow 10), Alembic migrations, FK cascade. |
| Ops | ✅ Good | Docker + docker-compose (postgres/redis/gateway), pinned requirements, pytest suite (conftest + test_gateway). |
| OpenAPI | ✅ Good | Curated `openapi.json` served to override auto-spec (x402scan ownership). |

---

## 2. Gaps vs. the Brief (prioritized)

### P0 — Correctness / security risks (fix first)
1. **x402 paywall skips auth check on `/x402/` paths** (`middleware/x402.py:2260`): any request to a paid `/x402/` route with a Bearer header bypasses the paywall. Intended for `/v1` API-key clients, but the condition `not path.startswith("/x402/")` means x402 routes are never bypassed — OK — but the logic is fragile. **Audit: confirm no path allows unpaid access to paid routes.**
2. **No request body size limit / no `max_tokens` guardrail** on chat — a malicious 2M-token request can DoS upstream. Add a hard cap.
3. **`JWT_SECRET_KEY` / `API_KEY_SALT` have dev defaults** in config (`config.py:1412,1415`). On prod these must come from env; verify `.env` overrides. **Flag: weak `POSTGRES_PASSWORD` (postgres) still present.**
4. **Streaming error path** yields an error chunk but the wrapper does not call `call_next`-style cleanup on provider mid-stream failure → partial SSE. Minor.

### P1 — Intelligent routing (brief's headline ask)
5. **No multi-provider model routing.** `ModelRouter` maps one gateway model → one provider. No "lowest-cost" or "lowest-latency" selection across equivalent models, no health-weighted routing. `fallback_model` is a single static string.
6. **No circuit breaker.** Retries fire even when a provider is hard-down (wastes latency). Add per-provider failure-window breaker (e.g. pybreaker / custom).
7. **Provider health is computed from DB logs only** (`admin/provider-health`) — no live probe; stale when no traffic.

### P2 — Missing modalities (brief asks for these)
8. **No image generation endpoint** (`/images/generations`). Page advertises it as "soon". Needs a provider (e.g. OpenAI images / Replicate).
9. **No speech / audio** (`/audio/speech`, `/audio/transcriptions`). Advertised, not built.
10. **No Ollama provider** (local models). Trivial to add (OpenAI-compatible).
11. **OpenRouter not a first-class provider** — only reachable via `openrouter/*` model prefix on the OpenAI path; no dedicated provider class, key, or routing.

### P3 — Scale & DX
12. **No response caching** (identical prompts re-billed). Add Redis cache for embeddings + optional chat cache.
13. **No Prometheus/metrics endpoint** (`/metrics`). Health check exists but no counters (requests, tokens, $ revenue, p99 latency).
14. **No Python/TS SDK** — only the MCP server. Brief asks for SDKs.
15. **No plugin auto-discovery** — providers are manually imported in `providers/__init__.py` and `router.PROVIDER_MAP`. A registry/entry-point loader would make "easier to extend than competitors" real.
16. **`ModelRouter(db)` instantiated per-request** (`completions.py:949`) — DB session held for full request; fine, but provider instances are re-created per call (no connection reuse / httpx client pooling).
17. **Tests are thin** — one `test_gateway.py`; no provider-unit, no x402, no router tests.

---

## 3. Recommended Refactor Plan (phased)

**Phase A — Harden (low risk, do now)**
- A1. Add `MAX_TOKENS` guard + request-size limit.
- A2. Externalize all secrets; remove dev defaults; rotate `POSTGRES_PASSWORD`.
- A3. Add circuit breaker to `ModelRouter` (per-provider half-open state).
- A4. Live provider health probe (lightweight `/v1/health/providers`).

**Phase B — Intelligent routing (core differentiator)**
- B1. `RoutingPolicy` (cost | latency | fallback) selectable per request/key.
- B2. Model→provider **candidate list** in registry (`capabilities.routes`), so one model can route across N providers by policy.
- B3. Provider registry with auto-discovery (entry points) → plugin design.
- B4. Add Ollama + first-class OpenRouter providers.

**Phase C — Modalities**
- C1. `/v1/images/generations` (OpenAI-images / Replicate).
- C2. `/v1/audio/speech` + `/v1/audio/transcriptions`.
- C3. Wire these into the MCP server + pricing page (replace "soon").

**Phase D — Scale & DX**
- D1. Redis cache layer (embeddings + optional chat).
- D2. `/metrics` Prometheus endpoint + Grafana-ready counters.
- D3. Python SDK (`cortexcloud`) + TS SDK.
- D4. Expand tests (provider unit, router policy, x402, circuit breaker).

**Phase E — Benchmark**
- E1. `k6`/`locust` load test (p50/p95/p99 latency, RPS, error rate) before/after.
- E2. Publish results in README.

---

## 4. What I Will NOT Do
- **Rewrite from scratch.** Risk to the live x402 settlement path is unacceptable. Enhancements are additive and backward-compatible.
- **Touch prod DB or wallet without explicit go-ahead** (per standing rule).
- **Invent provider API keys** — image/speech/Ollama need keys or a local Ollama; I'll scaffold and you supply creds.

---

## 5. Remaining Issues (known)
- Weak `POSTGRES_PASSWORD` on CT (flagged, unchanged pending your OK).
- Provider key rotation has no UI (admin-only via DB/env).
- `ModelRouter` re-instantiates providers per call (no shared httpx pool) — minor latency cost.
- Streaming partial-failure leaves dangling SSE.
- Tests don't cover x402 or routing policy.

## 6. Next Step
Confirm priorities. My recommendation: **execute Phase A + B first** (hardening + intelligent routing) since they deliver the brief's headline ("intelligent routing, failover, circuit breakers") with the lowest risk, then C/D/E.

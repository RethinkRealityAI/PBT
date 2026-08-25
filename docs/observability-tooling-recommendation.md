# Observability tooling: Sentry vs PostHog vs build-our-own

**Date:** 2026-08-25 · **Status:** Recommendation (Phase 2 → Phase 3 planning input)

## TL;DR

**Adopt Sentry for error tracking only. Do not adopt PostHog. Keep the home-grown
analytics + AI-telemetry layer** (`nav_events` → Analytics screen, `ai_call_telemetry` →
Quality screen) as the system of record for product analytics.

The platform's real gap is the one thing we cannot reasonably build ourselves: exception
capture with source-mapped stack traces, release tracking, server-side alerting, and
on-error session replay. That is Sentry's core product. PostHog would mostly duplicate what
Phase 2 already delivered contractually — the in-platform, client-branded Analytics and
Quality dashboards — and its error-tracking product, while production-ready since ~2025, is
younger than Sentry's. At our scale both are effectively free.

## Comparison

| | Free tier (2026) | What it adds over our layer | Privacy / residency | Effort |
|---|---|---|---|---|
| **Sentry** | 5k errors/mo, 1 seat, 50 replays; Team ≈ $26/mo → 50k errors, unlimited seats | Exception capture w/ source maps, release health, alert rules, cron monitoring, on-error replay | US or EU (Frankfurt) region, chosen at org creation; server-side PII scrubbing; `sendDefaultPii: false` | Low — 2 SDKs + Vite plugin, ~1 day |
| **PostHog** | 1M events, 5k recordings, 100k exceptions/mo | Funnels, autocapture, recordings; newer error tracking | US/EU cloud; no Canadian region; autocapture sits badly with our data-minimization + opt-out model | Medium — and overlaps the contractual dashboards |
| **Extend DIY** | Supabase costs only | Nothing new without major work | Best PIPEDA / Quebec Law 25 story (data stays in our Supabase) | High ongoing — symbolication, alerting and replay are impractical to replicate |

Worth one line: **GlitchTip** (self-hosted, Sentry-SDK-compatible, errors only) is the
fallback if third-party SaaS is ever vetoed; Umami/Plausible are analytics-only and
redundant here.

## Keep vs delegate

- **Keep home-grown:** `nav_events` product analytics and `ai_call_telemetry` AI
  quality/cost tracking. They are contractual deliverables (SOW §3.2), client-facing and
  branded, and the privacy opt-out is already wired through them. Don't rebuild these in a
  third-party tool.
- **Delegate to Sentry:** JS exception capture (consumer + admin), Netlify function
  failures (including Gemini call exceptions), release tagging per deploy, alert rules,
  on-error replay.

## Integration sketch (when approved)

1. Create the Sentry org in the **EU (Frankfurt) region** (permanent choice — cleanest
   story for a UK client serving Canadian users); enable server-side data scrubbing.
2. SPA: `@sentry/react` with `sendDefaultPii: false`, `tracesSampleRate: 0.1`,
   `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`,
   `replayIntegration({ maskAllText: true, blockAllMedia: true })`; wrap the app in
   `Sentry.ErrorBoundary` with a bilingual fallback.
3. Source maps: `@sentry/vite-plugin` in the Netlify build (`SENTRY_AUTH_TOKEN` env);
   every deploy tags a release.
4. Functions: Netlify's Sentry integration (Lambda layer) across the serverless functions.
5. Send only: exception, release, screen name, anonymized user id — never email, name, or
   clinic. Error capture is operational data (distinct from the "training use" opt-out),
   but session replay stays behind consent.
6. Cost expectation: $0 now; ~$26/mo (Team) only if the client wants dashboard seats or
   error volume grows.

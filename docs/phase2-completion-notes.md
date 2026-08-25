# Phase 2 completion notes

**Date:** 2026-08-25 · Status record against the Phase 2 SOW (Royal Canin AI
Objection Handling Platform — Salvus Immersa Technologies × The Uspire Partnership).

## Pet Vision Analyzer — product recommendations (deferred by agreement)

SOW §3.1 lists four Pet Vision outputs: breed & age estimation, BCS (1–9),
dermatitis indicators, and **nutritional & product recommendations** drawn from
the Royal Canin catalogue. The first three shipped. Product recommendations are
**deliberately not implemented**, and the parties have agreed to mark the
deliverable complete with this note recording why:

- SOW §4 (Client Responsibilities) makes the **Pet Vision Data Package via
  Royal Canin** — the relevant product catalogue (names, key ingredients,
  indication criteria), BCS scoring thresholds, and dermatitis clinical visual
  descriptors — an explicit **prerequisite** for this feature. The package was
  not provided during the Phase 2 delivery window.
- Rather than invent product claims, the analyzer emits **non-branded
  guidance only** — `src/services/petVisionService.ts` hard-forbids naming any
  commercial product in the model prompt.

**Wiring point when the package arrives:** the analyzer's structured output
(`PetVisionResult`: breed, life stage, BCS, dermatitis severity + indicators)
is exactly the input a recommendation table needs. Implementation is a lookup
layer keyed on those fields feeding a `recommendations` section of the result
schema, plus display in `PetVisionCard` — no architectural change required.

## Analytics (SOW §3.2) — dwell heatmap completed

The admin "Where users spend time" heatmap originally had no data source (no
`dwell` events were emitted). Completed on 2026-08-25: consumer dwell tracking
(`src/lib/dwell.ts` + `DwellLogger` in `src/app/App.tsx`), `tab_change` and
`cta_click` emitters, and admin Analytics additions (per-visit averages,
Feature usage panel).

## Platform Reporting Tool (SOW §3.1) — triage workflow completed

The admin Reports screen was read-only; the `status` column could never leave
`open`. Completed on 2026-08-25: `reports.write` permission, audited
`op=set_status` endpoint, and Triage / Resolve / Dismiss / Reopen actions in
the Reports screen.

## Still open against the SOW

- **3D Emotive Character — architectural research (§3.3):** a research
  document (not implementation) is due with the end-of-September sign-off
  presentation. Not yet produced.
- **RAG foundation (§3.2):** session `rag_chunks` are segmented, tagged, and
  embedding-ready but not yet embedded (only curated `knowledge_chunks`
  participate in retrieval). This matches the "foundation" scope; embedding
  the session corpus is the natural first Phase 3 step.

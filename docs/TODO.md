# Clara — Fix-Right-Now List

Things to fix before investigating new work. Captured 2026-05-24.

---

## 1. WPM ranges ✅ DONE (2026-05-24, branch `overhaul`)

Re-tuned around "normal conversational pace ≈ 125 WPM" anchor. New values in [backend/app/manual_analytics.py:29-35](backend/app/manual_analytics.py#L29-L35):

| Tone | Old (code) | New |
|------|-----------|-----|
| professional | 90-130 | 100-135 |
| conversational | 100-140 | 100-140 |
| educational | 80-110 | 95-130 |
| persuasive | 100-140 | 110-150 |
| storytelling | 85-120 | 95-135 |

Tests updated to match. Pause thresholds left alone (didn't seem broken).

**Still open:** Validate against a real recording. The numbers are reasoned, not empirically tested. If they feel off, re-tune.

---

## 2. Docs ✅ DONE (2026-05-24, branch `overhaul`)

All 8 priority docs were refreshed in parallel:

- `docs/SERVICE_LLM.md` — full rewrite around OpenAI Chat Completions
- `docs/API_SPEC.md` — added `/audio` endpoint, `coaching_summary` in results, fixed WPM table, removed phantom `text: null`, added chat 400/500 errors
- `docs/DATA_SCHEMAS.md` — WPM table, `expected_duration_minutes` lower bound, removed phantom `text: null`
- `docs/PIPELINE.md` — added PDF extraction substep, coaching summary substep, fixed flag taxonomy + per-slide limits, OpenAI swap
- `docs/SERVICE_MANUAL.md` — new WPM table, documented edge cases and de-dup behavior
- `docs/FRONTEND_SPEC.md` — major rewrite: added ComparisonPage, ChatPanel, CoachingSummary, CoverageChecklist, PresentationTimeline, AudioPlayer; fixed Tone enum + feedback taxonomy + tech stack
- `docs/REPO_STRUCTURE.md` — regenerated file trees, fixed all version numbers, added Tailwind v4 + Motion + PyMuPDF
- `docs/ARCHITECTURE.md` — updated diagram with PDF + coaching branches, all 5 endpoints, OpenAI swap

`CLAUDE.md` also updated (Snowflake requirement → OpenAI).

---

## 3. Snowflake → OpenAI ✅ DONE (2026-05-24, branch `overhaul`)

Removed Snowflake Cortex entirely. All LLM calls (per-slide feedback, coaching summary, chat) now go through the OpenAI Chat Completions API via the `openai` SDK.

**Default model:** `gpt-5.4-mini` (configurable via `OPENAI_MODEL`).

**Files changed:**
- [backend/app/llm_feedback.py](backend/app/llm_feedback.py) — `_get_snowflake_connection` + `_call_cortex(_messages)` replaced with `_get_openai_client` + `_call_llm(_messages)`. JSON object mode used for per-slide feedback; plain text + custom parser for coaching; plain text for chat.
- [backend/app/config.py](backend/app/config.py) — dropped 5 `SNOWFLAKE_*` env vars and `CORTEX_MODEL`; added `OPENAI_MODEL`.
- [backend/.env.example](backend/.env.example) — same.
- [backend/requirements.txt](backend/requirements.txt) — removed `snowflake-connector-python`.
- [CLAUDE.md](CLAUDE.md) — Snowflake requirement rule flipped to OpenAI.
- [frontend/src/components/ChatPanel.tsx:498](frontend/src/components/ChatPanel.tsx#L498) — user-facing "via Snowflake Cortex" string updated.

Grep for `snowflake` or `cortex` across code/docs returns zero hits.

**Untested:** No live OpenAI call has been made against the new code (no API key in test env). The swap is structural — call shape matches OpenAI's `client.chat.completions.create` SDK. First real run is the integration test.

---

## 4. Reserved

Logan to add other right-now items as they come up.

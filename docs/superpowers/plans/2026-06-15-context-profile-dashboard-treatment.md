# Context Profile Dashboard Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend produce a five-axis user context profile and a dashboard treatment contract that the frontend uses to reshape explanations, card priority, checklists, and share summaries.

**Architecture:** `adaptive_questionnaire_agent.py` becomes the source of truth for the five-axis profile. `dashboard_agent` and `/analyze` expose `context_profile` and `dashboard_treatment`. Frontend view models consume those fields instead of reinterpreting scattered `domain_gaps`.

**Tech Stack:** Python FastAPI backend, existing dataclasses, TypeScript React frontend, Node view-model tests, pytest backend tests.

---

### Task 1: Backend Context Profile Contract

**Files:**
- Modify: `backend/adaptive_questionnaire_agent.py`
- Modify: `backend/state.py`
- Test: `backend/tests/test_adaptive_questionnaire_agent.py`

- [ ] Write tests asserting `context_profile` has five axes: `current_cashflow`, `retirement_readiness`, `product_understanding`, `decision_check_behavior`, `financial_confidence`.
- [ ] Verify the tests fail because only `persona_context` exists.
- [ ] Implement `build_context_profile(features, domain_gaps, answer_insights)`.
- [ ] Keep `persona_context` as a backwards-compatible alias.
- [ ] Run `pytest backend/tests/test_adaptive_questionnaire_agent.py`.

### Task 2: Backend Dashboard Treatment Contract

**Files:**
- Modify: `backend/adaptive_questionnaire_agent.py`
- Modify: `backend/server.py`
- Test: `backend/tests/test_adaptive_questionnaire_agent.py`
- Test: `backend/tests/test_api_views.py`

- [ ] Write tests asserting low financial confidence enables easy explanation and share summary.
- [ ] Write tests asserting low product understanding enables product condition cards.
- [ ] Implement `build_dashboard_treatment(context_profile, domain_gaps, answer_insights)`.
- [ ] Expose `context_profile` and `dashboard_treatment` in `/custom-questions` and `/analyze`.
- [ ] Run backend tests.

### Task 3: Frontend View Model Consumption

**Files:**
- Modify: `src/services/pensionAiAgent.ts`
- Modify: `src/services/pensionViewModels.ts`
- Modify: `src/components/Report.tsx`
- Test: `scripts/view-models.test.mjs`

- [ ] Write tests asserting `dashboard_treatment.sections.show_easy_explanation` controls easy explanation.
- [ ] Write tests asserting treatment reasons become the primary “분석에 영향을 준 주요 요인”.
- [ ] Add TypeScript response types for `context_profile` and `dashboard_treatment`.
- [ ] Update report/dashboard view models to consume treatment first and fallback to existing calculation rules.
- [ ] Run `npm run test:view-models`.

### Task 4: Verification

**Files:**
- No new files.

- [ ] Run `npm run test:view-models`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `/private/tmp/pension-backend-venv/bin/python -m pytest backend/tests`.

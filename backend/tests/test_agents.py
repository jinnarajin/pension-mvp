"""Unit tests for pure-Python agent nodes — no Claude API calls.

Covers: feature_change_detection, backend_data_mapping, cashflow_snapshot,
supervisor_agent_check, final_cashflow_calculation, update_user_state,
create_review_case, no_change_response.

Replaces the live Redis client with fakeredis so the suite runs offline.
"""

import dataclasses
import json
from unittest.mock import patch

import fakeredis
import pytest

import agents  # imports redis_client at module load — patched below
from mydata_schema import PERSONA_A


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    fake = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(agents, "redis_client", fake)
    return fake


@pytest.fixture
def mydata_raw():
    return json.loads(json.dumps(dataclasses.asdict(PERSONA_A)))


@pytest.fixture
def base_state(mydata_raw):
    return {
        "customer_id": "PA-0001",
        "query": "test",
        "mydata_raw": mydata_raw,
        "feature_change": None,
        "needs_reanalysis": True,
        "data_mapping": None,
        "cashflow_snapshot": None,
        "routing": None,
        "persona": None,
        "calculation": None,
        "dashboard": None,
        "guardrail": None,
        "final_response": None,
        "review_case": None,
        "user_state_updated": False,
        "error": None,
    }


# ── feature_change_detection ────────────────────────────────

def test_first_analysis_triggers_reanalysis(base_state):
    out = agents.feature_change_detection(base_state)
    assert out["needs_reanalysis"] is True
    assert out["feature_change"].has_change is True
    assert "최초 분석" in out["feature_change"].changed_fields


def test_no_change_skips_reanalysis(base_state, fake_redis):
    # feature_change_detection watches these four top-level keys on both
    # prev (Redis) and curr (mydata_raw); leave current_yield absent in both.
    prev = {
        "pension_balance": sum(p["current_value"] for p in base_state["mydata_raw"]["pensions"]),
        "irp_balance": next((p["current_value"] for p in base_state["mydata_raw"]["pensions"]
                             if p["pension_type"] == "IRP"), 0),
        "monthly_cashflow": base_state["mydata_raw"]["dashboard"]["monthly_cashflow_avg"],
    }
    fake_redis.set("user_state:PA-0001", json.dumps(prev), ex=86400)

    state = {**base_state, "mydata_raw": {**base_state["mydata_raw"],
                                          "pension_balance": prev["pension_balance"],
                                          "irp_balance": prev["irp_balance"],
                                          "monthly_cashflow": prev["monthly_cashflow"]}}
    out = agents.feature_change_detection(state)
    assert out["needs_reanalysis"] is False


# ── backend_data_mapping ────────────────────────────────────

def test_data_mapping_parses_persona_a(base_state):
    out = agents.backend_data_mapping(base_state)
    assert out.get("error") is None
    assert out["data_mapping"].parsed_ok is True
    assert out["data_mapping"].mydata.profile.customer_id == "PA-0001"


def test_data_mapping_handles_invalid_input(base_state):
    state = {**base_state, "mydata_raw": {"garbage": True}}
    out = agents.backend_data_mapping(state)
    assert out.get("error", "").startswith("[1]")


# ── cashflow_snapshot ───────────────────────────────────────

def test_cashflow_snapshot_aggregates_from_monthly(base_state):
    s1 = agents.backend_data_mapping(base_state)
    s2 = agents.cashflow_snapshot(s1)
    snap = s2["cashflow_snapshot"]
    assert snap.monthly_income == 5_622_666
    assert snap.monthly_expense == 4_333_333
    assert snap.monthly_cashflow == 1_289_333
    assert snap.liquid_assets == 92_340_000
    assert snap.extracted_features["private_pension_balance"] == 60_300_000
    assert snap.extracted_features["public_pension_contribution_total"] == 135_200_000
    assert snap.extracted_features["retirement_age"] == 60
    assert snap.extracted_features["service_years_at_retirement"] == 34
    assert snap.extracted_features["retirement_lump_sum_estimated"] == 157_080_000
    assert "switch_score" not in snap.extracted_features


# ── supervisor_agent_check ──────────────────────────────────

def test_supervisor_appends_anomalies_list(base_state):
    s = agents.cashflow_snapshot(agents.backend_data_mapping(base_state))
    out = agents.supervisor_agent_check(s)
    assert "supervisor_anomalies" in out["cashflow_snapshot"].extracted_features
    assert isinstance(out["cashflow_snapshot"].extracted_features["supervisor_anomalies"], list)


# ── final_cashflow_calculation ──────────────────────────────

def test_final_cashflow_returns_all_fields(base_state):
    s = agents.supervisor_agent_check(
        agents.cashflow_snapshot(agents.backend_data_mapping(base_state))
    )
    out = agents.final_cashflow_calculation(s)
    calc = out["calculation"]
    assert calc.shortfall_monthly >= 0
    assert calc.pension_replacement_rate >= 0


# ── update_user_state ───────────────────────────────────────

def test_update_user_state_writes_to_redis(base_state, fake_redis):
    # Need calc + persona + cashflow_snapshot populated
    from state import PersonaClassification
    s = agents.supervisor_agent_check(
        agents.cashflow_snapshot(agents.backend_data_mapping(base_state))
    )
    s = agents.final_cashflow_calculation(s)
    s = {**s, "persona": PersonaClassification(
        vulnerability_score=72, persona_label="은퇴임박 안정형",
        flags=["연금소득대체율 낮음"], needs_human_review=False, evidence={},
    )}
    out = agents.update_user_state(s)
    assert out["user_state_updated"] is True
    stored = json.loads(fake_redis.get("user_state:PA-0001"))
    assert stored["vulnerability_score"] == 72


# ── create_review_case ──────────────────────────────────────

def test_create_review_case_high_vulnerability(base_state):
    from state import PersonaClassification, CashflowCalculation
    state = {
        **base_state,
        "persona": PersonaClassification(
            vulnerability_score=85, persona_label="고위험",
            flags=["다중위험"], needs_human_review=True, evidence={},
        ),
        "calculation": CashflowCalculation(
            pension_replacement_rate=40, survival_months_at_retirement=10, survival_months_retire=5,
            income_gap_years=5, dsr_now=15, dsr_retire=25, portfolio_deviation=10,
            shortfall_monthly=500_000,
        ),
        "data_mapping": agents.backend_data_mapping(base_state)["data_mapping"],
    }
    out = agents.create_review_case(state)
    assert out["review_case"] is not None
    assert out["review_case"].priority == "긴급"


def test_create_review_case_skipped_when_safe(base_state):
    from state import PersonaClassification, CashflowCalculation
    state = {
        **base_state,
        "persona": PersonaClassification(
            vulnerability_score=30, persona_label="안전",
            flags=[], needs_human_review=False, evidence={},
        ),
        "calculation": CashflowCalculation(
            pension_replacement_rate=70, survival_months_at_retirement=20, survival_months_retire=18,
            income_gap_years=2, dsr_now=10, dsr_retire=12, portfolio_deviation=5,
            shortfall_monthly=0,
        ),
        "data_mapping": agents.backend_data_mapping(base_state)["data_mapping"],
    }
    out = agents.create_review_case(state)
    assert out.get("review_case") is None


# ── no_change_response ──────────────────────────────────────

def test_no_change_response_short_circuits(base_state):
    out = agents.no_change_response(base_state)
    assert out["user_state_updated"] is False
    assert "변화" in out["final_response"]

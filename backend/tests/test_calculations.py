"""Unit tests for calculations.calculate_all_metrics — pure Python, no LLM."""

import dataclasses

import pytest

from calculations import calculate_all_metrics
from mydata_schema import PERSONA_A, PERSONA_B, MyDataInput


EXPECTED_KEYS = {
    "rr_gap", "rr_full",
    "survival_months_now", "survival_months_retire",
    "income_gap_years",
    "dsr_now", "dsr_retire",
    "portfolio_deviation",
    "insurance_burden_retire",
    "pension_asset_ratio",
    "switch_score",
    "shortfall_monthly",
    "invest_risk_ratio",
}


@pytest.fixture(params=[PERSONA_A, PERSONA_B], ids=["persona_a", "persona_b"])
def metrics(request):
    return calculate_all_metrics(request.param), request.param


def test_returns_all_expected_keys(metrics):
    m, _ = metrics
    assert EXPECTED_KEYS.issubset(m.keys()), f"missing: {EXPECTED_KEYS - m.keys()}"


def test_rr_full_at_least_rr_gap(metrics):
    """rr_full includes 국민연금, rr_gap excludes it — full must be ≥ gap."""
    m, _ = metrics
    assert m["rr_full"] >= m["rr_gap"]


def test_switch_score_in_0_100(metrics):
    m, _ = metrics
    assert 0 <= m["switch_score"] <= 100


def test_shortfall_non_negative(metrics):
    m, _ = metrics
    assert m["shortfall_monthly"] >= 0


def test_survival_months_non_negative(metrics):
    m, _ = metrics
    assert m["survival_months_now"] >= 0
    assert m["survival_months_retire"] >= 0


def test_dsr_non_negative(metrics):
    m, _ = metrics
    assert m["dsr_now"] >= 0
    assert m["dsr_retire"] >= 0


def test_income_gap_years_non_negative(metrics):
    m, _ = metrics
    assert m["income_gap_years"] >= 0


def test_persona_a_has_income_gap():
    """57yo civil servant retires 2028, 국민연금 starts 2033 → 5-year gap."""
    m = calculate_all_metrics(PERSONA_A)
    assert m["income_gap_years"] == 5


def test_persona_b_no_gap_aggressive_portfolio():
    """35yo 공격형 should hold a stock-heavy portfolio."""
    m = calculate_all_metrics(PERSONA_B)
    assert m["invest_risk_ratio"] > 0


def test_from_dict_roundtrip_preserves_metrics():
    """MyDataInput.from_dict(asdict(x)) must produce identical metrics."""
    raw = dataclasses.asdict(PERSONA_A)
    rebuilt = MyDataInput.from_dict(raw)
    assert calculate_all_metrics(rebuilt) == calculate_all_metrics(PERSONA_A)

"""Unit tests for calculations.calculate_all_metrics — pure Python, no LLM."""

import dataclasses

import pytest

from calculations import calculate_all_metrics
from mydata_schema import PERSONA_A, PERSONA_B, MyDataInput


EXPECTED_KEYS = {
    "age", "region", "household_size", "employment_status",
    "monthly_income_total", "salary_income_monthly",
    "non_recurring_income_monthly", "pension_income_current",
    "financial_income_monthly", "spouse_income_monthly",
    "other_income_monthly",
    "monthly_expense_total", "essential_expense_monthly",
    "insurance_premium_monthly", "loan_repayment_monthly",
    "net_cashflow_monthly",
    "deposit_balance_total", "investment_balance_total",
    "real_estate_value_estimated", "total_asset_estimated",
    "liquid_asset_total",
    "loan_balance_total", "monthly_repayment_total",
    "debt_service_ratio",
    "public_pension_contribution_total", "private_pension_balance",
    "retirement_age", "years_until_retirement", "service_years_current",
    "service_years_at_retirement", "birth_year",
    "retirement_lump_sum_estimated", "retirement_liquid_asset_total",
    "private_pension_monthly", "public_pension_monthly",
    "occupational_public_pension_monthly", "estimated_national_pension_monthly",
    "estimated_national_pension_contribution_years",
    "national_pension_start_age", "public_pension_start_age",
    "pension_start_adjustment_options", "post_retire_expense_monthly",
    "gap_period_shortfall_monthly",
    "PensionReplacementRate", "pension_replacement_rate",
    "survival_months_at_retirement", "survival_months_retire",
    "income_gap_years",
    "dsr_now", "dsr_retire",
    "portfolio_deviation",
    "insurance_burden_retire",
    "pension_asset_ratio",
    "shortfall_monthly",
    "invest_risk_ratio",
}


@pytest.fixture(params=[PERSONA_A, PERSONA_B], ids=["persona_a", "persona_b"])
def metrics(request):
    return calculate_all_metrics(request.param), request.param


def test_returns_all_expected_keys(metrics):
    m, _ = metrics
    assert EXPECTED_KEYS.issubset(m.keys()), f"missing: {EXPECTED_KEYS - m.keys()}"


def test_persona_a_cashflow_snapshot_matches_raw_mydata_feature_set():
    m = calculate_all_metrics(PERSONA_A)
    assert m["age"] == 57
    assert m["region"] == "전라북도 전주시 완산구"
    assert m["household_size"] == 2
    assert m["employment_status"] == "재직"
    assert m["monthly_income_total"] == 5_622_666
    assert m["salary_income_monthly"] == 4_620_000
    assert m["spouse_income_monthly"] == 721_666
    assert m["non_recurring_income_monthly"] == 129_166
    assert m["financial_income_monthly"] == 151_833
    assert m["monthly_expense_total"] == 4_333_333
    assert m["essential_expense_monthly"] == 2_953_333
    assert m["insurance_premium_monthly"] == 397_000
    assert m["loan_repayment_monthly"] == 983_000
    assert m["net_cashflow_monthly"] == 1_289_333
    assert m["deposit_balance_total"] == 92_340_000
    assert m["investment_balance_total"] == 23_905_000
    assert m["real_estate_value_estimated"] == 285_000_000
    assert m["loan_balance_total"] == 40_800_000
    assert m["monthly_repayment_total"] == 983_000
    assert m["public_pension_contribution_total"] == 135_200_000
    assert m["private_pension_balance"] == 60_300_000
    assert m["retirement_age"] == 60
    assert m["years_until_retirement"] == 3
    assert m["service_years_current"] == 31
    assert m["service_years_at_retirement"] == 34
    assert m["birth_year"] == 1969
    assert m["retirement_lump_sum_estimated"] == 157_080_000
    assert m["total_asset_estimated"] == 618_625_000
    assert m["liquid_asset_total"] == 92_340_000
    assert m["retirement_liquid_asset_total"] == 249_420_000
    assert m["national_pension_start_age"] == 65
    assert m["public_pension_start_age"] == 61
    assert m["estimated_national_pension_monthly"] == 0
    assert m["occupational_public_pension_monthly"] == 1_850_000
    assert m["public_pension_monthly"] == 1_850_000
    assert m["private_pension_monthly"] == 400_000
    assert m["PensionReplacementRate"] == pytest.approx(40.0, abs=0.1)
    assert m["pension_replacement_rate"] == pytest.approx(40.0, abs=0.1)
    assert m["debt_service_ratio"] == pytest.approx(0.1748, abs=0.0001)


def test_pension_replacement_rate_non_negative(metrics):
    m, _ = metrics
    assert m["PensionReplacementRate"] >= 0
    assert m["pension_replacement_rate"] >= 0


def test_shortfall_non_negative(metrics):
    m, _ = metrics
    assert m["shortfall_monthly"] >= 0


def test_survival_months_non_negative(metrics):
    m, _ = metrics
    assert m["survival_months_at_retirement"] >= 0
    assert m["survival_months_retire"] >= 0


def test_dsr_non_negative(metrics):
    m, _ = metrics
    assert m["dsr_now"] >= 0
    assert m["dsr_retire"] >= 0


def test_income_gap_years_non_negative(metrics):
    m, _ = metrics
    assert m["income_gap_years"] >= 0


def test_persona_a_income_gap_uses_age_based_retirement():
    """57yo civil servant retires at age 60; 공무원연금 starts at age 61."""
    m = calculate_all_metrics(PERSONA_A)
    assert m["income_gap_years"] == 1


def test_persona_b_no_gap_aggressive_portfolio():
    """35yo 공격형 should hold a stock-heavy portfolio."""
    m = calculate_all_metrics(PERSONA_B)
    assert m["invest_risk_ratio"] > 0


def test_from_dict_roundtrip_preserves_metrics():
    """MyDataInput.from_dict(asdict(x)) must produce identical metrics."""
    raw = dataclasses.asdict(PERSONA_A)
    rebuilt = MyDataInput.from_dict(raw)
    assert calculate_all_metrics(rebuilt) == calculate_all_metrics(PERSONA_A)

"""
scenario_tools.py — pension receipt scenario calculation tools.

These functions are intentionally deterministic. The LLM/agent chooses which
scenarios to compare, but the numeric results come from these tool functions.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from mydata_schema import MyDataInput


INCOME_TAX_BRACKETS = [
    (14_000_000, 0.06, 0),
    (50_000_000, 0.15, 1_260_000),
    (88_000_000, 0.24, 5_760_000),
    (150_000_000, 0.35, 15_440_000),
    (300_000_000, 0.38, 19_940_000),
    (500_000_000, 0.40, 25_940_000),
    (1_000_000_000, 0.42, 35_940_000),
    (None, 0.45, 65_940_000),
]

CIVIL_SERVANT_ALLOWANCE_RATE_TABLE = [
    (1, 5, 0.065),
    (5, 10, 0.2275),
    (10, 15, 0.2925),
    (15, 20, 0.325),
    (20, None, 0.39),
]


def _civil_servant_allowance_rate(service_years: int) -> float:
    for min_years, max_years, rate in CIVIL_SERVANT_ALLOWANCE_RATE_TABLE:
        if service_years >= min_years and (max_years is None or service_years < max_years):
            return rate
    return 0


def _progressive_income_tax(tax_base: float) -> int:
    if tax_base <= 0:
        return 0
    for ceiling, rate, deduction in INCOME_TAX_BRACKETS:
        if ceiling is None or tax_base <= ceiling:
            income_tax = max(0, tax_base * rate - deduction)
            return int(round(income_tax * 1.1))  # local income tax included
    return 0


def _service_year_deduction(service_years: int) -> int:
    if service_years <= 0:
        return 0
    if service_years <= 5:
        return service_years * 1_000_000
    if service_years <= 10:
        return 5_000_000 + (service_years - 5) * 2_000_000
    if service_years <= 20:
        return 15_000_000 + (service_years - 10) * 2_500_000
    return 40_000_000 + (service_years - 20) * 3_000_000


def _converted_salary_deduction(converted_salary: float) -> float:
    if converted_salary <= 8_000_000:
        return converted_salary
    if converted_salary <= 70_000_000:
        return 8_000_000 + (converted_salary - 8_000_000) * 0.60
    if converted_salary <= 100_000_000:
        return 45_200_000 + (converted_salary - 70_000_000) * 0.55
    if converted_salary <= 300_000_000:
        return 61_700_000 + (converted_salary - 100_000_000) * 0.45
    return 151_700_000 + (converted_salary - 300_000_000) * 0.35


def estimate_retirement_income_tax(retirement_income: int, service_years: int) -> int:
    """Estimate retirement income tax for a lump-sum retirement payout."""
    if retirement_income <= 0 or service_years <= 0:
        return 0
    taxable_retirement_income = max(0, retirement_income - _service_year_deduction(service_years))
    converted_salary = taxable_retirement_income / service_years * 12
    tax_base = max(0, converted_salary - _converted_salary_deduction(converted_salary))
    return int(round(_progressive_income_tax(tax_base) / 12 * service_years))


def _annuity_monthly_payment(principal: int, payout_years: int, annual_return_rate: float) -> int:
    months = max(1, payout_years * 12)
    monthly_rate = annual_return_rate / 12
    if principal <= 0:
        return 0
    if monthly_rate <= 0:
        return principal // months
    payment = principal * monthly_rate / (1 - (1 + monthly_rate) ** -months)
    return int(round(payment))


def _scenario_expense(features: dict[str, Any], target_monthly_expense: int | None) -> int:
    return int(target_monthly_expense or features.get("post_retire_expense_monthly", 0) or features.get("monthly_expense_total", 0))


def _survival_months(liquidity: int, monthly_deficit: int) -> float:
    if monthly_deficit <= 0:
        return 99.0
    return round(liquidity / monthly_deficit, 1)


def _has_irp_account(data: MyDataInput) -> bool:
    return any(pension.pension_type == "IRP" for pension in data.pensions)


def _features_for_scenario_retirement_age(features: dict[str, Any], retirement_age: int | None) -> dict[str, Any]:
    if not retirement_age:
        return dict(features)

    scenario_features = dict(features)
    current_age = int(features.get("age", 0))
    service_current = int(features.get("service_years_current", 0))
    salary = int(features.get("salary_income_monthly", 0))
    years_until = max(0, retirement_age - current_age)
    service_years = service_current + years_until
    payout_type = features.get("retirement_lump_sum_type", "")

    if payout_type == "civil_servant_retirement_allowance":
        payout_rate = _civil_servant_allowance_rate(service_years)
        payout = int(salary * service_years * payout_rate)
    elif payout_type == "excluded_retirement_pension_double_count":
        payout_rate = 0
        payout = 0
    else:
        payout_rate = 1
        payout = salary * service_years

    public_start_age = int(features.get("public_pension_start_age", 65))
    scenario_features.update({
        "retirement_age": retirement_age,
        "years_until_retirement": years_until,
        "service_years_at_retirement": service_years,
        "retirement_lump_sum_rate": payout_rate,
        "retirement_lump_sum_estimated": payout,
        "retirement_liquid_asset_total": int(features.get("liquid_asset_total", 0)) + payout,
        "retirement_accessible_asset_total": int(features.get("liquid_asset_total", 0)) + payout + int(features.get("semi_liquid_asset_total", 0)),
        "income_gap_months": max(0, public_start_age - retirement_age) * 12,
        "income_gap_years": round(max(0, public_start_age - retirement_age), 1),
    })
    return scenario_features


def calculate_lump_sum_receipt(
    data: MyDataInput,
    features: dict[str, Any],
    target_monthly_expense: int | None = None,
) -> dict[str, Any]:
    gross_lump_sum = int(features.get("retirement_lump_sum_estimated", 0))
    service_years = int(features.get("service_years_at_retirement", 0))
    estimated_tax = estimate_retirement_income_tax(gross_lump_sum, service_years)
    after_tax_lump_sum = max(0, gross_lump_sum - estimated_tax)
    expense = _scenario_expense(features, target_monthly_expense)
    private_pension = int(features.get("private_pension_monthly", 0))
    public_pension = int(features.get("public_pension_monthly", 0))
    initial_liquidity = int(features.get("liquid_asset_total", 0)) + after_tax_lump_sum
    gap_deficit = max(0, expense - private_pension)
    full_deficit = max(0, expense - private_pension - public_pension)

    return {
        "scenario_id": "lump_sum",
        "title": "퇴직금/퇴직수당 일시금 수령",
        "receipt_method": "lump_sum",
        "gross_retirement_payout": gross_lump_sum,
        "estimated_tax_total": estimated_tax,
        "after_tax_retirement_payout": after_tax_lump_sum,
        "monthly_pension_from_retirement_money": 0,
        "monthly_tax_saving_vs_lump_sum": 0,
        "total_tax_saving_vs_lump_sum": 0,
        "initial_liquidity": initial_liquidity,
        "survival_months_gap": _survival_months(initial_liquidity, gap_deficit),
        "survival_months_full": _survival_months(initial_liquidity, full_deficit),
        "gap_period_shortfall_monthly": gap_deficit,
        "full_period_shortfall_monthly": full_deficit,
        "tax_advisory": [
            "퇴직금/퇴직수당을 일시금으로 받으면 퇴직소득세가 먼저 반영되어 초기 유동성이 정해집니다.",
            "초기 현금은 커지지만 장기 월 현금흐름 보강 효과는 제한적입니다.",
        ],
        "risk_flags": ["초기 유동성 우수", "장기 소득화 효과 낮음"],
        "assumptions": {
            "tax_model": "퇴직소득세 간이 추정",
            "target_monthly_expense": expense,
        },
    }


def calculate_irp_annuity_receipt(
    data: MyDataInput,
    features: dict[str, Any],
    payout_years: int,
    target_monthly_expense: int | None = None,
    annual_return_rate: float = 0.02,
    lump_sum_tax_baseline: int | None = None,
) -> dict[str, Any]:
    gross_lump_sum = int(features.get("retirement_lump_sum_estimated", 0))
    service_years = int(features.get("service_years_at_retirement", 0))
    lump_sum_tax = estimate_retirement_income_tax(gross_lump_sum, service_years) if lump_sum_tax_baseline is None else lump_sum_tax_baseline
    tax_factor = 0.70 if payout_years <= 10 else 0.60
    estimated_tax_total = int(round(lump_sum_tax * tax_factor))
    total_tax_saving = max(0, lump_sum_tax - estimated_tax_total)
    months = max(1, payout_years * 12)
    gross_monthly_payment = _annuity_monthly_payment(gross_lump_sum, payout_years, annual_return_rate)
    monthly_tax = estimated_tax_total // months
    net_monthly_payment = max(0, gross_monthly_payment - monthly_tax)
    monthly_tax_saving = total_tax_saving // months

    expense = _scenario_expense(features, target_monthly_expense)
    private_pension = int(features.get("private_pension_monthly", 0))
    public_pension = int(features.get("public_pension_monthly", 0))
    initial_liquidity = int(features.get("liquid_asset_total", 0))
    gap_deficit = max(0, expense - private_pension - net_monthly_payment)
    full_deficit = max(0, expense - private_pension - public_pension - net_monthly_payment)
    has_irp = _has_irp_account(data)

    tax_advisory = [
        f"IRP 이전 후 {payout_years}년 연금 수령 가정에서는 퇴직소득세 부담이 일시금 대비 완화될 수 있습니다.",
        "실제 절세액은 퇴직소득세 확정액, IRP 상품, 수령연차, 중도인출 여부에 따라 달라집니다.",
    ]
    if has_irp:
        tax_advisory.append("이미 IRP가 있으므로 기존 IRP와 퇴직금 이전분을 구분해서 관리하는 설명이 필요합니다.")
    else:
        tax_advisory.append("IRP가 없다면 계좌 개설 후 퇴직급여 이전을 전제로 한 시나리오입니다.")

    return {
        "scenario_id": f"irp_{payout_years}y",
        "title": f"IRP 이전 후 {payout_years}년 연금 수령",
        "receipt_method": "irp_annuity",
        "payout_years": payout_years,
        "has_existing_irp": has_irp,
        "gross_retirement_payout": gross_lump_sum,
        "estimated_tax_total": estimated_tax_total,
        "after_tax_retirement_payout": max(0, gross_lump_sum - estimated_tax_total),
        "monthly_pension_from_retirement_money": net_monthly_payment,
        "monthly_tax_saving_vs_lump_sum": monthly_tax_saving,
        "total_tax_saving_vs_lump_sum": total_tax_saving,
        "initial_liquidity": initial_liquidity,
        "survival_months_gap": _survival_months(initial_liquidity, gap_deficit),
        "survival_months_full": _survival_months(initial_liquidity, full_deficit),
        "gap_period_shortfall_monthly": gap_deficit,
        "full_period_shortfall_monthly": full_deficit,
        "tax_advisory": tax_advisory,
        "risk_flags": [
            "초기 유동성 낮음" if initial_liquidity < int(features.get("retirement_liquid_asset_total", 0)) else "초기 유동성 양호",
            "월 현금흐름 보강",
        ],
        "assumptions": {
            "tax_model": "이연퇴직소득 연금수령 70/60% 간이 적용",
            "annual_return_rate": annual_return_rate,
            "target_monthly_expense": expense,
        },
    }


def build_pension_receipt_scenarios(
    data: MyDataInput,
    features: dict[str, Any],
    target_monthly_expense: int | None = None,
    retirement_age: int | None = None,
) -> dict[str, Any]:
    """Run first-pass receipt-method scenarios and pick a recommendation."""
    scenario_features = _features_for_scenario_retirement_age(features, retirement_age)
    lump = calculate_lump_sum_receipt(data, scenario_features, target_monthly_expense)
    scenarios = [
        lump,
        calculate_irp_annuity_receipt(data, scenario_features, 10, target_monthly_expense, lump_sum_tax_baseline=lump["estimated_tax_total"]),
        calculate_irp_annuity_receipt(data, scenario_features, 15, target_monthly_expense, lump_sum_tax_baseline=lump["estimated_tax_total"]),
        calculate_irp_annuity_receipt(data, scenario_features, 20, target_monthly_expense, lump_sum_tax_baseline=lump["estimated_tax_total"]),
    ]

    def score(scenario: dict[str, Any]) -> float:
        runway_score = min(60, scenario["survival_months_gap"]) * 1.5
        cashflow_score = max(0, 3_000_000 - scenario["gap_period_shortfall_monthly"]) / 100_000
        tax_score = scenario["total_tax_saving_vs_lump_sum"] / 1_000_000
        liquidity_penalty = 15 if scenario["initial_liquidity"] < int(features.get("liquid_asset_total", 0)) else 0
        return runway_score + cashflow_score + tax_score - liquidity_penalty

    ranked = sorted(scenarios, key=score, reverse=True)
    recommended = ranked[0]
    return {
        "target_monthly_expense": _scenario_expense(features, target_monthly_expense),
        "retirement_age": retirement_age or scenario_features.get("retirement_age", 60),
        "scenarios": scenarios,
        "recommended_scenario_id": recommended["scenario_id"],
        "recommendation_reason": (
            "소득 공백기 생존여력, 월 부족액, IRP 이전 시 세금 완화 가능성을 함께 본 결과 "
            f"`{recommended['title']}` 시나리오가 가장 균형적입니다."
        ),
        "tool_trace": [
            {"tool": "calculate_lump_sum_receipt", "scenario_id": "lump_sum"},
            {"tool": "calculate_irp_annuity_receipt", "scenario_id": "irp_10y"},
            {"tool": "calculate_irp_annuity_receipt", "scenario_id": "irp_15y"},
            {"tool": "calculate_irp_annuity_receipt", "scenario_id": "irp_20y"},
        ],
        "source_profile": asdict(data.profile),
    }

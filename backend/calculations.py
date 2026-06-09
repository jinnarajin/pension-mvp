"""
calculations.py — 계산 엔진 (순수 Python, LLM 불필요)
cashflow_snapshot 노드에서 호출됩니다.
Image 2의 [2] Feature Extractor + [5] Final Cashflow Calculation 수식 구현.
"""

from __future__ import annotations
from mydata_schema import MyDataInput


RETIREMENT_AGE = 60

NATIONAL_PENSION_START_AGE_BY_BIRTH_YEAR = [
    (1952, 60),
    (1956, 61),
    (1960, 62),
    (1964, 63),
    (1968, 64),
]

NATIONAL_PENSION_MONTHLY_TABLE = {
    10: {2_000_000: 180_000, 4_000_000: 270_000, 6_000_000: 330_000},
    20: {2_000_000: 370_000, 4_000_000: 550_000, 6_000_000: 680_000},
    30: {2_000_000: 560_000, 4_000_000: 840_000, 6_000_000: 1_030_000},
    40: {2_000_000: 740_000, 4_000_000: 1_130_000, 6_000_000: 1_380_000},
}

PENSION_START_ADJUSTMENT_GUIDE = {
    "early_5_years": -0.30,
    "normal": 0.0,
    "delay_per_year": 0.072,
    "delay_5_years": 0.36,
}


def _avg(items: list[int]) -> int:
    return sum(items) // len(items) if items else 0


def _monthly_average(data: MyDataInput, field_name: str, fallback_field: str | None = None) -> int:
    values = [getattr(summary, field_name, 0) or 0 for summary in data.monthly_summaries]
    if any(values):
        return _avg(values)
    if fallback_field:
        return _avg([getattr(summary, fallback_field, 0) or 0 for summary in data.monthly_summaries])
    return 0


def _asset_amount(data: MyDataInput, keywords: tuple[str, ...]) -> int:
    return sum(
        item.amount for item in data.assets_liabilities
        if item.category == "자산" and any(keyword in item.item for keyword in keywords)
    )


def _birth_year(data: MyDataInput) -> int:
    if data.profile.birth_date:
        return int(data.profile.birth_date[:4])
    if data.profile.age_reference_date:
        return int(data.profile.age_reference_date[:4]) - data.profile.age
    return 0


def _national_pension_start_age(birth_year: int) -> int:
    if birth_year <= 0:
        return 65
    for max_birth_year, start_age in NATIONAL_PENSION_START_AGE_BY_BIRTH_YEAR:
        if birth_year <= max_birth_year:
            return start_age
    return 65


def _interpolate(x: float, x1: float, x2: float, y1: float, y2: float) -> float:
    if x1 == x2:
        return y1
    ratio = (x - x1) / (x2 - x1)
    return y1 + (y2 - y1) * ratio


def _bounded_pair(value: int, anchors: list[int]) -> tuple[int, int]:
    if value <= anchors[0]:
        return anchors[0], anchors[0]
    if value >= anchors[-1]:
        return anchors[-1], anchors[-1]
    for left, right in zip(anchors, anchors[1:]):
        if left <= value <= right:
            return left, right
    return anchors[-1], anchors[-1]


def _estimate_national_pension_monthly(monthly_income_total: int, contribution_years: int) -> int:
    years_anchors = sorted(NATIONAL_PENSION_MONTHLY_TABLE)
    income_anchors = sorted(next(iter(NATIONAL_PENSION_MONTHLY_TABLE.values())))
    y1, y2 = _bounded_pair(contribution_years, years_anchors)
    i1, i2 = _bounded_pair(monthly_income_total, income_anchors)

    def value_at_year(year: int) -> float:
        row = NATIONAL_PENSION_MONTHLY_TABLE[year]
        return _interpolate(monthly_income_total, i1, i2, row[i1], row[i2])

    estimated = _interpolate(contribution_years, y1, y2, value_at_year(y1), value_at_year(y2))
    return int(round(estimated))


def _has_occupational_public_pension(data: MyDataInput) -> bool:
    return any(
        pension.expected_monthly > 0
        and (
            pension.scheme_group == "public_occupational"
            or pension.pension_type in ("공무원연금", "군인연금", "사학연금")
        )
        for pension in data.pensions
    )


def _service_years_current(data: MyDataInput) -> int:
    if data.profile.service_years_current > 0:
        return data.profile.service_years_current
    return max(0, data.profile.age - 27)


def calculate_all_metrics(data: MyDataInput) -> dict:
    """
    마이데이터 전체에서 8개 재무 지표를 산출합니다.

    Returns:
        {
          survival_months_at_retirement,        # 60세 은퇴 직후 생존 여력
          survival_months_retire,              # 은퇴 후 생존 여력
          income_gap_years,                    # 소득 공백기
          dsr_now, dsr_retire,                 # DSR 재직 중 / 은퇴 후
          portfolio_deviation,                 # 포트폴리오 괴리도
          insurance_burden_retire,             # 보험료 은퇴 후 부담률
          pension_asset_ratio,                 # 연금자산 집중도
          shortfall_monthly,                   # 월 부족액
          invest_risk_ratio,                   # 고위험 투자 비중
        }
    """
    p = data.profile
    db = data.dashboard
    pen = data.pensions
    inv = data.investments
    loans = data.loans
    ins = data.insurances

    salary_income_monthly = _monthly_average(data, "salary_income")
    non_recurring_income_monthly = _monthly_average(data, "non_recurring_income")
    pension_income_current = _monthly_average(data, "current_pension_income")
    financial_income_monthly = _monthly_average(data, "financial_income")
    spouse_income_monthly = _monthly_average(data, "spouse_income")
    other_income_monthly = _monthly_average(data, "other_income")

    component_income_total = (
        salary_income_monthly
        + non_recurring_income_monthly
        + pension_income_current
        + financial_income_monthly
        + spouse_income_monthly
        + other_income_monthly
    )
    monthly_income_total = _monthly_average(data, "total_income") or component_income_total or db.monthly_income_avg

    monthly_expense_total = _monthly_average(data, "total_expense") or db.monthly_expense_avg
    essential_expense_monthly = _monthly_average(data, "essential_expense")
    insurance_premium_monthly = _monthly_average(data, "insurance_premium") or sum(
        item.monthly_premium for item in ins if item.is_protection_insurance == "Y"
    )
    loan_repayment_monthly = _monthly_average(data, "loan_repayment") or sum(
        loan.monthly_payment for loan in loans
    )
    net_cashflow_monthly = monthly_income_total - monthly_expense_total

    deposit_balance_total = sum(account.balance for account in data.accounts)
    investment_balance_total = sum(item.current_value for item in inv)
    real_estate_value_estimated = _asset_amount(data, ("부동산", "주택", "아파트"))
    private_pension_balance = sum(
        pension.current_value for pension in pen
        if pension.scheme_group == "private_pension"
        or pension.pension_type in ("IRP", "개인연금", "개인연금저축", "퇴직연금")
    ) + sum(item.surrender_value for item in ins if item.is_private_pension == "Y")
    other_asset_estimated = 0
    total_asset_estimated = (
        deposit_balance_total
        + investment_balance_total
        + private_pension_balance
        + real_estate_value_estimated
        + other_asset_estimated
    )
    liquid_asset_total = deposit_balance_total
    loan_balance_total = sum(loan.balance for loan in loans)
    monthly_repayment_total = sum(loan.monthly_payment for loan in loans)
    debt_service_ratio = round(monthly_repayment_total / monthly_income_total, 4) if monthly_income_total > 0 else 0
    public_pension_contribution_total = sum(
        pension.contribution_total for pension in pen
        if pension.scheme_group.startswith("public") or pension.pension_type in ("국민연금", "공무원연금")
    )
    birth_year = _birth_year(data)
    years_until_retirement = max(0, RETIREMENT_AGE - p.age)
    service_years_current = _service_years_current(data)
    service_years_at_retirement = service_years_current + years_until_retirement
    retirement_lump_sum_estimated = salary_income_monthly * service_years_at_retirement
    retirement_liquid_asset_total = liquid_asset_total + retirement_lump_sum_estimated
    total_asset_estimated += retirement_lump_sum_estimated

    has_occupational_public_pension = _has_occupational_public_pension(data)
    estimated_contribution_years = min(
        40,
        max(10, max(0, p.age - 27) + years_until_retirement)
    )
    estimated_national_pension_monthly = 0 if has_occupational_public_pension else _estimate_national_pension_monthly(
        monthly_income_total,
        estimated_contribution_years,
    )
    occupational_public_pension_monthly = sum(
        pension.expected_monthly for pension in pen
        if pension.scheme_group == "public_occupational"
        or pension.pension_type in ("공무원연금", "군인연금", "사학연금")
    )
    national_pension_start_age = _national_pension_start_age(birth_year)

    occupational_start_age = None
    occupational_start = next(
        (
            pension.expected_start for pension in pen
            if (
                pension.scheme_group == "public_occupational"
                or pension.pension_type in ("공무원연금", "군인연금", "사학연금")
            )
            and pension.expected_start
        ),
        "",
    )
    if occupational_start and birth_year:
        occupational_start_age = max(0, int(occupational_start[:4]) - birth_year)

    public_pension_start_age = (
        occupational_start_age
        if has_occupational_public_pension and occupational_start_age is not None
        else national_pension_start_age
    )

    # ── 1. 은퇴 후 연금소득 ─────────────────────────────
    # D: 연금 합산 (gap구간: 공적연금 제외 / full구간: 사적연금 + 수령 가능 공적연금)
    private_pension_monthly = sum(
        pension.expected_monthly for pension in pen
        if pension.scheme_group == "private_pension"
        or pension.pension_type in ("IRP", "개인연금", "개인연금저축", "퇴직연금")
    )
    public_pension_monthly = (
        occupational_public_pension_monthly
        if has_occupational_public_pension
        else estimated_national_pension_monthly
    )
    total_pension_gap = private_pension_monthly
    total_pension_full = private_pension_monthly + public_pension_monthly

    pension_replacement_rate = round(
        total_pension_full / monthly_income_total * 100, 1
    ) if monthly_income_total > 0 else 0

    # ── 2. 재무적 생존 여력 ─────────────────────────────
    # 60세 은퇴 직후: 현재 유동자산 + 60세 기준 퇴직금 추정액 / 공적연금 개시 전 월 적자
    liquid = retirement_liquid_asset_total

    # 은퇴 후: 대출 상환액 일부 감소를 가정한 월 지출과 연금소득 차이
    monthly_loan = monthly_repayment_total
    post_retire_expense = monthly_expense_total - monthly_loan * 0.3  # 일부 대출 상환 완료 가정
    gap_period_deficit = max(0, post_retire_expense - total_pension_gap)
    full_retire_deficit = max(0, post_retire_expense - total_pension_full)
    survival_months_at_retirement = round(liquid / gap_period_deficit, 1) if gap_period_deficit > 0 else 99.0
    survival_months_retire = round(liquid / full_retire_deficit, 1) if full_retire_deficit > 0 else 99.0

    # ── 3. 소득 공백기 ──────────────────────────────────
    income_gap_years = max(0, public_pension_start_age - RETIREMENT_AGE)

    # ── 4. DSR ──────────────────────────────────────────
    total_monthly_loan = monthly_repayment_total
    dsr_now    = round(total_monthly_loan / monthly_income_total * 100, 1) if monthly_income_total > 0 else 0
    dsr_retire = round(total_monthly_loan / total_pension_full * 100, 1) if total_pension_full > 0 else 0

    # ── 5. 포트폴리오 괴리도 ────────────────────────────
    total_invest = sum(iv.current_value for iv in inv)
    stock_value  = sum(
        iv.current_value for iv in inv
        if iv.product_type in ("ETF", "개별주식")
    )
    actual_stock_ratio  = round(stock_value / total_invest * 100, 1) if total_invest > 0 else 0
    optimal_stock_ratio = max(0, 100 - max(p.age, RETIREMENT_AGE))     # 60세 은퇴 기준 간이 룰
    portfolio_deviation = round(actual_stock_ratio - optimal_stock_ratio, 1)

    # ── 6. 보험료 은퇴 후 부담률 ────────────────────────
    total_insurance_premium = insurance_premium_monthly
    insurance_burden_retire = round(
        total_insurance_premium / total_pension_gap * 100, 1
    ) if total_pension_gap > 0 else 0

    # ── 7. 연금자산 집중도 ───────────────────────────────
    pension_value = private_pension_balance
    net_worth = max(0, total_asset_estimated - loan_balance_total) or db.net_worth
    pension_asset_ratio = round(pension_value / net_worth * 100, 1) if net_worth > 0 else 0

    # ── 8. 월 부족액 ───────────────────────────────────
    shortfall_monthly = full_retire_deficit

    # 고위험 투자 비중
    high_risk_value = sum(
        iv.current_value for iv in inv if "높음" in iv.risk_tag
    )
    invest_risk_ratio = round(high_risk_value / total_invest * 100, 1) if total_invest > 0 else 0

    return {
        "age":                         p.age,
        "region":                      p.region,
        "household_size":              p.household_size,
        "employment_status":           p.employment_status,
        "retirement_age":              RETIREMENT_AGE,
        "years_until_retirement":      years_until_retirement,
        "service_years_current":       service_years_current,
        "service_years_at_retirement": service_years_at_retirement,
        "birth_year":                  birth_year,
        "monthly_income_total":        monthly_income_total,
        "salary_income_monthly":       salary_income_monthly,
        "non_recurring_income_monthly": non_recurring_income_monthly,
        "pension_income_current":      pension_income_current,
        "financial_income_monthly":    financial_income_monthly,
        "spouse_income_monthly":       spouse_income_monthly,
        "other_income_monthly":        other_income_monthly,
        "monthly_expense_total":       monthly_expense_total,
        "essential_expense_monthly":   essential_expense_monthly,
        "insurance_premium_monthly":   insurance_premium_monthly,
        "loan_repayment_monthly":      loan_repayment_monthly,
        "net_cashflow_monthly":        net_cashflow_monthly,
        "deposit_balance_total":       deposit_balance_total,
        "investment_balance_total":    investment_balance_total,
        "real_estate_value_estimated": real_estate_value_estimated,
        "retirement_lump_sum_estimated": retirement_lump_sum_estimated,
        "total_asset_estimated":       total_asset_estimated,
        "liquid_asset_total":          liquid_asset_total,
        "retirement_liquid_asset_total": retirement_liquid_asset_total,
        "loan_balance_total":          loan_balance_total,
        "monthly_repayment_total":     monthly_repayment_total,
        "debt_service_ratio":          debt_service_ratio,
        "public_pension_contribution_total": public_pension_contribution_total,
        "private_pension_balance":     private_pension_balance,
        "private_pension_monthly":     private_pension_monthly,
        "public_pension_monthly":      public_pension_monthly,
        "occupational_public_pension_monthly": occupational_public_pension_monthly,
        "estimated_national_pension_monthly": estimated_national_pension_monthly,
        "estimated_national_pension_contribution_years": estimated_contribution_years,
        "national_pension_start_age":  national_pension_start_age,
        "public_pension_start_age":    public_pension_start_age,
        "pension_start_adjustment_options": PENSION_START_ADJUSTMENT_GUIDE,
        "post_retire_expense_monthly": int(post_retire_expense),
        "gap_period_shortfall_monthly": int(gap_period_deficit),
        "PensionReplacementRate": pension_replacement_rate,
        "pension_replacement_rate": pension_replacement_rate,
        "survival_months_at_retirement": survival_months_at_retirement,
        "survival_months_retire":  survival_months_retire,
        "income_gap_years":        income_gap_years,
        "dsr_now":                 dsr_now,
        "dsr_retire":              dsr_retire,
        "portfolio_deviation":     portfolio_deviation,
        "insurance_burden_retire": insurance_burden_retire,
        "pension_asset_ratio":     pension_asset_ratio,
        "shortfall_monthly":       int(shortfall_monthly),
        "invest_risk_ratio":       invest_risk_ratio,
    }

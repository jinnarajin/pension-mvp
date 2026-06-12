"""
calculations.py — 계산 엔진 (순수 Python, LLM 불필요)
cashflow_snapshot 노드에서 호출됩니다.
Image 2의 [2] Feature Extractor + [5] Final Cashflow Calculation 수식 구현.
"""

from __future__ import annotations
from mydata_schema import MyDataInput


RETIREMENT_AGE = 60
LIFE_EXPECTANCY_MALE   = 80.0
LIFE_EXPECTANCY_FEMALE = 86.2
CIVIL_SERVANT_RETIREMENT_ALLOWANCE_RATE_TABLE = [
    (1, 5, 0.065),
    (5, 10, 0.2275),
    (10, 15, 0.2925),
    (15, 20, 0.325),
    (20, None, 0.39),
]

# Liquidity tiers are based on practical cash accessibility:
# immediate: cash-like accounts usable without meaningful delay or product cancellation,
# semi_liquid: deposits/installment savings that can be cashed out but may lose promised interest,
# illiquid: purpose-bound accounts such as housing subscription savings.
IMMEDIATE_LIQUID_ACCOUNT_TYPES = ("입출금", "보통예금", "CMA", "현금")
SEMI_LIQUID_ACCOUNT_TYPES = ("정기예금", "예금", "적금", "정기적금")
ILLIQUID_ACCOUNT_TYPES = ("청약", "주택청약")

# 국민연금 수급 개시 연령 표.
# birth_year가 각 threshold 이하이면 해당 start_age를 적용하고,
# 1969년 이후 출생자는 아래 helper에서 기본 65세로 처리한다.
NATIONAL_PENSION_START_AGE_BY_BIRTH_YEAR = [
    (1952, 60),
    (1956, 61),
    (1960, 62),
    (1964, 63),
    (1968, 64),
]

# 간이 국민연금 월수령액 추정 테이블.
# 실제 국민연금 공식 산식은 과거 소득 재평가, A값, 가입이력 등을 반영하지만
# MVP에서는 사용자가 준 가입기간/월소득 대략표를 anchor로 삼아 보간한다.
NATIONAL_PENSION_MONTHLY_TABLE = {
    10: {2_000_000: 180_000, 4_000_000: 270_000, 6_000_000: 330_000},
    20: {2_000_000: 370_000, 4_000_000: 550_000, 6_000_000: 680_000},
    30: {2_000_000: 560_000, 4_000_000: 840_000, 6_000_000: 1_030_000},
    40: {2_000_000: 740_000, 4_000_000: 1_130_000, 6_000_000: 1_380_000},
}

# 연금 수령시기 조정 가이드.
# 현재 계산에는 반영하지 않고, 후속 cashflow/추천 agent가 조기·연기 수령
# 안내를 만들 때 참고할 수 있도록 feature로 노출한다.
PENSION_START_ADJUSTMENT_GUIDE = {
    "early_5_years": -0.30,
    "normal": 0.0,
    "delay_per_year": 0.072,
    "delay_5_years": 0.36,
}


def _year_month_from_date(value: str) -> str:
    if not value:
        return ""
    return value[:7]


def _year_month_at_age(data: MyDataInput, age: int) -> str:
    """birth_date가 있으면 특정 만 나이가 되는 YYYY-MM을 반환한다."""
    if not data.profile.birth_date:
        return ""
    birth_year = int(data.profile.birth_date[:4])
    birth_month = data.profile.birth_date[5:7]
    return f"{birth_year + age}-{birth_month}"


def _months_between(start_ym: str, end_ym: str) -> int:
    """YYYY-MM 두 지점 사이의 월 차이를 계산한다. end가 빠르면 0."""
    if not start_ym or not end_ym:
        return 0
    start_year, start_month = map(int, start_ym.split("-"))
    end_year, end_month = map(int, end_ym.split("-"))
    return max(0, (end_year - start_year) * 12 + (end_month - start_month))


def _avg(items: list[int]) -> int:
    return sum(items) // len(items) if items else 0


def _monthly_average(data: MyDataInput, field_name: str, fallback_field: str | None = None) -> int:
    """최근 12개월 월별 summary에서 특정 field의 월평균을 계산한다."""
    values = [getattr(summary, field_name, 0) or 0 for summary in data.monthly_summaries]
    if any(values):
        return _avg(values)
    if fallback_field:
        return _avg([getattr(summary, fallback_field, 0) or 0 for summary in data.monthly_summaries])
    return 0


def _asset_amount(data: MyDataInput, keywords: tuple[str, ...]) -> int:
    """assets_liabilities에서 특정 keyword가 들어간 자산 항목 금액을 합산한다."""
    return sum(
        item.amount for item in data.assets_liabilities
        if item.category == "자산" and any(keyword in item.item for keyword in keywords)
    )


def _birth_year(data: MyDataInput) -> int:
    """생년월일이 있으면 직접 사용하고, 없으면 기준일과 나이로 출생연도를 추정한다."""
    if data.profile.birth_date:
        return int(data.profile.birth_date[:4])
    if data.profile.age_reference_date:
        return int(data.profile.age_reference_date[:4]) - data.profile.age
    return 0


def _national_pension_start_age(birth_year: int) -> int:
    """출생연도별 국민연금 수급 개시 연령을 반환한다."""
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
    """월소득과 가입기간 anchor 사이를 선형 보간해 국민연금 월수령액을 거칠게 추정한다."""
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
    """공무원·군인·사학연금 등 직역연금이 있으면 국민연금과 중복 추정하지 않는다."""
    return any(
        pension.expected_monthly > 0
        and (
            pension.scheme_group == "public_occupational"
            or pension.pension_type in ("공무원연금", "군인연금", "사학연금")
        )
        for pension in data.pensions
    )


def _has_civil_servant_pension(data: MyDataInput) -> bool:
    """공무원연금 수령자가 맞으면 퇴직금 대신 퇴직수당 산식을 적용한다."""
    return any(
        pension.expected_monthly > 0
        and (
            pension.pension_type == "공무원연금"
            or (
                pension.scheme_group == "public_occupational"
                and ("공무원" in pension.provider or "공무원" in pension.pension_type)
            )
        )
        for pension in data.pensions
    )


def _has_retirement_pension_balance(data: MyDataInput) -> bool:
    """DB/DC 퇴직연금 적립금이 이미 있으면 일반 퇴직금 중복 계상을 피한다."""
    return any(
        pension.current_value > 0
        and (
            pension.scheme_group == "retirement_pension"
            or pension.pension_type in ("퇴직연금", "DB", "DC", "확정급여형", "확정기여형")
        )
        for pension in data.pensions
    )


def _civil_servant_pension_start_age_by_retire_year(retire_year: int) -> int | None:
    """사용자 제공 공무원연금 퇴직연도별 개시연령 표를 적용한다."""
    if 2027 <= retire_year <= 2029:
        return 63
    if 2030 <= retire_year <= 2032:
        return 64
    if retire_year >= 2033:
        return 65
    return None


def _civil_servant_retirement_allowance_rate(service_years: int) -> float:
    """재직기간별 공무원 퇴직수당 지급비율을 반환한다."""
    for min_years, max_years, rate in CIVIL_SERVANT_RETIREMENT_ALLOWANCE_RATE_TABLE:
        if service_years >= min_years and (max_years is None or service_years < max_years):
            return rate
    return 0


def _account_liquidity_tier(account_type: str) -> str:
    """계좌 유형을 실무상 현금 접근성 기준으로 즉시유동/준유동/비유동 분류한다."""
    if any(keyword in account_type for keyword in ILLIQUID_ACCOUNT_TYPES):
        return "illiquid"
    if any(keyword in account_type for keyword in IMMEDIATE_LIQUID_ACCOUNT_TYPES):
        return "immediate"
    if any(keyword in account_type for keyword in SEMI_LIQUID_ACCOUNT_TYPES):
        return "semi_liquid"
    return "semi_liquid"


def _service_years_current(data: MyDataInput) -> int:
    """현재 근속연수. 입력값이 없으면 27세부터 근로를 시작했다고 보는 보수적 fallback."""
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
          insurance_burden_retire,             # 보험료 은퇴 후 부담률
          pension_asset_ratio,                 # 연금자산 집중도
          shortfall_monthly,                   # 월 부족액
        }
    """
    p = data.profile
    db = data.dashboard
    pen = data.pensions
    inv = data.investments
    loans = data.loans
    ins = data.insurances

    # ── A. 월 소득 구성요소 ─────────────────────────────
    # 급여, 비정기 수입, 현재 연금, 금융소득, 배우자소득, 기타소득을
    # 12개월 평균으로 환산한다. total_income이 있으면 그것을 우선 사용한다.
    salary_income_monthly = _monthly_average(data, "salary_income", fallback_field="total_income")
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

    # ── B. 월 지출·현금흐름 ─────────────────────────────
    # 필수지출, 보험료, 대출상환액을 분리해 향후 부족액·DSR·보험 부담률 계산의
    # 입력값으로 사용한다.
    monthly_expense_total = _monthly_average(data, "total_expense") or db.monthly_expense_avg
    essential_expense_monthly = _monthly_average(data, "essential_expense")
    insurance_premium_monthly = _monthly_average(data, "insurance_premium") or sum(
        item.monthly_premium for item in ins if item.is_protection_insurance == "Y"
    )
    loan_repayment_monthly = _monthly_average(data, "loan_repayment") or sum(
        loan.monthly_payment for loan in loans
    )
    net_cashflow_monthly = monthly_income_total - monthly_expense_total

    # ── C. 현재 자산·부채 스냅샷 ───────────────────────
    # 예금성 자산은 전체 잔액과 유동성 tier를 분리한다.
    # 즉시유동: 입출금/CMA, 준유동: 정기예금/적금, 비유동: 청약저축 등.
    # 예금 해지 시나리오는 준유동자산을 별도로 보아야 하므로 liquid_asset_total에는
    # 즉시유동자산만 넣는다.
    deposit_balance_total = sum(account.balance for account in data.accounts)
    account_liquidity_breakdown = {
        "immediate": 0,
        "semi_liquid": 0,
        "illiquid": 0,
    }
    for account in data.accounts:
        account_liquidity_breakdown[_account_liquidity_tier(account.account_type)] += account.balance
    immediate_liquid_asset_total = account_liquidity_breakdown["immediate"]
    semi_liquid_asset_total = account_liquidity_breakdown["semi_liquid"]
    illiquid_account_asset_total = account_liquidity_breakdown["illiquid"]
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
    liquid_asset_total = immediate_liquid_asset_total
    loan_balance_total = sum(loan.balance for loan in loans)
    monthly_repayment_total = sum(loan.monthly_payment for loan in loans)
    loan_details = [
        {
            "loan_type": loan.loan_type,
            "balance": loan.balance,
            "monthly_payment": loan.monthly_payment,
            "annual_payment": loan.annual_payment or loan.monthly_payment * 12,
            "interest_rate": loan.interest_rate,
            "interest_type": loan.interest_type,
            "repayment_method": loan.repayment_method,
            "monthly_payment_day": loan.monthly_payment_day,
            "maturity_date": loan.maturity_date,
        }
        for loan in loans
    ]
    debt_service_ratio = round(monthly_repayment_total / monthly_income_total, 4) if monthly_income_total > 0 else 0
    public_pension_contribution_total = sum(
        pension.contribution_total for pension in pen
        if pension.scheme_group.startswith("public") or pension.pension_type in ("국민연금", "공무원연금")
    )
    irp_contribution_monthly = sum(
        pension.monthly_contribution for pension in pen
        if pension.pension_type == "IRP"
    )
    pension_savings_contribution_monthly = sum(
        pension.monthly_contribution for pension in pen
        if pension.pension_type in ("개인연금", "개인연금저축", "연금저축", "연금저축펀드")
    ) + sum(
        item.monthly_premium for item in ins
        if item.is_private_pension == "Y" or "연금저축" in item.insurance_type
    )
    private_pension_contribution_monthly = (
        irp_contribution_monthly
        + pension_savings_contribution_monthly
    )

    # ── D. 은퇴 기준 나이·근속·퇴직금/퇴직수당 추정 ───
    # 기준 은퇴 나이는 60세. 현재 나이와 근속연수를 이용해 은퇴 시점 근속연수를 만들고,
    # 공무원연금 수령자는 일반 퇴직금이 아니라 재직기간별 퇴직수당 근사식
    # 기준소득월액 × 재직연수 × 지급비율을 적용한다.
    # DB/DC 퇴직연금 적립금이 별도로 있으면 일반 퇴직금과 중복 계상하지 않는다.
    birth_year = _birth_year(data)
    years_until_retirement = max(0, RETIREMENT_AGE - p.age)
    service_years_current = _service_years_current(data)
    service_years_at_retirement = service_years_current + years_until_retirement
    has_civil_servant_pension = _has_civil_servant_pension(data)
    has_retirement_pension_balance = _has_retirement_pension_balance(data)
    if has_civil_servant_pension:
        retirement_lump_sum_type = "civil_servant_retirement_allowance"
        retirement_lump_sum_rate = _civil_servant_retirement_allowance_rate(service_years_at_retirement)
        retirement_lump_sum_estimated = int(
            salary_income_monthly
            * service_years_at_retirement
            * retirement_lump_sum_rate
        )
    elif has_retirement_pension_balance:
        retirement_lump_sum_type = "excluded_retirement_pension_double_count"
        retirement_lump_sum_rate = 0
        retirement_lump_sum_estimated = 0
    else:
        retirement_lump_sum_type = "statutory_retirement_pay"
        retirement_lump_sum_rate = 1
        retirement_lump_sum_estimated = salary_income_monthly * service_years_at_retirement
    retirement_liquid_asset_total = liquid_asset_total + retirement_lump_sum_estimated
    retirement_accessible_asset_total = retirement_liquid_asset_total + semi_liquid_asset_total
    total_asset_estimated += retirement_lump_sum_estimated

    # ── E. 공적연금 종류·수급 개시 나이 ───────────────
    # 직역연금이 있으면 국민연금 추정액을 0으로 두어 중복 수령을 막는다.
    # 공무원연금은 expected_start 입력값을 그대로 믿지 않고 퇴직연도별 개시연령 표로 검증한다.
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
    public_pension_start_month = ""
    retire_year = int(p.retire_date[:4]) if p.retire_date else 0
    civil_servant_start_age = _civil_servant_pension_start_age_by_retire_year(retire_year)
    if has_civil_servant_pension and civil_servant_start_age is not None:
        occupational_start_age = civil_servant_start_age
        public_pension_start_month = _year_month_at_age(data, occupational_start_age)

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
    if occupational_start and birth_year and occupational_start_age is None:
        occupational_start_age = max(0, int(occupational_start[:4]) - birth_year)
        public_pension_start_month = occupational_start

    public_pension_start_age = (
        occupational_start_age
        if has_occupational_public_pension and occupational_start_age is not None
        else national_pension_start_age
    )
    if not public_pension_start_month:
        public_pension_start_month = _year_month_at_age(data, public_pension_start_age)

    # ── 1. 은퇴 후 연금소득 ─────────────────────────────
    # gap구간은 60세 은퇴 후 공적연금이 아직 시작되지 않은 기간이다.
    # full구간은 사적연금 + 수령 가능한 공적연금이 모두 들어오는 은퇴 후 정상 구간이다.
    # PensionReplacementRate는 은퇴 후 총 연금소득이 현재 월소득의 몇 %인지 나타낸다.
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
    applied_public_pension_type = next(
        (
            pension.pension_type for pension in pen
            if (
                pension.scheme_group == "public_occupational"
                or pension.pension_type in ("공무원연금", "군인연금", "사학연금")
            )
            and pension.expected_monthly > 0
        ),
        "국민연금",
    ) if has_occupational_public_pension else "국민연금"
    total_pension_gap = private_pension_monthly
    total_pension_full = private_pension_monthly + public_pension_monthly

    pension_replacement_rate = round(
        total_pension_full / monthly_income_total * 100, 1
    ) if monthly_income_total > 0 else 0

    # ── 2. 재무적 생존 여력 ─────────────────────────────
    # survival_months_at_retirement:
    #   60세 은퇴 직후 유동성으로 공적연금 개시 전 월 적자를 몇 개월 버틸 수 있는지.
    # survival_months_retire:
    #   공적연금까지 포함한 은퇴 후 월 적자를 같은 유동성으로 몇 개월 버틸 수 있는지.
    liquid = retirement_liquid_asset_total

    # 은퇴 후에는 대출 상환 부담이 일부 줄어든다고 보고 월 대출상환액의 30%를 지출에서 차감한다.
    monthly_loan = monthly_repayment_total
    post_retire_expense = monthly_expense_total - monthly_loan * 0.3  # 일부 대출 상환 완료 가정
    gap_period_deficit = max(0, post_retire_expense - total_pension_gap)
    full_retire_deficit = max(0, post_retire_expense - total_pension_full)
    survival_months_at_retirement = round(liquid / gap_period_deficit, 1) if gap_period_deficit > 0 else 99.0
    survival_months_retire = round(liquid / full_retire_deficit, 1) if full_retire_deficit > 0 else 99.0

    # ── 3. 소득 공백기와 전기간 부족액 ─────────────────
    # 60세 은퇴일 이후 공적연금이 시작될 때까지 월 단위 공백을 먼저 계산한다.
    # 이후 기대수명까지의 full구간 부족액을 합쳐 "예금을 깨도 되는가"를 판단할
    # 전기간 총 부족액을 산출한다.
    retirement_month = _year_month_from_date(p.retire_date) or _year_month_at_age(data, RETIREMENT_AGE)
    income_gap_months = _months_between(retirement_month, public_pension_start_month)
    if income_gap_months == 0:
        income_gap_months = max(0, public_pension_start_age - RETIREMENT_AGE) * 12
    income_gap_years = round(income_gap_months / 12, 1)
    if p.life_expectancy_age:
        life_expectancy_age = float(p.life_expectancy_age)
    elif p.gender == "여":
        life_expectancy_age = LIFE_EXPECTANCY_FEMALE
    else:
        life_expectancy_age = LIFE_EXPECTANCY_MALE
    post_public_pension_months = max(0, life_expectancy_age - public_pension_start_age) * 12
    retirement_total_shortfall_estimated = int(
        income_gap_months * gap_period_deficit
        + post_public_pension_months * full_retire_deficit
    )
    retirement_total_shortfall_after_assets = max(
        0,
        retirement_total_shortfall_estimated - retirement_accessible_asset_total,
    )

    # ── 4. DSR ──────────────────────────────────────────
    # dsr_now는 현재 월소득 대비 대출상환 부담,
    # dsr_retire는 은퇴 후 연금소득 대비 같은 대출상환 부담을 본다.
    total_monthly_loan = monthly_repayment_total
    dsr_now    = round(total_monthly_loan / monthly_income_total * 100, 1) if monthly_income_total > 0 else 0
    dsr_retire = round(total_monthly_loan / total_pension_full * 100, 1) if total_pension_full > 0 else 0

    # ── 5. 보험료 은퇴 후 부담률 ────────────────────────
    # 공적연금 개시 전 gap구간의 사적연금 소득 대비 보장성 보험료 부담률.
    # 은퇴 직후 현금흐름에서 보험료가 과도한지 보기 위한 보조 지표다.
    total_insurance_premium = insurance_premium_monthly
    insurance_burden_retire = round(
        total_insurance_premium / total_pension_gap * 100, 1
    ) if total_pension_gap > 0 else 0

    # ── 6. 연금자산 집중도 ───────────────────────────────
    # 순자산 중 사적연금·퇴직연금성 자산이 차지하는 비중.
    # 연금자산에 과도하게 묶여 있는지, 또는 연금 준비가 부족한지 보는 보조 지표다.
    pension_value = private_pension_balance
    net_worth = max(0, total_asset_estimated - loan_balance_total) or db.net_worth
    pension_asset_ratio = round(pension_value / net_worth * 100, 1) if net_worth > 0 else 0

    # ── 7. 월 부족액 ───────────────────────────────────
    # 공적연금까지 모두 받는 정상 은퇴 구간에서 월 지출이 월 연금소득을 초과하는 금액.
    # dashboard action item과 실무자 검토 라우팅의 주요 입력이다.
    shortfall_monthly = full_retire_deficit

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
        "immediate_liquid_asset_total": immediate_liquid_asset_total,
        "semi_liquid_asset_total":     semi_liquid_asset_total,
        "illiquid_account_asset_total": illiquid_account_asset_total,
        "account_liquidity_breakdown": account_liquidity_breakdown,
        "investment_balance_total":    investment_balance_total,
        "real_estate_value_estimated": real_estate_value_estimated,
        "retirement_lump_sum_estimated": retirement_lump_sum_estimated,
        "retirement_lump_sum_type":    retirement_lump_sum_type,
        "retirement_lump_sum_rate":    retirement_lump_sum_rate,
        "civil_servant_retirement_allowance_rate_table": CIVIL_SERVANT_RETIREMENT_ALLOWANCE_RATE_TABLE,
        "total_asset_estimated":       total_asset_estimated,
        "liquid_asset_total":          liquid_asset_total,
        "retirement_liquid_asset_total": retirement_liquid_asset_total,
        "retirement_accessible_asset_total": retirement_accessible_asset_total,
        "loan_balance_total":          loan_balance_total,
        "monthly_repayment_total":     monthly_repayment_total,
        "loan_details":                loan_details,
        "debt_service_ratio":          debt_service_ratio,
        "public_pension_contribution_total": public_pension_contribution_total,
        "private_pension_balance":     private_pension_balance,
        "irp_contribution_monthly":    irp_contribution_monthly,
        "irp_contribution_annual":     irp_contribution_monthly * 12,
        "pension_savings_contribution_monthly": pension_savings_contribution_monthly,
        "pension_savings_contribution_annual": pension_savings_contribution_monthly * 12,
        "private_pension_contribution_monthly": private_pension_contribution_monthly,
        "private_pension_contribution_annual": private_pension_contribution_monthly * 12,
        "private_pension_monthly":     private_pension_monthly,
        "public_pension_monthly":      public_pension_monthly,
        "applied_public_pension_type": applied_public_pension_type,
        "occupational_public_pension_monthly": occupational_public_pension_monthly,
        "estimated_national_pension_monthly": estimated_national_pension_monthly,
        "estimated_national_pension_contribution_years": estimated_contribution_years,
        "national_pension_start_age":  national_pension_start_age,
        "public_pension_start_age":    public_pension_start_age,
        "public_pension_start_month":  public_pension_start_month,
        "pension_start_adjustment_options": PENSION_START_ADJUSTMENT_GUIDE,
        "post_retire_expense_monthly": int(post_retire_expense),
        "gap_period_shortfall_monthly": int(gap_period_deficit),
        "PensionReplacementRate": pension_replacement_rate,
        "pension_replacement_rate": pension_replacement_rate,
        "survival_months_at_retirement": survival_months_at_retirement,
        "survival_months_retire":  survival_months_retire,
        "income_gap_years":        income_gap_years,
        "income_gap_months":       income_gap_months,
        "life_expectancy_age":     life_expectancy_age,
        "post_public_pension_months": post_public_pension_months,
        "retirement_total_shortfall_estimated": retirement_total_shortfall_estimated,
        "retirement_total_shortfall_after_assets": retirement_total_shortfall_after_assets,
        "dsr_now":                 dsr_now,
        "dsr_retire":              dsr_retire,
        "insurance_burden_retire": insurance_burden_retire,
        "pension_asset_ratio":     pension_asset_ratio,
        "shortfall_monthly":       int(shortfall_monthly),
    }

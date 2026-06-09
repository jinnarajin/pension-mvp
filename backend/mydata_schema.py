"""
mydata_schema.py — MyData 10-sheet dataclass definitions + Persona A/B mock data

10 sheets:
    01 profile              — 사용자 프로필
    02 monthly_summaries    — 월별 요약 (12개월)
    03 transactions         — 거래 내역
    04 accounts             — 계좌
    05 pensions             — 연금 (국민/퇴직/IRP/개인)
    06 investments          — 투자 자산
    07 loans                — 대출
    08 insurances           — 보험
    09 assets_liabilities   — 자산·부채 일람
    10 dashboard            — 대시보드 메트릭

MyDataInput.from_dict(d) is the inverse of dataclasses.asdict(MyDataInput).
agents.py:backend_data_mapping() depends on this contract.
"""

from __future__ import annotations
from dataclasses import dataclass, field, fields, is_dataclass
from typing import Any, get_args, get_origin, get_type_hints
import typing


# ── 01 profile ─────────────────────────────────────────────

@dataclass
class Profile:
    customer_id: str
    name: str
    age: int
    job_type: str               # "공무원", "회사원", "자영업" 등
    years_to_retire: int
    retire_date: str            # "YYYY-MM-DD"
    risk_tolerance: str         # "안정형" | "중립형" | "공격형"
    core_anxiety: str           # 핵심 불안 요인 (자유 텍스트)


# ── 02 monthly_summaries ──────────────────────────────────

@dataclass
class MonthlySummary:
    month: str                  # "YYYY-MM"
    total_income: int
    total_expense: int
    cashflow: int               # total_income - total_expense


# ── 03 transactions ───────────────────────────────────────

@dataclass
class Transaction:
    date: str                   # "YYYY-MM-DD"
    category: str               # "급여", "식비", "공과금" 등
    amount: int                 # 양수=수입, 음수=지출
    description: str


# ── 04 accounts ───────────────────────────────────────────

@dataclass
class Account:
    bank_name: str
    account_type: str           # "보통예금", "정기예금", "CMA" 등
    balance: int
    currency: str = "KRW"


# ── 05 pensions ───────────────────────────────────────────

@dataclass
class Pension:
    pension_type: str           # "국민연금" | "퇴직연금" | "IRP" | "개인연금"
    provider: str               # 운용사/취급기관
    current_value: int          # 현재 적립금
    expected_monthly: int       # 예상 월수령액
    expected_start: str         # "YYYY-MM" 수령 개시 시점
    current_yield: float = 0.0  # 최근 1년 수익률 (%)


# ── 06 investments ────────────────────────────────────────

@dataclass
class Investment:
    product_type: str           # "ETF" | "개별주식" | "펀드" | "예금" 등
    product_name: str
    current_value: int
    risk_tag: str               # "낮음" | "중간" | "높음"


# ── 07 loans ──────────────────────────────────────────────

@dataclass
class Loan:
    loan_type: str              # "주택담보대출" | "신용대출" 등
    balance: int                # 남은 원금
    monthly_payment: int        # 월 상환액
    interest_rate: float        # 연이율 (%)


# ── 08 insurances ─────────────────────────────────────────

@dataclass
class Insurance:
    insurance_type: str         # "종신", "건강", "실손" 등
    monthly_premium: int
    sum_assured: int            # 보장 한도


# ── 09 assets_liabilities ─────────────────────────────────

@dataclass
class AssetLiability:
    category: str               # "자산" | "부채"
    item: str                   # "부동산", "연금자산", "IRP", "신용대출" 등
    amount: int                 # 자산은 양수, 부채는 양수로 저장 (category로 구분)


# ── 10 dashboard ──────────────────────────────────────────

@dataclass
class Dashboard:
    monthly_income_avg: int     # 최근 12개월 평균 월 수입
    monthly_expense_avg: int    # 최근 12개월 평균 월 지출
    monthly_cashflow_avg: int   # 평균 월 현금흐름
    net_worth: int              # 순자산 (자산 - 부채)


# ── 통합 MyDataInput ──────────────────────────────────────

@dataclass
class MyDataInput:
    profile: Profile
    monthly_summaries: list[MonthlySummary]
    transactions: list[Transaction]
    accounts: list[Account]
    pensions: list[Pension]
    investments: list[Investment]
    loans: list[Loan]
    insurances: list[Insurance]
    assets_liabilities: list[AssetLiability]
    dashboard: Dashboard

    @classmethod
    def from_dict(cls, d: dict) -> "MyDataInput":
        """Reverse of dataclasses.asdict — accepts the JSON-shaped dict that
        FastAPI/Redis hand to us and rebuilds the dataclass tree."""
        return _build(cls, d)


# ── 재귀 dict→dataclass 빌더 ──────────────────────────────

def _build(tp: Any, value: Any) -> Any:
    """Walk an annotated type and a value, instantiating nested dataclasses."""
    if value is None:
        return None

    # dataclass: build field-by-field from dict
    if is_dataclass(tp):
        if not isinstance(value, dict):
            raise TypeError(f"{tp.__name__}: expected dict, got {type(value).__name__}")
        hints = get_type_hints(tp)
        kwargs = {}
        for f in fields(tp):
            if f.name in value:
                kwargs[f.name] = _build(hints[f.name], value[f.name])
        return tp(**kwargs)

    origin = get_origin(tp)

    # list[T]
    if origin is list:
        (inner,) = get_args(tp)
        return [_build(inner, v) for v in value]

    # Optional[T] / Union[..., None]
    if origin is typing.Union:
        args = [a for a in get_args(tp) if a is not type(None)]
        if len(args) == 1:
            return _build(args[0], value)
        # ambiguous union — just return as-is
        return value

    # primitive
    return value


# ══════════════════════════════════════════════════════════
# Persona A — PA-0001, 57세 공무원, 안정형, 은퇴 임박
# ══════════════════════════════════════════════════════════

PERSONA_A_PROFILE = Profile(
    customer_id="PA-0001",
    name="김민수",
    age=57,
    job_type="공무원",
    years_to_retire=3,
    retire_date="2028-06-30",
    risk_tolerance="안정형",
    core_anxiety="은퇴 후 3년간 국민연금 개시 전 소득 공백이 걱정됩니다.",
)

PERSONA_A_MONTHLY = [
    MonthlySummary(month=f"2024-{m:02d}", total_income=5_500_000,
                   total_expense=4_180_000, cashflow=1_320_000)
    for m in range(1, 13)
]

PERSONA_A_TX = [
    Transaction(date="2024-12-25", category="급여",    amount= 5_500_000, description="공무원 월급"),
    Transaction(date="2024-12-05", category="식비",    amount=-  620_000, description="마트/외식"),
    Transaction(date="2024-12-10", category="공과금",  amount=-  280_000, description="관리비/통신/전기"),
    Transaction(date="2024-12-15", category="대출상환", amount=-  520_000, description="주택담보대출"),
    Transaction(date="2024-12-20", category="보험료",  amount=-  340_000, description="종신+실손+건강"),
]

PERSONA_A_ACCOUNTS = [
    Account(bank_name="국민은행", account_type="보통예금", balance= 18_500_000),
    Account(bank_name="신한은행", account_type="정기예금", balance= 25_000_000),
    Account(bank_name="우리은행", account_type="CMA",     balance=  6_800_000),
]

PERSONA_A_PENSIONS = [
    Pension(pension_type="국민연금",  provider="국민연금공단", current_value=  0,
            expected_monthly=1_820_000, expected_start="2033-07", current_yield=0.0),
    Pension(pension_type="퇴직연금",  provider="삼성생명",     current_value=185_000_000,
            expected_monthly=  720_000, expected_start="2028-07", current_yield=1.2),
    Pension(pension_type="IRP",       provider="미래에셋증권", current_value= 42_000_000,
            expected_monthly=  180_000, expected_start="2028-07", current_yield=2.8),
    Pension(pension_type="개인연금",  provider="한화생명",     current_value= 38_000_000,
            expected_monthly=  240_000, expected_start="2028-07", current_yield=3.1),
]

PERSONA_A_INVESTMENTS = [
    Investment(product_type="ETF",      product_name="KODEX 200",         current_value=12_000_000, risk_tag="중간"),
    Investment(product_type="ETF",      product_name="TIGER 미국S&P500",   current_value=15_000_000, risk_tag="중간"),
    Investment(product_type="펀드",     product_name="국내채권혼합형",     current_value= 8_500_000, risk_tag="낮음"),
    Investment(product_type="개별주식", product_name="삼성전자",           current_value= 4_500_000, risk_tag="높음"),
]

PERSONA_A_LOANS = [
    Loan(loan_type="주택담보대출", balance=85_000_000, monthly_payment=520_000, interest_rate=4.2),
]

PERSONA_A_INSURANCES = [
    Insurance(insurance_type="종신", monthly_premium=180_000, sum_assured=200_000_000),
    Insurance(insurance_type="실손", monthly_premium= 95_000, sum_assured= 50_000_000),
    Insurance(insurance_type="건강", monthly_premium= 65_000, sum_assured= 30_000_000),
]

PERSONA_A_AL = [
    AssetLiability(category="자산", item="부동산(아파트)",     amount=620_000_000),
    AssetLiability(category="자산", item="연금자산",           amount=265_000_000),
    AssetLiability(category="자산", item="IRP",                amount= 42_000_000),
    AssetLiability(category="자산", item="투자자산",           amount= 40_000_000),
    AssetLiability(category="자산", item="예금",               amount= 50_300_000),
    AssetLiability(category="부채", item="주택담보대출",       amount= 85_000_000),
]

PERSONA_A_DASHBOARD = Dashboard(
    monthly_income_avg= 5_500_000,
    monthly_expense_avg=4_180_000,
    monthly_cashflow_avg=1_320_000,
    net_worth=932_300_000,       # 자산합 - 부채합
)

PERSONA_A = MyDataInput(
    profile=PERSONA_A_PROFILE,
    monthly_summaries=PERSONA_A_MONTHLY,
    transactions=PERSONA_A_TX,
    accounts=PERSONA_A_ACCOUNTS,
    pensions=PERSONA_A_PENSIONS,
    investments=PERSONA_A_INVESTMENTS,
    loans=PERSONA_A_LOANS,
    insurances=PERSONA_A_INSURANCES,
    assets_liabilities=PERSONA_A_AL,
    dashboard=PERSONA_A_DASHBOARD,
)


# ══════════════════════════════════════════════════════════
# Persona B — PB-0001, 35세 회사원, 공격형, 자산 형성기
# ══════════════════════════════════════════════════════════

PERSONA_B_PROFILE = Profile(
    customer_id="PB-0001",
    name="이지원",
    age=35,
    job_type="회사원",
    years_to_retire=25,
    retire_date="2050-12-31",
    risk_tolerance="공격형",
    core_anxiety="국민연금만으로는 부족할 것 같아 추가 적립 전략이 궁금합니다.",
)

PERSONA_B_MONTHLY = [
    MonthlySummary(month=f"2024-{m:02d}", total_income=6_200_000,
                   total_expense=4_500_000, cashflow=1_700_000)
    for m in range(1, 13)
]

PERSONA_B_TX = [
    Transaction(date="2024-12-25", category="급여",    amount= 6_200_000, description="월급"),
    Transaction(date="2024-12-05", category="식비",    amount=-  780_000, description="마트/외식/배달"),
    Transaction(date="2024-12-10", category="공과금",  amount=-  220_000, description="관리비/통신"),
    Transaction(date="2024-12-12", category="대출상환", amount=-  680_000, description="전세자금대출"),
    Transaction(date="2024-12-20", category="투자",    amount=-  500_000, description="ETF 자동매수"),
]

PERSONA_B_ACCOUNTS = [
    Account(bank_name="카카오뱅크", account_type="보통예금", balance=  8_200_000),
    Account(bank_name="토스뱅크",   account_type="CMA",     balance= 12_000_000),
]

PERSONA_B_PENSIONS = [
    Pension(pension_type="국민연금", provider="국민연금공단", current_value=         0,
            expected_monthly=1_500_000, expected_start="2055-01", current_yield=0.0),
    Pension(pension_type="IRP",      provider="키움증권",     current_value= 28_000_000,
            expected_monthly=  220_000, expected_start="2050-01", current_yield=6.8),
    Pension(pension_type="개인연금", provider="삼성생명",     current_value= 12_000_000,
            expected_monthly=  150_000, expected_start="2055-01", current_yield=4.2),
]

PERSONA_B_INVESTMENTS = [
    Investment(product_type="ETF",      product_name="TIGER 미국나스닥100", current_value=24_000_000, risk_tag="높음"),
    Investment(product_type="ETF",      product_name="KODEX 200",          current_value= 8_500_000, risk_tag="중간"),
    Investment(product_type="개별주식", product_name="테슬라",              current_value= 6_500_000, risk_tag="높음"),
    Investment(product_type="개별주식", product_name="엔비디아",            current_value= 5_000_000, risk_tag="높음"),
]

PERSONA_B_LOANS = [
    Loan(loan_type="전세자금대출", balance=120_000_000, monthly_payment=680_000, interest_rate=4.5),
]

PERSONA_B_INSURANCES = [
    Insurance(insurance_type="실손", monthly_premium=58_000, sum_assured=50_000_000),
    Insurance(insurance_type="건강", monthly_premium=42_000, sum_assured=30_000_000),
]

PERSONA_B_AL = [
    AssetLiability(category="자산", item="투자자산",           amount= 44_000_000),
    AssetLiability(category="자산", item="IRP",                amount= 28_000_000),
    AssetLiability(category="자산", item="개인연금자산",       amount= 12_000_000),
    AssetLiability(category="자산", item="전세보증금",         amount=180_000_000),
    AssetLiability(category="자산", item="예금",               amount= 20_200_000),
    AssetLiability(category="부채", item="전세자금대출",       amount=120_000_000),
]

PERSONA_B_DASHBOARD = Dashboard(
    monthly_income_avg= 6_200_000,
    monthly_expense_avg=4_500_000,
    monthly_cashflow_avg=1_700_000,
    net_worth=164_200_000,
)

PERSONA_B = MyDataInput(
    profile=PERSONA_B_PROFILE,
    monthly_summaries=PERSONA_B_MONTHLY,
    transactions=PERSONA_B_TX,
    accounts=PERSONA_B_ACCOUNTS,
    pensions=PERSONA_B_PENSIONS,
    investments=PERSONA_B_INVESTMENTS,
    loans=PERSONA_B_LOANS,
    insurances=PERSONA_B_INSURANCES,
    assets_liabilities=PERSONA_B_AL,
    dashboard=PERSONA_B_DASHBOARD,
)

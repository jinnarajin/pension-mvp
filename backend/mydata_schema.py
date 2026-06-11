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
    region: str = ""
    household_size: int = 1
    employment_status: str = ""
    birth_date: str = ""
    age_reference_date: str = ""
    spouse_income_flag: str = ""
    housing_ownership_status: str = ""
    service_years_current: int = 0
    life_expectancy_age: int = 90


# ── 02 monthly_summaries ──────────────────────────────────

@dataclass
class MonthlySummary:
    month: str                  # "YYYY-MM"
    total_income: int
    total_expense: int
    cashflow: int               # total_income - total_expense
    salary_income: int = 0
    spouse_income: int = 0
    non_recurring_income: int = 0
    current_pension_income: int = 0
    financial_income: int = 0
    other_income: int = 0
    essential_expense: int = 0
    fixed_expense: int = 0
    variable_expense: int = 0
    insurance_premium: int = 0
    loan_repayment: int = 0
    medical_pharmacy: int = 0
    asset_building_transfer: int = 0
    deposit_saving_transfer: int = 0
    investment_transfer: int = 0
    private_pension_saving: int = 0
    source_level: str = ""


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
    interest_rate: float = 0.0  # 약정 금리 또는 예상 수익률 (%)
    maturity_date: str = ""     # "YYYY-MM-DD", 중도해지 손실 시나리오 입력값


# ── 05 pensions ───────────────────────────────────────────

@dataclass
class Pension:
    pension_type: str           # "국민연금" | "퇴직연금" | "IRP" | "개인연금"
    provider: str               # 운용사/취급기관
    current_value: int          # 현재 적립금
    expected_monthly: int       # 예상 월수령액
    expected_start: str         # "YYYY-MM" 수령 개시 시점
    current_yield: float = 0.0  # 최근 1년 수익률 (%)
    contribution_total: int = 0
    scheme_group: str = ""
    status: str = ""
    note: str = ""


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
    interest_type: str = "고정금리"
    repayment_method: str = "원리금균등"
    monthly_payment_day: int = 0
    annual_payment: int = 0
    maturity_date: str = ""     # "YYYY-MM-DD"


# ── 08 insurances ─────────────────────────────────────────

@dataclass
class Insurance:
    insurance_type: str         # "종신", "건강", "실손" 등
    monthly_premium: int
    sum_assured: int            # 보장 한도
    surrender_value: int = 0
    is_protection_insurance: str = "Y"
    is_private_pension: str = "N"


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
    name="김성훈",
    age=57,
    job_type="지방공무원",
    years_to_retire=3,
    retire_date="2029-12-31",
    risk_tolerance="안정형",
    core_anxiety="공무원연금 개시 전후 현금흐름과 대출상환 부담이 걱정됩니다.",
    region="전라북도 전주시 완산구",
    household_size=2,
    employment_status="재직",
    birth_date="1969-04-17",
    age_reference_date="2026-06-30",
    spouse_income_flag="Y",
    housing_ownership_status="자가",
    service_years_current=31,
    life_expectancy_age=90,
)

PERSONA_A_MONTHLY = [
    MonthlySummary(month="2026-01", total_income=5_480_000, total_expense=4_243_000,
                   cashflow=1_237_000, salary_income=4_620_000, spouse_income=720_000,
                   financial_income=140_000, essential_expense=2_863_000,
                   fixed_expense=2_010_000, variable_expense=1_856_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=205_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-02", total_income=5_425_000, total_expense=4_128_000,
                   cashflow=1_297_000, salary_income=4_620_000, spouse_income=700_000,
                   financial_income=105_000, essential_expense=2_748_000,
                   fixed_expense=1_995_000, variable_expense=1_753_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=160_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-03", total_income=5_468_000, total_expense=4_215_000,
                   cashflow=1_253_000, salary_income=4_620_000, spouse_income=720_000,
                   financial_income=128_000, essential_expense=2_835_000,
                   fixed_expense=2_005_000, variable_expense=1_830_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=185_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-04", total_income=5_502_000, total_expense=4_268_000,
                   cashflow=1_234_000, salary_income=4_620_000, spouse_income=750_000,
                   financial_income=132_000, essential_expense=2_888_000,
                   fixed_expense=2_015_000, variable_expense=1_873_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=175_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-05", total_income=5_495_000, total_expense=4_388_000,
                   cashflow=1_107_000, salary_income=4_620_000, spouse_income=710_000,
                   financial_income=165_000, essential_expense=3_008_000,
                   fixed_expense=2_015_000, variable_expense=1_993_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=230_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-06", total_income=5_510_000, total_expense=4_305_000,
                   cashflow=1_205_000, salary_income=4_620_000, spouse_income=720_000,
                   financial_income=170_000, essential_expense=2_925_000,
                   fixed_expense=2_010_000, variable_expense=1_915_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=190_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-07", total_income=6_285_000, total_expense=4_433_000,
                   cashflow=1_852_000, salary_income=4_620_000, spouse_income=720_000,
                   non_recurring_income=800_000, financial_income=145_000,
                   essential_expense=3_053_000, fixed_expense=2_010_000,
                   variable_expense=2_043_000, insurance_premium=397_000,
                   loan_repayment=983_000, medical_pharmacy=210_000,
                   asset_building_transfer=1_250_000, deposit_saving_transfer=700_000,
                   investment_transfer=300_000, private_pension_saving=250_000,
                   source_level="monthly_aggregate"),
    MonthlySummary(month="2026-08", total_income=5_532_000, total_expense=4_518_000,
                   cashflow=1_014_000, salary_income=4_620_000, spouse_income=740_000,
                   financial_income=172_000, essential_expense=3_138_000,
                   fixed_expense=2_010_000, variable_expense=2_128_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=245_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-09", total_income=5_520_000, total_expense=4_353_000,
                   cashflow=1_167_000, salary_income=4_620_000, spouse_income=720_000,
                   financial_income=180_000, essential_expense=2_973_000,
                   fixed_expense=2_010_000, variable_expense=1_963_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=205_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-10", total_income=5_508_000, total_expense=4_263_000,
                   cashflow=1_245_000, salary_income=4_620_000, spouse_income=720_000,
                   financial_income=168_000, essential_expense=2_883_000,
                   fixed_expense=2_010_000, variable_expense=1_873_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=175_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-11", total_income=5_487_000, total_expense=4_313_000,
                   cashflow=1_174_000, salary_income=4_620_000, spouse_income=700_000,
                   financial_income=167_000, essential_expense=2_933_000,
                   fixed_expense=2_010_000, variable_expense=1_923_000,
                   insurance_premium=397_000, loan_repayment=983_000,
                   medical_pharmacy=195_000, asset_building_transfer=1_250_000,
                   deposit_saving_transfer=700_000, investment_transfer=300_000,
                   private_pension_saving=250_000, source_level="monthly_aggregate"),
    MonthlySummary(month="2026-12", total_income=6_260_000, total_expense=4_573_000,
                   cashflow=1_687_000, salary_income=4_620_000, spouse_income=740_000,
                   non_recurring_income=750_000, financial_income=150_000,
                   essential_expense=3_193_000, fixed_expense=2_010_000,
                   variable_expense=2_183_000, insurance_premium=397_000,
                   loan_repayment=983_000, medical_pharmacy=260_000,
                   asset_building_transfer=1_250_000, deposit_saving_transfer=700_000,
                   investment_transfer=300_000, private_pension_saving=250_000,
                   source_level="monthly_aggregate"),
]

PERSONA_A_TX = [
    Transaction(date="2024-12-25", category="급여",    amount= 5_500_000, description="공무원 월급"),
    Transaction(date="2024-12-05", category="식비",    amount=-  620_000, description="마트/외식"),
    Transaction(date="2024-12-10", category="공과금",  amount=-  280_000, description="관리비/통신/전기"),
    Transaction(date="2024-12-15", category="대출상환", amount=-  520_000, description="주택담보대출"),
    Transaction(date="2024-12-20", category="보험료",  amount=-  340_000, description="종신+실손+건강"),
]

PERSONA_A_ACCOUNTS = [
    Account(bank_name="전북은행", account_type="입출금", balance=18_240_000, interest_rate=0.1),
    Account(bank_name="농협은행", account_type="정기예금", balance=42_000_000, interest_rate=3.2, maturity_date="2026-10-04"),
    Account(bank_name="전북은행", account_type="적금", balance=16_800_000, interest_rate=3.5, maturity_date="2027-03-15"),
    Account(bank_name="한국투자증권", account_type="CMA", balance=9_100_000, interest_rate=2.4),
    Account(bank_name="전북은행", account_type="청약저축", balance=6_200_000, interest_rate=2.1),
]

PERSONA_A_PENSIONS = [
    Pension(pension_type="공무원연금", provider="공무원연금공단", current_value=0,
            expected_monthly=1_850_000, expected_start="2032-04",
            contribution_total=132_000_000, scheme_group="public_occupational",
            status="재직 중", note="현 재직 기준 핵심 공적연금"),
    Pension(pension_type="국민연금", provider="국민연금공단", current_value=0,
            expected_monthly=0, expected_start="",
            contribution_total=3_200_000, scheme_group="public_national",
            status="과거 가입 이력", note="과거 민간근무 이력은 연계연금 검증 대상"),
    Pension(pension_type="IRP", provider="전북은행", current_value=25_900_000,
            expected_monthly=220_000, expected_start="2030-01",
            contribution_total=23_800_000, scheme_group="private_pension",
            status="운용 중", note="사적연금"),
    Pension(pension_type="개인연금저축", provider="전북은행 방카", current_value=20_700_000,
            expected_monthly=180_000, expected_start="2029-04",
            contribution_total=19_500_000, scheme_group="private_pension",
            status="납입 중", note="사적연금"),
]

PERSONA_A_INVESTMENTS = [
    Investment(product_type="ETF", product_name="KODEX 200", current_value=7_810_000, risk_tag="낮음~중간"),
    Investment(product_type="ETF", product_name="TIGER 미국S&P500", current_value=3_040_000, risk_tag="중간"),
    Investment(product_type="개별주식", product_name="삼성전자", current_value=4_875_000, risk_tag="중간"),
    Investment(product_type="채권형펀드", product_name="한국투자 e단기채 펀드", current_value=8_180_000, risk_tag="낮음"),
]

PERSONA_A_LOANS = [
    Loan(loan_type="주택담보대출", balance=32_600_000, monthly_payment=702_000,
         interest_rate=4.1, interest_type="고정금리", repayment_method="원리금균등",
         monthly_payment_day=15, annual_payment=8_424_000, maturity_date="2030-09-15"),
    Loan(loan_type="생활안정자금", balance=8_200_000, monthly_payment=281_000,
         interest_rate=3.4, interest_type="고정금리", repayment_method="원리금균등",
         monthly_payment_day=20, annual_payment=3_372_000, maturity_date="2029-01-20"),
]

PERSONA_A_INSURANCES = [
    Insurance(insurance_type="종신보험", monthly_premium=180_000, sum_assured=100_000_000,
              surrender_value=23_800_000, is_protection_insurance="Y", is_private_pension="N"),
    Insurance(insurance_type="실손의료보험", monthly_premium=123_000, sum_assured=0,
              surrender_value=0, is_protection_insurance="Y", is_private_pension="N"),
    Insurance(insurance_type="암보험", monthly_premium=94_000, sum_assured=30_000_000,
              surrender_value=4_100_000, is_protection_insurance="Y", is_private_pension="N"),
    Insurance(insurance_type="연금저축보험", monthly_premium=250_000, sum_assured=0,
              surrender_value=13_700_000, is_protection_insurance="N", is_private_pension="Y"),
]

PERSONA_A_AL = [
    AssetLiability(category="자산", item="부동산(아파트)", amount=285_000_000),
    AssetLiability(category="자산", item="예금성자산", amount=92_340_000),
    AssetLiability(category="자산", item="투자자산", amount=23_905_000),
    AssetLiability(category="자산", item="IRP", amount=25_900_000),
    AssetLiability(category="자산", item="개인연금저축", amount=20_700_000),
    AssetLiability(category="자산", item="연금저축보험", amount=13_700_000),
    AssetLiability(category="부채", item="주택담보대출", amount=32_600_000),
    AssetLiability(category="부채", item="생활안정자금", amount=8_200_000),
]

PERSONA_A_DASHBOARD = Dashboard(
    monthly_income_avg=5_622_666,
    monthly_expense_avg=4_333_333,
    monthly_cashflow_avg=1_289_333,
    net_worth=420_745_000,       # 자산합 - 부채합
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
    Loan(loan_type="전세자금대출", balance=120_000_000, monthly_payment=680_000,
         interest_rate=4.5, interest_type="고정금리", repayment_method="원리금균등",
         monthly_payment_day=25, annual_payment=8_160_000, maturity_date="2050-08-25"),
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

"""
calculations.py — 계산 엔진 (순수 Python, LLM 불필요)
cashflow_snapshot 노드에서 호출됩니다.
Image 2의 [2] Feature Extractor + [5] Final Cashflow Calculation 수식 구현.
"""

from __future__ import annotations
from mydata_schema import MyDataInput


def calculate_all_metrics(data: MyDataInput) -> dict:
    """
    마이데이터 전체에서 8개 재무 지표를 산출합니다.

    Returns:
        {
          rr_gap, rr_full,                    # OECD 소득대체율 2구간
          survival_months_now,                 # 현재 생존 여력
          survival_months_retire,              # 은퇴 후 생존 여력
          income_gap_years,                    # 소득 공백기
          dsr_now, dsr_retire,                 # DSR 재직 중 / 은퇴 후
          portfolio_deviation,                 # 포트폴리오 괴리도
          insurance_burden_retire,             # 보험료 은퇴 후 부담률
          pension_asset_ratio,                 # 연금자산 집중도
          switch_score,                        # 갈아타기 점수
          shortfall_monthly,                   # 월 부족액
          invest_risk_ratio,                   # 고위험 투자 비중
        }
    """
    p   = data.profile
    db  = data.dashboard
    pen = data.pensions
    inv = data.investments
    loans = data.loans
    ins = data.insurances
    assets = data.assets_liabilities

    # ── 1. OECD 소득대체율 (RR) ─────────────────────────
    # D: 연금 합산 (gap구간: 국민연금 제외 / full구간: 전체)
    national_monthly = next(
        (pe.expected_monthly for pe in pen if pe.pension_type == "국민연금"), 0
    )
    total_pension_full = sum(pe.expected_monthly for pe in pen)
    total_pension_gap  = total_pension_full - national_monthly

    # A: 세후 월소득 (실수령률 85% 적용)
    a = db.monthly_income_avg * 0.85

    rr_gap  = round(total_pension_gap  / a * 100, 1) if a > 0 else 0
    rr_full = round(total_pension_full / a * 100, 1) if a > 0 else 0

    # ── 2. 재무적 생존 여력 ─────────────────────────────
    # 현재: 유동자산 / 월 지출
    liquid = sum(ac.balance for ac in data.accounts)
    survival_months_now = round(liquid / db.monthly_expense_avg, 1) if db.monthly_expense_avg > 0 else 0

    # 은퇴 후: 유동자산 / 월 적자
    monthly_loan = sum(ln.monthly_payment for ln in loans)
    monthly_insurance = sum(ins_item.monthly_premium for ins_item in ins)
    post_retire_expense = db.monthly_expense_avg - monthly_loan * 0.3  # 일부 대출 상환 완료 가정
    post_retire_income  = total_pension_gap  # 공백기 기준 (더 보수적)
    monthly_deficit = max(0, post_retire_expense - post_retire_income)
    survival_months_retire = round(liquid / monthly_deficit, 1) if monthly_deficit > 0 else 99.0

    # ── 3. 소득 공백기 ──────────────────────────────────
    retire_year = int(p.retire_date[:4])
    national_start_year = int(
        next((pe.expected_start for pe in pen if pe.pension_type == "국민연금"),
             str(retire_year + 5))[:4]
    )
    income_gap_years = max(0, national_start_year - retire_year)

    # ── 4. DSR ──────────────────────────────────────────
    total_monthly_loan = sum(ln.monthly_payment for ln in loans)
    dsr_now    = round(total_monthly_loan / db.monthly_income_avg * 100, 1) if db.monthly_income_avg > 0 else 0
    dsr_retire = round(total_monthly_loan / total_pension_gap   * 100, 1) if total_pension_gap > 0 else 0

    # ── 5. 포트폴리오 괴리도 ────────────────────────────
    total_invest = sum(iv.current_value for iv in inv)
    stock_value  = sum(
        iv.current_value for iv in inv
        if iv.product_type in ("ETF", "개별주식")
    )
    actual_stock_ratio  = round(stock_value / total_invest * 100, 1) if total_invest > 0 else 0
    optimal_stock_ratio = 100 - p.age                                 # 간이 룰
    portfolio_deviation = round(actual_stock_ratio - optimal_stock_ratio, 1)

    # ── 6. 보험료 은퇴 후 부담률 ────────────────────────
    total_insurance_premium = sum(ins_item.monthly_premium for ins_item in ins)
    insurance_burden_retire = round(
        total_insurance_premium / total_pension_gap * 100, 1
    ) if total_pension_gap > 0 else 0

    # ── 7. 연금자산 집중도 ───────────────────────────────
    pension_value = sum(
        a.amount for a in assets
        if "연금" in a.item or "IRP" in a.item
    )
    net_worth = db.net_worth
    pension_asset_ratio = round(pension_value / net_worth * 100, 1) if net_worth > 0 else 0

    # ── 8. 갈아타기 점수 + 월 부족액 ────────────────────
    shortfall_monthly = max(0, db.monthly_expense_avg - total_pension_gap)

    score = 0
    if shortfall_monthly > 0:
        score += min(35, int(shortfall_monthly / db.monthly_expense_avg * 70))
    if p.years_to_retire <= 5:
        score += 20
    if db.monthly_cashflow_avg < 0:
        score += 20
    if portfolio_deviation > 15 and p.risk_tolerance == "안정형":
        score += 15
    if income_gap_years >= 3:
        score += 10

    # 비선형 승수: 다중 위험 동시 감지
    risk_flags = [
        p.age >= 65,
        survival_months_retire < 12,
        dsr_retire >= 30,
        portfolio_deviation > 15 and p.risk_tolerance == "안정형",
        income_gap_years >= 3,
    ]
    flag_count = sum(risk_flags)
    if flag_count >= 3:
        score = min(100, int(score * 1.6))
    elif flag_count >= 2:
        score = min(100, int(score * 1.3))

    # 고위험 투자 비중
    high_risk_value = sum(
        iv.current_value for iv in inv if "높음" in iv.risk_tag
    )
    invest_risk_ratio = round(high_risk_value / total_invest * 100, 1) if total_invest > 0 else 0

    return {
        "rr_gap":                  rr_gap,
        "rr_full":                 rr_full,
        "survival_months_now":     survival_months_now,
        "survival_months_retire":  survival_months_retire,
        "income_gap_years":        income_gap_years,
        "dsr_now":                 dsr_now,
        "dsr_retire":              dsr_retire,
        "portfolio_deviation":     portfolio_deviation,
        "insurance_burden_retire": insurance_burden_retire,
        "pension_asset_ratio":     pension_asset_ratio,
        "switch_score":            min(100, score),
        "shortfall_monthly":       shortfall_monthly,
        "invest_risk_ratio":       invest_risk_ratio,
    }

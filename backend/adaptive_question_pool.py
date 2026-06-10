"""
adaptive_question_pool.py — 맞춤 금융이해도/취약성 질문 Pool.

현재는 실행 graph에 연결하지 않은 TODO 설계 파일이다.
목표:
  1. CFPB 10문항 전체와 금융이해도 조사 질문을 통제 가능한 Pool로 보관한다.
  2. 향후 Question Selection Agent가 사용자 feature/계산 결과를 보고 Pool에서 5개만 선택한다.
  3. Agent는 질문을 창작하지 않고, 이 Pool의 question_id를 선택한다.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal


QuestionSource = Literal[
    "cfpb_fwb_full",
    "money_management",
    "emergency_cashflow",
    "retirement_readiness",
    "cashflow_pressure",
    "product_choice",
    "digital_finance",
    "fraud_protection",
    "financial_attitude",
    "digital_security",
    "financial_knowledge",
]

ResponseScale = Literal[
    "cfpb_p1",
    "cfpb_p2",
    "yes_no",
    "multiple_choice",
    "frequency",
    "confidence",
    "true_false_unknown",
]


@dataclass(frozen=True)
class QuestionPoolItem:
    id: str
    source: QuestionSource
    category: str
    text_ko: str
    text_en: str = ""
    response_scale: ResponseScale = "multiple_choice"
    options: list[str] = field(default_factory=list)
    reverse_coded: bool = False
    vulnerability_targets: list[str] = field(default_factory=list)
    selection_hints: list[str] = field(default_factory=list)
    scoring_note: str = ""


CFPB_P1_OPTIONS = [
    "Completely",
    "Very well",
    "Somewhat",
    "Very little",
    "Not at all",
]

CFPB_P2_OPTIONS = [
    "Always",
    "Often",
    "Sometimes",
    "Rarely",
    "Never",
]


CFPB_10_QUESTIONS: list[QuestionPoolItem] = [
    QuestionPoolItem(
        id="CFPB_01",
        source="cfpb_fwb_full",
        category="financial_wellbeing_control",
        text_en="I could handle a major unexpected expense.",
        text_ko="큰 예상치 못한 지출이 생겨도 감당할 수 있다.",
        response_scale="cfpb_p1",
        options=CFPB_P1_OPTIONS,
        vulnerability_targets=["emergency_resilience", "liquidity_buffer"],
        selection_hints=["low_liquid_assets", "low_survival_months_at_retirement"],
    ),
    QuestionPoolItem(
        id="CFPB_02",
        source="cfpb_fwb_full",
        category="financial_future",
        text_en="I am securing my financial future.",
        text_ko="나는 나의 금융적 미래를 준비하고 있다.",
        response_scale="cfpb_p1",
        options=CFPB_P1_OPTIONS,
        vulnerability_targets=["retirement_confidence", "future_planning"],
        selection_hints=["age_50_plus", "low_pension_replacement_rate", "no_private_pension"],
    ),
    QuestionPoolItem(
        id="CFPB_03",
        source="cfpb_fwb_full",
        category="financial_constraint",
        text_en="Because of my money situation, I feel like I will never have the things I want in life.",
        text_ko="돈 문제 때문에 내가 원하는 삶의 것들을 결코 갖지 못할 것처럼 느낀다.",
        response_scale="cfpb_p1",
        options=CFPB_P1_OPTIONS,
        reverse_coded=True,
        vulnerability_targets=["subjective_financial_constraint"],
        selection_hints=["high_objective_risk", "low_cashflow", "high_anxiety_possible"],
        scoring_note="CFPB official scoring reverse-codes this item.",
    ),
    QuestionPoolItem(
        id="CFPB_04",
        source="cfpb_fwb_full",
        category="money_management_enjoyment",
        text_en="I can enjoy life because of the way I'm managing my money.",
        text_ko="내가 돈을 관리하는 방식 덕분에 삶을 즐길 수 있다.",
        response_scale="cfpb_p1",
        options=CFPB_P1_OPTIONS,
        vulnerability_targets=["money_management_confidence"],
        selection_hints=["unclear_money_management", "multiple_pensions"],
    ),
    QuestionPoolItem(
        id="CFPB_05",
        source="cfpb_fwb_full",
        category="financial_survival",
        text_en="I am just getting by financially.",
        text_ko="나는 금전적으로 겨우 버티고 있다.",
        response_scale="cfpb_p1",
        options=CFPB_P1_OPTIONS,
        reverse_coded=True,
        vulnerability_targets=["subjective_cashflow_pressure"],
        selection_hints=["low_net_cashflow", "shortfall_monthly_positive"],
        scoring_note="CFPB official scoring reverse-codes this item.",
    ),
    QuestionPoolItem(
        id="CFPB_06",
        source="cfpb_fwb_full",
        category="savings_durability",
        text_en="I am concerned that the money I have or will save won't last.",
        text_ko="내가 가진 돈이나 앞으로 모을 돈이 오래가지 않을까 걱정된다.",
        response_scale="cfpb_p1",
        options=CFPB_P1_OPTIONS,
        reverse_coded=True,
        vulnerability_targets=["retirement_anxiety", "asset_duration_anxiety"],
        selection_hints=["low_asset_duration", "income_gap_years_positive", "age_50_plus"],
        scoring_note="CFPB official scoring reverse-codes this item.",
    ),
    QuestionPoolItem(
        id="CFPB_07",
        source="cfpb_fwb_full",
        category="monthly_budget_strain",
        text_en="Giving a gift for a wedding, birthday or other occasion would put a strain on my finances for the month.",
        text_ko="결혼식, 생일 등 특별한 occasion에 선물을 하면 그 달 재정에 부담이 된다.",
        response_scale="cfpb_p2",
        options=CFPB_P2_OPTIONS,
        reverse_coded=True,
        vulnerability_targets=["monthly_budget_fragility"],
        selection_hints=["low_net_cashflow", "high_essential_expense_ratio"],
        scoring_note="CFPB official scoring reverse-codes this item.",
    ),
    QuestionPoolItem(
        id="CFPB_08",
        source="cfpb_fwb_full",
        category="monthly_surplus",
        text_en="I have money left over at the end of the month.",
        text_ko="월말에 돈이 남는다.",
        response_scale="cfpb_p2",
        options=CFPB_P2_OPTIONS,
        vulnerability_targets=["monthly_surplus_awareness"],
        selection_hints=["low_net_cashflow", "cashflow_uncertain"],
    ),
    QuestionPoolItem(
        id="CFPB_09",
        source="cfpb_fwb_full",
        category="financial_management_delay",
        text_en="I am behind with my finances.",
        text_ko="나는 재정관리가 뒤처져 있다.",
        response_scale="cfpb_p2",
        options=CFPB_P2_OPTIONS,
        reverse_coded=True,
        vulnerability_targets=["money_management_delay", "bill_management"],
        selection_hints=["high_dsr", "loan_repayment_burden", "late_payment_risk"],
        scoring_note="CFPB official scoring reverse-codes this item.",
    ),
    QuestionPoolItem(
        id="CFPB_10",
        source="cfpb_fwb_full",
        category="financial_control",
        text_en="My finances control my life.",
        text_ko="내 재정상태가 내 삶을 지배한다.",
        response_scale="cfpb_p2",
        options=CFPB_P2_OPTIONS,
        reverse_coded=True,
        vulnerability_targets=["financial_stress", "subjective_control_loss"],
        selection_hints=["high_objective_risk", "high_subjective_anxiety_possible"],
        scoring_note="CFPB official scoring reverse-codes this item.",
    ),
]


FINANCIAL_LITERACY_QUESTIONS: list[QuestionPoolItem] = [
    QuestionPoolItem(
        id="QF1_A",
        source="money_management",
        category="decision_participation",
        text_ko="귀하는 평소 귀하의 돈에 대한 의사결정을 하십니까?",
        response_scale="yes_no",
        options=["예", "아니오", "가족이나 다른 사람이 주로 결정"],
        vulnerability_targets=["financial_decision_participation", "self_data_understanding"],
        selection_hints=["multiple_pensions", "unclear_product_understanding"],
    ),
    QuestionPoolItem(
        id="QF2_4",
        source="money_management",
        category="bill_and_loan_management",
        text_ko="카드대금, 대출원리금 등 곧 나올 청구서를 놓치지 않도록 메모하거나 관리하고 있습니까?",
        response_scale="yes_no",
        options=["예", "아니오"],
        vulnerability_targets=["bill_management", "delinquency_prevention"],
        selection_hints=["high_dsr", "loan_repayment_burden"],
    ),
    QuestionPoolItem(
        id="QF2_5",
        source="money_management",
        category="digital_spending_tracking",
        text_ko="은행 앱이나 자금관리 도구를 활용하여 지출상황을 파악하고 있습니까?",
        response_scale="yes_no",
        options=["예", "아니오"],
        vulnerability_targets=["digital_finance_capability", "expense_tracking"],
        selection_hints=["low_digital_usage", "cashflow_uncertain"],
    ),
    QuestionPoolItem(
        id="QF4",
        source="emergency_cashflow",
        category="emergency_expense_capacity",
        text_ko="월소득 또는 한 달 생활비 정도의 예상하지 못한 지출을 빌리지 않고 지불할 수 있습니까?",
        response_scale="yes_no",
        options=["예", "아니오", "잘 모르겠다"],
        vulnerability_targets=["minimum_cost_coverage", "emergency_resilience"],
        selection_hints=["low_liquid_assets", "low_survival_months_at_retirement"],
    ),
    QuestionPoolItem(
        id="QF9",
        source="retirement_readiness",
        category="retirement_funding_plan",
        text_ko="귀하는 노후/은퇴자금을 어떻게 마련할 계획이십니까? 은퇴자인 경우 노후자금을 어떻게 조달하고 계십니까?",
        response_scale="multiple_choice",
        options=["국민연금", "퇴직연금", "개인연금", "저축한 돈 인출", "계속 근로", "사업체 수입", "잘 모르겠다"],
        vulnerability_targets=["retirement_income_awareness", "reliable_income_understanding"],
        selection_hints=["age_50_plus", "no_private_pension", "multiple_pensions", "income_gap_years_positive"],
    ),
    QuestionPoolItem(
        id="QF13",
        source="retirement_readiness",
        category="income_loss_runway",
        text_ko="오늘 주된 소득원을 잃는다면 돈을 빌리거나 이사하지 않고 얼마나 오래 생활비를 감당할 수 있습니까?",
        response_scale="multiple_choice",
        options=["1주일 미만", "1주일~1개월", "1~3개월", "3~6개월", "6개월 이상"],
        vulnerability_targets=["income_loss_resilience", "cashflow_buffer"],
        selection_hints=["low_liquid_assets", "low_net_cashflow"],
    ),
    QuestionPoolItem(
        id="QF11",
        source="cashflow_pressure",
        category="expense_exceeds_income",
        text_ko="지난 12개월 동안 수입보다 생활비가 더 많이 든 적이 있었습니까?",
        response_scale="yes_no",
        options=["예", "아니오", "잘 모르겠다"],
        vulnerability_targets=["recent_cashflow_pressure"],
        selection_hints=["low_net_cashflow", "shortfall_monthly_positive"],
    ),
    QuestionPoolItem(
        id="QF12",
        source="cashflow_pressure",
        category="deficit_response_method",
        text_ko="가장 최근 수입보다 생활비가 더 많이 들었을 때 부족한 돈을 어떻게 조달하셨습니까?",
        response_scale="multiple_choice",
        options=["예금 인출", "지출 축소", "자산 처분", "부업/추가근로", "정부/가족 도움", "가족/친구 차입", "대출", "현금서비스/대부업", "납부 지연"],
        vulnerability_targets=["deficit_coping_quality", "high_risk_borrowing"],
        selection_hints=["low_net_cashflow", "high_dsr", "cashflow_pressure"],
    ),
    QuestionPoolItem(
        id="QP5",
        source="product_choice",
        category="comparison_behavior",
        text_ko="금융상품을 선택하기 전에 여러 금융기관의 여러 금융상품을 고려했습니까?",
        response_scale="yes_no",
        options=["예", "아니오", "잘 모르겠다"],
        vulnerability_targets=["comparison_behavior", "product_choice_literacy"],
        selection_hints=["multiple_financial_products", "investment_products_present"],
    ),
    QuestionPoolItem(
        id="QP7",
        source="product_choice",
        category="information_source_reliance",
        text_ko="금융상품 선택에 어떤 정보가 가장 큰 영향을 미쳤습니까?",
        response_scale="multiple_choice",
        options=["전문가 비교정보", "가격비교사이트", "독립투자자문", "광고", "가족/지인", "소셜미디어", "금융기관 직원"],
        vulnerability_targets=["information_source_quality", "mis-selling_vulnerability"],
        selection_hints=["investment_products_present", "high_risk_products"],
    ),
    QuestionPoolItem(
        id="QP9_1",
        source="digital_finance",
        category="online_balance_check",
        text_ko="최근 12개월 동안 온라인으로 계좌 잔액 및 거래내역을 확인한 적이 있습니까?",
        response_scale="frequency",
        options=["자주", "가끔", "거의 없음", "전혀 없음"],
        vulnerability_targets=["self_data_checking", "digital_finance_capability"],
        selection_hints=["low_digital_usage", "mydata_unfamiliar"],
    ),
    QuestionPoolItem(
        id="QP9_8",
        source="digital_finance",
        category="account_aggregation_usage",
        text_ko="최근 12개월 동안 계좌정보 통합관리 웹사이트 또는 앱을 사용한 적이 있습니까?",
        response_scale="frequency",
        options=["자주", "가끔", "거의 없음", "전혀 없음"],
        vulnerability_targets=["mydata_familiarity", "digital_finance_capability"],
        selection_hints=["mydata_unfamiliar", "multiple_accounts"],
    ),
    QuestionPoolItem(
        id="QP10_2",
        source="fraud_protection",
        category="phishing_experience",
        text_ko="지난 2년 동안 이메일, 전화, SNS 메시지로 개인 금융정보를 보냈다가 피해를 본 적이 있습니까?",
        response_scale="yes_no",
        options=["예", "아니오", "잘 모르겠다"],
        vulnerability_targets=["phishing_vulnerability", "consumer_protection_need"],
        selection_hints=["older_age", "digital_security_unknown"],
    ),
    QuestionPoolItem(
        id="QP10_10",
        source="fraud_protection",
        category="hacking_or_phishing_loss",
        text_ko="지난 2년 동안 해킹 또는 피싱으로 돈을 잃은 적이 있습니까?",
        response_scale="yes_no",
        options=["예", "아니오", "잘 모르겠다"],
        vulnerability_targets=["fraud_loss_history", "human_review_signal"],
        selection_hints=["older_age", "digital_finance_usage"],
    ),
    QuestionPoolItem(
        id="QS2_7",
        source="financial_attitude",
        category="regulated_provider_check",
        text_ko="온라인 금융상품을 구매하기 전에 공급기관이 규제되는 기관인지 점검하는 편입니까?",
        response_scale="frequency",
        options=["항상", "자주", "가끔", "거의 안 함", "전혀 안 함"],
        vulnerability_targets=["fraud_prevention_behavior", "product_literacy"],
        selection_hints=["investment_products_present", "digital_finance_usage"],
    ),
    QuestionPoolItem(
        id="QS3_7",
        source="financial_attitude",
        category="money_running_out_anxiety",
        text_ko="돈이 바닥날까 봐 걱정하는 편입니까?",
        response_scale="frequency",
        options=["항상", "자주", "가끔", "거의 아님", "전혀 아님"],
        vulnerability_targets=["subjective_financial_anxiety"],
        selection_hints=["objective_risk_low_but_anxiety_possible", "income_gap_years_positive"],
    ),
    QuestionPoolItem(
        id="QS4_1",
        source="digital_security",
        category="public_wifi_security_awareness",
        text_ko="공용 Wi-Fi로 온라인 쇼핑하는 것이 안전하다고 생각합니까?",
        response_scale="true_false_unknown",
        options=["그렇다", "아니다", "잘 모르겠다"],
        vulnerability_targets=["digital_security_awareness"],
        selection_hints=["digital_finance_usage", "older_age"],
    ),
    QuestionPoolItem(
        id="QK5",
        source="financial_knowledge",
        category="simple_interest",
        text_ko="연 2% 확정이자를 주는 비과세 정기예금에 100만 원을 넣으면 1년 뒤 얼마가 됩니까?",
        response_scale="multiple_choice",
        options=["100만 원", "102만 원", "120만 원", "잘 모르겠다"],
        vulnerability_targets=["interest_literacy"],
        selection_hints=["low_financial_knowledge_unknown"],
    ),
    QuestionPoolItem(
        id="QK7_1",
        source="financial_knowledge",
        category="risk_return",
        text_ko="수익률이 높은 투자는 상대적으로 큰 위험을 수반한다.",
        response_scale="true_false_unknown",
        options=["맞다", "틀리다", "잘 모르겠다"],
        vulnerability_targets=["risk_return_literacy"],
        selection_hints=["investment_products_present", "high_risk_products"],
    ),
    QuestionPoolItem(
        id="QK7_3",
        source="financial_knowledge",
        category="diversification",
        text_ko="다양한 주식이나 지분을 구입하면 투자위험을 줄일 수 있다.",
        response_scale="true_false_unknown",
        options=["맞다", "틀리다", "잘 모르겠다"],
        vulnerability_targets=["diversification_literacy"],
        selection_hints=["investment_products_present", "portfolio_deviation_high"],
    ),
    QuestionPoolItem(
        id="QK7_5",
        source="financial_knowledge",
        category="personal_data_targeting",
        text_ko="온라인에 공개한 개인정보가 금융제안 타깃팅에 사용될 수 있다.",
        response_scale="true_false_unknown",
        options=["맞다", "틀리다", "잘 모르겠다"],
        vulnerability_targets=["personal_data_literacy", "digital_fraud_prevention"],
        selection_hints=["digital_finance_usage", "fraud_protection_unknown"],
    ),
]


ADAPTIVE_QUESTION_POOL: list[QuestionPoolItem] = [
    *CFPB_10_QUESTIONS,
    *FINANCIAL_LITERACY_QUESTIONS,
]


@dataclass(frozen=True)
class SelectedQuestionTodo:
    """Question Selection Agent가 최종적으로 내려줘야 하는 출력 구조 TODO."""
    question: QuestionPoolItem
    reason: str
    vulnerability_to_validate: str


def select_adaptive_questions_todo(features: dict, question_pool: list[QuestionPoolItem] | None = None) -> list[SelectedQuestionTodo]:
    """TODO: 사용자 feature와 계산 결과를 보고 질문 Pool에서 정확히 5개를 선택한다.

    Intended inputs:
      - profile/user features: age, employment_status, household_size, job_type
      - calculated metrics: net_cashflow_monthly, liquid_asset_total,
        PensionReplacementRate, survival_months_at_retirement, income_gap_years,
        dsr_retire, portfolio_deviation, shortfall_monthly, invest_risk_ratio
      - product data: pensions/accounts/loans/investments presence

    Selection sketch:
      - 50대 이상 + 개인연금 없음 -> QF9 또는 CFPB_02
      - 월 잉여현금흐름 낮음 -> QF11 또는 CFPB_08
      - 유동자산 적음 -> QF4 또는 QF13
      - 대출상환 부담 높음 -> QF2_4 또는 CFPB_09
      - 금융앱 사용 흔적 낮음 -> QP9_1 또는 QP9_8
      - 연금 종류가 여러 개인데 이해도 불명확 -> QF1_A
      - 객관 위험은 낮지만 불안 가능 -> QS3_7 또는 CFPB_10
      - 객관 위험은 높지만 과신 가능 -> QF9 또는 CFPB_02

    TODO implementation rules:
      1. Never create new question text.
      2. Select from ADAPTIVE_QUESTION_POOL only.
      3. Return exactly 5 questions.
      4. Include reason and vulnerability_to_validate for each selected question.
      5. Keep CFPB official scoring separate: if the final 5 are not the official
         abbreviated CFPB set q3/q5/q6/q8/q10, do not call it an official CFPB score.
    """
    _ = features
    _ = question_pool or ADAPTIVE_QUESTION_POOL
    return []

"""Adaptive Questionnaire Agent.

This agent does not score CFPB. It reads cashflow-derived features, identifies
which user-understanding domains are still uncertain, selects questions from the
approved bank, interprets answers, and emits a dashboard priority board.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from adaptive_question_pool import ADAPTIVE_QUESTION_POOL, QuestionPoolItem
from calculations import calculate_all_metrics
from mydata_schema import MyDataInput


DOMAIN_CONFIG: dict[str, dict[str, Any]] = {
    "product_understanding": {
        "label": "금융상품 이해",
        "priority_cards": ["loan_terms", "insurance_terms", "pension_terms", "product_impact_priority"],
        "reinforced_sections": ["대출 조건", "보험 조건", "연금 조건", "퇴직금/퇴직연금"],
        "unknowns": ["loan_condition_understanding", "insurance_contract_understanding", "pension_product_understanding", "pension_income_awareness"],
        "summary": "대출·보험·연금·카드 조건 설명을 강화합니다.",
    },
    "decision_check_behavior": {
        "label": "의사결정·확인 행동",
        "priority_cards": ["decision_checklist", "comparison_table", "before_decision_checks"],
        "reinforced_sections": ["체크리스트", "비교표", "결정 전 확인"],
        "unknowns": ["comparison_behavior", "confirmation_behavior", "information_source_quality"],
        "summary": "체크리스트, 비교표, 결정 전 확인 카드를 강화합니다.",
    },
    "financial_confidence": {
        "label": "금융 자신감·실행 가능성",
        "priority_cards": ["plain_summary", "short_sentence_actions", "share_summary"],
        "reinforced_sections": ["쉬운 설명", "짧은 문장", "공유 요약"],
        "unknowns": ["financial_self_efficacy", "self_rated_financial_knowledge", "goal_execution_confidence", "explanation_preference"],
        "summary": "설명 난이도, 문장 길이, UI 단순화, 공유 요약을 조정합니다.",
    },
}


SOURCE_TO_DOMAIN = {
    "product_understanding": "product_understanding",
    "product_choice": "decision_check_behavior",
    "decision_check_behavior": "decision_check_behavior",
    "financial_confidence": "financial_confidence",
    "financial_attitude": "financial_confidence",
    "cfpb_fwb_full": "financial_confidence",
}


SERVICE_BANK_SOURCES = {
    "product_understanding",
    "decision_check_behavior",
    "financial_confidence",
}


SELECTION_VALUE_BY_TARGET_CONTEXT: dict[str, tuple[float, list[str]]] = {
    "loan_condition_understanding": (0.9, ["persona_understanding_level", "loan_explanation_detail", "dashboard_card_priority"]),
    "loan_decision_knowledge": (0.75, ["checklist_depth", "loan_guardrail"]),
    "insurance_contract_understanding": (0.85, ["fixed_expense_explanation", "insurance_card_priority"]),
    "pension_product_understanding": (0.85, ["pension_terms_explanation", "early_withdrawal_warning"]),
    "pension_income_awareness": (0.9, ["retirement_timeline_explanation", "explanation_difficulty"]),
    "product_cashflow_impact_awareness": (0.8, ["product_priority_order", "dashboard_card_priority"]),
    "retirement_lump_sum_understanding": (0.85, ["scenario_explanation_detail", "tax_and_liquidity_framing"]),
    "pension_contribution_gap_reason": (0.75, ["action_checklist", "contribution_gap_framing"]),
    "comparison_behavior": (0.8, ["comparison_table", "decision_guardrail"]),
    "information_source_quality": (0.8, ["source_quality_warning", "official_source_guidance"]),
    "condition_checking_behavior": (0.85, ["condition_checklist", "decision_guardrail"]),
    "uncertainty_handling": (0.9, ["decision_guardrail", "cta_style"]),
    "decision_owner": (0.85, ["shared_summary", "family_advisor_summary"]),
    "help_seeking_behavior": (0.75, ["advisor_connection", "report_summary"]),
    "provider_legitimacy_checking": (0.75, ["fraud_prevention_card", "provider_check_guidance"]),
    "retirement_shortfall_response_preference": (0.9, ["shortfall_scenario_order", "action_plan_priority"]),
    "lump_sum_management_preference": (0.85, ["lump_sum_scenario_order", "cash_reserve_framing"]),
    "financial_self_efficacy": (0.85, ["explanation_difficulty", "step_by_step_guidance"]),
    "self_rated_financial_knowledge": (0.9, ["terminology_depth", "plain_language_mode"]),
    "retirement_planning_confidence": (0.85, ["retirement_explanation_tone", "action_card_depth"]),
    "goal_execution_confidence": (0.9, ["checklist_granularity", "action_plan_difficulty"]),
    "emergency_fund_confidence": (0.75, ["emergency_fund_tone", "liquidity_guidance"]),
    "financial_avoidance_pressure": (0.95, ["summary_length", "progressive_disclosure", "tone_softening"]),
    "explanation_preference": (1.0, ["dashboard_presentation", "answer_format", "llm_explanation_style"]),
    "shared_summary_need": (0.9, ["shared_summary", "family_advisor_summary"]),
    "shortfall_action_confidence": (0.9, ["action_plan_difficulty", "execution_support"]),
}


NEGATIVE_ANSWER_MARKERS = (
    "아니오",
    "잘 모르",
    "모른",
    "없다",
    "없음",
    "못",
    "전혀",
    "거의",
    "미루",
    "의존",
    "추천",
    "광고",
    "유튜브",
    "SNS",
    "가족이 관리",
    "총액 정도",
    "큰 금액만",
    "감으로",
)


def _domain_for_question(item: QuestionPoolItem) -> str:
    return SOURCE_TO_DOMAIN.get(str(item.source), "financial_confidence")


def _target_context_for_question(item: QuestionPoolItem) -> str:
    return item.target_context or (item.vulnerability_targets[0] if item.vulnerability_targets else item.category)


def _selection_value_for_question(item: QuestionPoolItem, matched_hints: list[str]) -> dict[str, Any]:
    target_context = _target_context_for_question(item)
    base_score, affects = SELECTION_VALUE_BY_TARGET_CONTEXT.get(
        target_context,
        (0.65, ["llm_context", "dashboard_treatment"]),
    )
    score = min(1.0, base_score + min(0.06, len(matched_hints) * 0.02))
    return {
        "score": round(score, 2),
        "meaning": "답변이 들어오면 LLM 설명 전략과 대시보드 처리 방식이 바뀌는 정도",
        "affects": affects,
    }


def _severity_label(score: float) -> str:
    if score >= 0.7:
        return "high"
    if score >= 0.35:
        return "medium"
    return "low"


def _active_hints(data: MyDataInput, features: dict[str, Any]) -> set[str]:
    monthly_income = int(features.get("monthly_income_total", 0))
    monthly_expense = int(features.get("monthly_expense_total", 0))
    liquid = int(features.get("liquid_asset_total", 0))
    net_cashflow = int(features.get("net_cashflow_monthly", 0))
    dsr_now = float(features.get("dsr_now", 0))
    dsr_retire = float(features.get("dsr_retire", 0))
    pension_replacement = float(features.get("PensionReplacementRate", 0))

    product_count = len(data.loans) + len(data.insurances) + len(data.pensions) + len(data.investments)
    has_private_pension = int(features.get("private_pension_balance", 0)) > 0

    hints: set[str] = {
        "default_candidate",
        "high_value_default",
        "cashflow_uncertain",
        "mydata_unfamiliar",
    }
    if data.profile.age >= 50:
        hints.update({"age_50_plus", "digital_vulnerability_possible"})
    if liquid < monthly_expense * 3:
        hints.add("low_liquid_assets")
    if net_cashflow < max(300_000, monthly_expense * 0.1):
        hints.update({"low_net_cashflow", "cashflow_pressure"})
    if dsr_now >= 30 or dsr_retire >= 30:
        hints.update({"high_dsr", "loan_repayment_burden"})
    if dsr_retire >= 30:
        hints.add("dsr_retire_high")
    if data.loans:
        hints.update({"loan_repayment_burden", "loan_balance_total_positive", "any_financial_product"})
    if data.insurances:
        hints.update({"insurance_premium_positive", "any_financial_product"})
    if float(features.get("insurance_burden_retire", 0)) >= 20:
        hints.add("insurance_burden_retire_high")
    if data.pensions:
        hints.add("any_financial_product")
    if has_private_pension:
        hints.add("private_pension_balance_positive")
    if int(features.get("irp_contribution_monthly", 0)) > 0:
        hints.add("irp_contribution_positive")
    if int(features.get("pension_savings_contribution_monthly", 0)) > 0:
        hints.add("pension_savings_contribution_positive")
    if int(features.get("private_pension_contribution_monthly", 0)) <= 0 and has_private_pension:
        hints.update({"low_pension_contribution", "pension_contribution_gap_possible"})
    if int(features.get("public_pension_monthly", 0)) > 0:
        hints.add("public_pension_positive")
    if int(features.get("private_pension_monthly", 0)) > 0:
        hints.add("private_pension_positive")
    if features.get("income_gap_months", 0) > 0:
        hints.update({"income_gap_years_positive", "income_gap_months_positive"})
    if pension_replacement < 70:
        hints.add("low_pension_replacement_rate")
    if features.get("shortfall_monthly", 0) > 0 or features.get("retirement_total_shortfall_after_assets", 0) > 0:
        hints.update({"retirement_shortfall", "high_objective_risk", "shortfall_monthly_positive", "action_plan_needed", "additional_savings_needed"})
    if features.get("retirement_total_shortfall_after_assets", 0) > 0:
        hints.add("retirement_total_shortfall_after_assets_positive")
    if int(features.get("retirement_lump_sum_estimated", 0)) > 0:
        hints.add("retirement_lump_sum_positive")
    if int(features.get("retirement_lump_sum_estimated", 0)) >= max(monthly_expense * 6, monthly_income * 3):
        hints.add("retirement_lump_sum_large")
    if features.get("survival_months_at_retirement", 99) < 24:
        hints.add("low_survival_months_at_retirement")
    if len(data.pensions) >= 2:
        hints.update({"multiple_pensions", "unclear_product_understanding"})
    if data.investments:
        hints.update({"investment_products_present", "multiple_financial_products"})
    if data.insurances or data.pensions or data.loans:
        hints.add("multiple_financial_products")
    if product_count >= 4 or (data.loans and data.insurances and data.pensions):
        hints.add("product_complexity_high")
    if data.profile.household_size >= 2:
        hints.add("household_size_2_plus")
    if int(features.get("spouse_income_monthly", 0)) > 0:
        hints.add("spouse_income_present")
    hints.add("low_financial_knowledge_unknown")
    return hints


def _answered_target_contexts(answer_history: list[dict[str, Any]]) -> set[str]:
    pool_by_id = {item.id: item for item in ADAPTIVE_QUESTION_POOL}
    contexts: set[str] = set()
    for answer in answer_history or []:
        explicit = answer.get("target_context")
        if explicit:
            contexts.add(str(explicit))
        item = pool_by_id.get(str(answer.get("question_id", "")))
        if item:
            contexts.add(_target_context_for_question(item))
    return contexts


def _question_is_applicable(item: QuestionPoolItem, data: MyDataInput, features: dict[str, Any]) -> bool:
    """Trigger gate: do not ask product-specific questions when the product is absent."""
    target = _target_context_for_question(item)
    has_loans = int(features.get("loan_balance_total", 0)) > 0 or bool(data.loans)
    has_insurance = int(features.get("insurance_premium_monthly", 0)) > 0 or bool(data.insurances)
    has_private_pension = (
        int(features.get("private_pension_balance", 0)) > 0
        or int(features.get("private_pension_monthly", 0)) > 0
        or int(features.get("private_pension_contribution_monthly", 0)) > 0
    )
    has_public_pension = int(features.get("public_pension_monthly", 0)) > 0
    has_any_pension = has_private_pension or has_public_pension or bool(data.pensions)
    has_any_product = has_loans or has_insurance or has_any_pension or bool(data.investments)
    product_complexity_high = len(data.loans) + len(data.insurances) + len(data.pensions) + len(data.investments) >= 4

    if target in {"loan_condition_understanding", "loan_decision_knowledge"}:
        return has_loans
    if target == "insurance_contract_understanding":
        return has_insurance
    if target in {
        "pension_product_understanding",
        "pension_income_awareness",
        "pension_contribution_gap_reason",
    }:
        return has_any_pension
    if target == "product_cashflow_impact_awareness":
        return product_complexity_high or sum([has_loans, has_insurance, has_any_pension]) >= 2
    if target in {"retirement_lump_sum_understanding", "lump_sum_management_preference"}:
        return int(features.get("retirement_lump_sum_estimated", 0)) > 0
    if target == "condition_checking_behavior":
        return has_any_product
    if target == "decision_owner":
        return data.profile.household_size >= 2 or int(features.get("spouse_income_monthly", 0)) > 0 or product_complexity_high
    if target == "retirement_shortfall_response_preference":
        return int(features.get("shortfall_monthly", 0)) > 0 or int(features.get("retirement_total_shortfall_after_assets", 0)) > 0
    if target == "shortfall_action_confidence":
        return int(features.get("shortfall_monthly", 0)) > 0
    return True


def _answer_is_negative(answer: Any) -> bool:
    if isinstance(answer, list):
        answer_text = " ".join(str(item) for item in answer)
    else:
        answer_text = str(answer)
    return any(marker in answer_text for marker in NEGATIVE_ANSWER_MARKERS)


def interpret_answers(answer_history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pool_by_id = {item.id: item for item in ADAPTIVE_QUESTION_POOL}
    insights = []
    for answer in answer_history or []:
        question_id = str(answer.get("question_id", ""))
        item = pool_by_id.get(question_id)
        if not item:
            continue
        domain = _domain_for_question(item)
        if domain not in DOMAIN_CONFIG:
            continue
        negative = _answer_is_negative(answer.get("answer"))
        insights.append({
            "question_id": question_id,
            "domain": domain,
            "target_context": _target_context_for_question(item),
            "raw_answer": answer.get("answer"),
            "signals": {
                "gap_confirmed": negative,
                "needs_plain_explanation": negative or domain == "financial_confidence",
                "dashboard_effect": DOMAIN_CONFIG[domain]["priority_cards"],
            },
        })
    return insights


def diagnose_domain_gaps(
    data: MyDataInput,
    features: dict[str, Any],
    answer_history: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    monthly_income = max(1, int(features.get("monthly_income_total", 0)))
    monthly_expense = int(features.get("monthly_expense_total", 0))
    liquid = int(features.get("liquid_asset_total", 0))
    net_cashflow = int(features.get("net_cashflow_monthly", 0))
    dsr = max(float(features.get("dsr_now", 0)), float(features.get("dsr_retire", 0)))
    pension_replacement = float(features.get("PensionReplacementRate", 0))
    income_gap_months = int(features.get("income_gap_months", 0))
    shortfall = int(features.get("shortfall_monthly", 0))

    scores = {
        "product_understanding": 0.0,
        "decision_check_behavior": 0.0,
        "financial_confidence": 0.0,
    }
    evidence: dict[str, list[str]] = {domain: [] for domain in scores}

    if data.loans:
        scores["product_understanding"] += 0.2
        evidence["product_understanding"].append("대출 상품 보유")
    if data.insurances:
        scores["product_understanding"] += 0.15
        evidence["product_understanding"].append("보험 상품 보유")
    if len(data.pensions) >= 2:
        scores["product_understanding"] += 0.2
        evidence["product_understanding"].append("여러 종류의 연금 보유")
    if int(features.get("retirement_lump_sum_estimated", 0)) > 0:
        scores["product_understanding"] += 0.1
        evidence["product_understanding"].append("퇴직금/퇴직수당 의사결정 필요")
    if monthly_expense / monthly_income > 0.75:
        scores["product_understanding"] += 0.1
        evidence["product_understanding"].append("상품성 지출이 생활비 압박과 연결될 수 있음")

    if data.loans or data.pensions or data.insurances or data.investments:
        scores["decision_check_behavior"] += 0.25
        evidence["decision_check_behavior"].append("비교·확인이 필요한 금융상품 보유")
    if len(data.pensions) + len(data.loans) + len(data.insurances) >= 4:
        scores["decision_check_behavior"] += 0.2
        evidence["decision_check_behavior"].append("관리해야 할 금융상품 수가 많음")
    if shortfall > 0 or income_gap_months > 0:
        scores["decision_check_behavior"] += 0.15
        evidence["decision_check_behavior"].append("부족액/소득공백 대응 방식 확인 필요")

    if net_cashflow < max(300_000, monthly_expense * 0.1) or shortfall > 0 or income_gap_months > 0:
        scores["financial_confidence"] += 0.25
        evidence["financial_confidence"].append("현금흐름/은퇴 계산값을 이해 가능한 방식으로 전달할 필요")
    if data.profile.age >= 60:
        scores["financial_confidence"] += 0.1
        evidence["financial_confidence"].append("고령 사용자에게 더 쉬운 설명이 필요할 수 있음")

    for insight in interpret_answers(answer_history or []):
        if insight["signals"]["gap_confirmed"]:
            scores[insight["domain"]] += 0.25
            evidence[insight["domain"]].append(f"{insight['question_id']} 답변으로 부족 신호 확인")

    gaps = []
    for domain, score in scores.items():
        config = DOMAIN_CONFIG[domain]
        normalized = min(1.0, score)
        gaps.append({
            "domain": domain,
            "label": config["label"],
            "severity": _severity_label(normalized),
            "score": round(normalized, 3),
            "evidence": evidence[domain] or ["기본 확인 영역"],
            "known_from_data": bool(evidence[domain]),
            "unknowns_to_ask": config["unknowns"],
            "dashboard_effect": {
                "priority_cards": config["priority_cards"],
                "reinforced_sections": config["reinforced_sections"],
                "summary": config["summary"],
            },
        })
    return sorted(gaps, key=lambda gap: (-gap["score"], gap["domain"]))


def _question_reason(gap: dict[str, Any], item: QuestionPoolItem, matched_hints: list[str]) -> str:
    if matched_hints:
        return f"{gap['label']} 부족 신호와 {', '.join(matched_hints[:3])} 근거가 있어 확인합니다."
    return f"{gap['label']} 영역에서 {item.vulnerability_targets[0] if item.vulnerability_targets else item.category}을 확인합니다."


def select_questions(
    data: MyDataInput,
    features: dict[str, Any],
    domain_gaps: list[dict[str, Any]],
    answer_history: list[dict[str, Any]] | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    answered_ids = {str(answer.get("question_id", "")) for answer in answer_history or []}
    answered_contexts = _answered_target_contexts(answer_history or [])
    active_hints = _active_hints(data, features)
    gap_by_domain = {gap["domain"]: gap for gap in domain_gaps}

    scored: list[tuple[float, list[str], QuestionPoolItem]] = []
    for item in ADAPTIVE_QUESTION_POOL:
        if item.id in answered_ids:
            continue
        if str(item.source) not in SERVICE_BANK_SOURCES:
            continue
        domain = _domain_for_question(item)
        if domain not in DOMAIN_CONFIG:
            continue
        target_context = _target_context_for_question(item)
        if target_context in answered_contexts:
            continue
        if not _question_is_applicable(item, data, features):
            continue
        gap = gap_by_domain.get(domain)
        if not gap:
            continue
        matched = sorted(set(item.selection_hints) & active_hints)
        service_bank_bonus = 4.0 if str(item.source) in SERVICE_BANK_SOURCES else 0
        selection_value = _selection_value_for_question(item, matched)
        score = (
            float(gap["score"]) * 10
            + len(matched) * 2
            + service_bank_bonus
            + float(selection_value["score"]) * 5
        )
        scored.append((score, matched, item))

    selected: list[tuple[float, list[str], QuestionPoolItem]] = []
    used_domains: set[str] = set()
    for score, matched, item in sorted(scored, key=lambda row: (-row[0], row[2].id)):
        domain = _domain_for_question(item)
        if domain in used_domains and len(used_domains) < min(limit, len(DOMAIN_CONFIG)):
            continue
        selected.append((score, matched, item))
        used_domains.add(domain)
        if len(selected) >= limit:
            break

    if len(selected) < limit:
        selected_ids = {item.id for _, _, item in selected}
        for score, matched, item in sorted(scored, key=lambda row: (-row[0], row[2].id)):
            if item.id in selected_ids:
                continue
            selected.append((score, matched, item))
            selected_ids.add(item.id)
            if len(selected) >= limit:
                break

    questions = []
    for _, matched, item in selected[:limit]:
        domain = _domain_for_question(item)
        gap = gap_by_domain[domain]
        config = DOMAIN_CONFIG[domain]
        selection_value = _selection_value_for_question(item, matched)
        questions.append({
            "question_id": item.id,
            "source": item.source,
            "domain": domain,
            "domain_label": config["label"],
            "category": item.category,
            "target_context": _target_context_for_question(item),
            "text_ko": item.text_ko,
            "text_en": item.text_en,
            "response_scale": item.response_scale,
            "options": item.options,
            "reverse_coded": item.reverse_coded,
            "reason": _question_reason(gap, item, matched),
            "vulnerability_to_validate": item.vulnerability_targets[0] if item.vulnerability_targets else "",
            "selection_value": selection_value,
            "dashboard_effect": {
                "priority_cards": config["priority_cards"],
                "reinforced_sections": config["reinforced_sections"],
                "summary": config["summary"],
            },
        })
    return questions


def build_priority_board(domain_gaps: list[dict[str, Any]], answer_insights: list[dict[str, Any]]) -> dict[str, Any]:
    primary = domain_gaps[0]
    card_order: list[str] = []
    reinforced_sections: list[str] = []
    for gap in domain_gaps:
        effect = gap["dashboard_effect"]
        for card in effect["priority_cards"]:
            if card not in card_order:
                card_order.append(card)
        for section in effect["reinforced_sections"]:
            if section not in reinforced_sections:
                reinforced_sections.append(section)

    low_confidence = any(
        insight["domain"] == "financial_confidence" and insight["signals"]["gap_confirmed"]
        for insight in answer_insights
    )
    plain_mode = primary["domain"] == "financial_confidence" or low_confidence

    return {
        "primary_domain": primary["domain"],
        "primary_label": primary["label"],
        "primary_message": f"{primary['label']} 영역을 먼저 정리해야 합니다.",
        "severity": primary["severity"],
        "why_now": " / ".join(primary["evidence"][:3]),
        "card_order": card_order,
        "reinforced_sections": reinforced_sections,
        "confirmed_by_answers": [
            f"{insight['question_id']}: {insight['raw_answer']}"
            for insight in answer_insights
            if insight["signals"]["gap_confirmed"]
        ],
        "explanation_profile": {
            "difficulty": "easy" if plain_mode else "normal",
            "sentence_length": "short" if plain_mode else "normal",
            "show_checklist": primary["domain"] in {"decision_check_behavior", "product_understanding"},
            "show_comparison_table": primary["domain"] in {"decision_check_behavior", "product_understanding"},
            "share_summary": primary["domain"] == "financial_confidence" or plain_mode,
        },
    }


def build_persona_context(features: dict[str, Any]) -> dict[str, Any]:
    return {
        "current_cashflow": {
            "monthly_income_total": features.get("monthly_income_total", 0),
            "monthly_expense_total": features.get("monthly_expense_total", 0),
            "net_cashflow_monthly": features.get("net_cashflow_monthly", 0),
            "cashflow_volatility_12m": features.get("cashflow_volatility_12m", 0),
            "average_month_end_balance_12m": features.get("average_month_end_balance_12m", 0),
            "emergency_fund_gap_to_3m": features.get("emergency_fund_gap_to_3m", 0),
            "liquid_asset_total": features.get("liquid_asset_total", 0),
            "dsr_now": features.get("dsr_now", 0),
        },
        "retirement_preparedness": {
            "retirement_age": features.get("retirement_age", 60),
            "public_pension_start_age": features.get("public_pension_start_age", 0),
            "public_pension_start_month": features.get("public_pension_start_month", ""),
            "income_gap_months": features.get("income_gap_months", 0),
            "pension_replacement_rate": features.get("pension_replacement_rate", 0),
            "shortfall_monthly": features.get("shortfall_monthly", 0),
            "post_retire_expense_monthly": features.get("post_retire_expense_monthly", 0),
            "post_retirement_loan_repayment_monthly": features.get("post_retirement_loan_repayment_monthly", 0),
            "retirement_total_shortfall_after_assets": features.get("retirement_total_shortfall_after_assets", 0),
            "survival_months_at_retirement": features.get("survival_months_at_retirement", 0),
        },
    }


def build_adaptive_questionnaire_state(
    mydata_raw: dict,
    answer_history: list[dict[str, Any]] | None = None,
    limit: int = 5,
    retirement_age: int | None = None,
    target_monthly_expense: int | None = None,
) -> dict[str, Any]:
    data = MyDataInput.from_dict(mydata_raw)
    features = calculate_all_metrics(
        data,
        retirement_age=retirement_age,
        target_monthly_expense=target_monthly_expense,
    )
    answer_history = answer_history or []
    answer_insights = interpret_answers(answer_history)
    domain_gaps = diagnose_domain_gaps(data, features, answer_history)
    questions = select_questions(data, features, domain_gaps, answer_history, limit)
    priority_board = build_priority_board(domain_gaps, answer_insights)
    persona_context = build_persona_context(features)

    return {
        "selection_mode": "adaptive_questionnaire_agent",
        "llm_used": False,
        "llm_error": "",
        "question_count": len(questions),
        "questions": questions,
        "domain_gaps": domain_gaps,
        "answer_insights": answer_insights,
        "priority_board": priority_board,
        "persona_context": persona_context,
        "source_profile": asdict(data.profile),
    }

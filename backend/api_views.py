"""Backend API view builders for status, adaptive questions, and dashboard data."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date
import json
from math import ceil
from typing import Any

from adaptive_question_pool import ADAPTIVE_QUESTION_POOL, QuestionPoolItem
from adaptive_questionnaire_agent import build_adaptive_questionnaire_state
from calculations import calculate_all_metrics
from mydata_schema import MyDataInput


RETIREMENT_AGE_DEFAULT = 60


def _parse_year_month(value: str) -> tuple[int, int] | None:
    if not value:
        return None
    try:
        year, month = value[:7].split("-")
        return int(year), int(month)
    except Exception:
        return None


def _month_index(year_month: tuple[int, int]) -> int:
    year, month = year_month
    return year * 12 + month - 1


def _add_months(year_month: tuple[int, int], months: int) -> tuple[int, int]:
    idx = _month_index(year_month) + months
    return idx // 12, idx % 12 + 1


def _format_year_month(year_month: tuple[int, int]) -> str:
    return f"{year_month[0]:04d}-{year_month[1]:02d}"


def _reference_month(data: MyDataInput) -> tuple[int, int]:
    ref = data.profile.age_reference_date or ""
    if len(ref) >= 7:
        parsed = _parse_year_month(ref)
        if parsed:
            return parsed
    today = date.today()
    return today.year, today.month


def _birth_month(data: MyDataInput, reference_month: tuple[int, int]) -> tuple[int, int]:
    birth = data.profile.birth_date or ""
    parsed = _parse_year_month(birth)
    if parsed:
        return parsed
    return reference_month[0] - data.profile.age, reference_month[1]


def _age_at_month(data: MyDataInput, month_offset: int) -> float:
    return round(data.profile.age + month_offset / 12, 2)


def _months_until_age(data: MyDataInput, target_age: float) -> int:
    return max(0, int(round((target_age - data.profile.age) * 12)))


def _pension_start_month_for_private(pension) -> tuple[int, int] | None:
    if pension.scheme_group == "private_pension" or pension.pension_type in (
        "IRP",
        "개인연금",
        "개인연금저축",
        "퇴직연금",
    ):
        return _parse_year_month(pension.expected_start)
    return None


def _loan_active_payment(loan, current_month: tuple[int, int]) -> int:
    if loan.monthly_payment <= 0:
        return 0
    maturity = _parse_year_month(loan.maturity_date)
    if maturity is None:
        return loan.monthly_payment
    return loan.monthly_payment if _month_index(current_month) <= _month_index(maturity) else 0


def _financial_asset_total(features: dict[str, Any]) -> int:
    return int(
        features.get("deposit_balance_total", 0)
        + features.get("investment_balance_total", 0)
        + features.get("private_pension_balance", 0)
    )


def _life_expectancy_age(features: dict[str, Any]) -> float:
    return float(features.get("life_expectancy_age", 90) or 90)


def parse_mydata_and_features(
    mydata_raw: dict,
    retirement_age: int | None = None,
    target_monthly_expense: int | None = None,
) -> tuple[MyDataInput, dict[str, Any]]:
    data = MyDataInput.from_dict(mydata_raw)
    return data, calculate_all_metrics(
        data,
        retirement_age=retirement_age,
        target_monthly_expense=target_monthly_expense,
    )


def build_status_check(mydata_raw: dict) -> dict[str, Any]:
    """현황확인 API payload."""
    _, features = parse_mydata_and_features(mydata_raw)
    expected_monthly_pension = int(
        features.get("private_pension_monthly", 0)
        + features.get("public_pension_monthly", 0)
    )
    return {
        "expected_monthly_pension": expected_monthly_pension,
        "expected_monthly_pension_start_age": int(features.get("public_pension_start_age", 0)),
        "financial_asset_total": _financial_asset_total(features),
        "loan_balance_total": int(features.get("loan_balance_total", 0)),
        "current_monthly_living_expense": int(features.get("monthly_expense_total", 0)),
        "currency": "KRW",
    }


def _active_question_hints(data: MyDataInput, features: dict[str, Any]) -> set[str]:
    monthly_expense = int(features.get("monthly_expense_total", 0))
    liquid = int(features.get("liquid_asset_total", 0))
    net_cashflow = int(features.get("net_cashflow_monthly", 0))
    dsr_now = float(features.get("dsr_now", 0))
    dsr_retire = float(features.get("dsr_retire", 0))
    private_pension_balance = int(features.get("private_pension_balance", 0))
    private_pension_monthly = int(features.get("private_pension_monthly", 0))
    pension_count = len(data.pensions)
    account_count = len(data.accounts)
    has_investment = bool(data.investments)
    has_loans = bool(data.loans)

    hints: set[str] = set()
    if data.profile.age >= 50:
        hints.add("age_50_plus")
    if data.profile.age >= 60:
        hints.add("older_age")
    if private_pension_balance <= 0 and private_pension_monthly <= 0:
        hints.add("no_private_pension")
    if pension_count >= 3:
        hints.update({"multiple_pensions", "unclear_product_understanding"})
    if account_count >= 2:
        hints.add("multiple_accounts")
    if has_investment:
        hints.update({"investment_products_present", "multiple_financial_products"})
    if liquid < monthly_expense * 3:
        hints.add("low_liquid_assets")
    if net_cashflow < max(300_000, monthly_expense * 0.1):
        hints.update({"low_net_cashflow", "cashflow_pressure"})
    if features.get("income_gap_months", 0) > 0:
        hints.add("income_gap_years_positive")
    if features.get("survival_months_at_retirement", 99) < 24:
        hints.add("low_survival_months_at_retirement")
    if features.get("shortfall_monthly", 0) > 0:
        hints.add("shortfall_monthly_positive")
    if dsr_now >= 30 or dsr_retire >= 30:
        hints.update({"high_dsr", "loan_repayment_burden"})
    if has_loans:
        hints.add("loan_repayment_burden")
    if features.get("retirement_total_shortfall_after_assets", 0) > 0:
        hints.add("high_objective_risk")
    hints.update({"mydata_unfamiliar", "cashflow_uncertain"})
    return hints


def _question_reason(matched_hints: list[str], item: QuestionPoolItem) -> str:
    if matched_hints:
        return f"현재 스냅샷에서 {', '.join(matched_hints[:3])} 신호가 있어 이 취약성을 확인합니다."
    if item.vulnerability_targets:
        return f"{item.vulnerability_targets[0]} 취약성을 기본 확인하기 위한 질문입니다."
    return "사용자 금융 이해도와 주관적 취약성을 확인하기 위한 기본 질문입니다."


def _rule_based_question_selection(
    data: MyDataInput,
    features: dict[str, Any],
    limit: int,
) -> list[dict[str, str]]:
    active_hints = _active_question_hints(data, features)

    scored = []
    for item in ADAPTIVE_QUESTION_POOL:
        matched = sorted(set(item.selection_hints) & active_hints)
        score = len(matched) * 10
        if item.source == "cfpb_fwb_full":
            score += 2
        if item.category in {"retirement_funding_plan", "emergency_expense_capacity"}:
            score += 3
        scored.append((score, matched, item))

    selected: list[tuple[int, list[str], QuestionPoolItem]] = []
    used_categories: set[str] = set()
    for score, matched, item in sorted(scored, key=lambda row: (-row[0], row[2].id)):
        if len(selected) >= limit:
            break
        if item.category in used_categories and len(selected) < limit - 1:
            continue
        selected.append((score, matched, item))
        used_categories.add(item.category)

    if len(selected) < limit:
        selected_ids = {item.id for _, _, item in selected}
        for score, matched, item in sorted(scored, key=lambda row: row[2].id):
            if item.id not in selected_ids:
                selected.append((score, matched, item))
                selected_ids.add(item.id)
            if len(selected) >= limit:
                break

    selections = []
    for _, matched, item in selected[:limit]:
        selections.append({
            "question_id": item.id,
            "reason": _question_reason(matched, item),
            "vulnerability_to_validate": item.vulnerability_targets[0] if item.vulnerability_targets else "",
        })
    return selections


def _question_pool_for_prompt() -> list[dict[str, Any]]:
    return [
        {
            "question_id": item.id,
            "source": item.source,
            "category": item.category,
            "text_ko": item.text_ko,
            "response_scale": item.response_scale,
            "options": item.options,
            "reverse_coded": item.reverse_coded,
            "vulnerability_targets": item.vulnerability_targets,
            "selection_hints": item.selection_hints,
        }
        for item in ADAPTIVE_QUESTION_POOL
    ]


def _snapshot_for_question_agent(data: MyDataInput, features: dict[str, Any]) -> dict[str, Any]:
    return {
        "profile": {
            "age": data.profile.age,
            "region": data.profile.region,
            "household_size": data.profile.household_size,
            "employment_status": data.profile.employment_status,
            "job_type": data.profile.job_type,
        },
        "assets": {
            "financial_asset_total": _financial_asset_total(features),
            "liquid_asset_total": features.get("liquid_asset_total", 0),
            "semi_liquid_asset_total": features.get("semi_liquid_asset_total", 0),
            "private_pension_balance": features.get("private_pension_balance", 0),
        },
        "cashflow": {
            "monthly_income_total": features.get("monthly_income_total", 0),
            "monthly_expense_total": features.get("monthly_expense_total", 0),
            "net_cashflow_monthly": features.get("net_cashflow_monthly", 0),
            "shortfall_monthly": features.get("shortfall_monthly", 0),
        },
        "debt": {
            "loan_balance_total": features.get("loan_balance_total", 0),
            "monthly_repayment_total": features.get("monthly_repayment_total", 0),
            "dsr_now": features.get("dsr_now", 0),
            "dsr_retire": features.get("dsr_retire", 0),
        },
        "retirement": {
            "PensionReplacementRate": features.get("PensionReplacementRate", 0),
            "private_pension_monthly": features.get("private_pension_monthly", 0),
            "public_pension_monthly": features.get("public_pension_monthly", 0),
            "applied_public_pension_type": features.get("applied_public_pension_type", ""),
            "public_pension_start_month": features.get("public_pension_start_month", ""),
            "income_gap_months": features.get("income_gap_months", 0),
            "survival_months_at_retirement": features.get("survival_months_at_retirement", 0),
            "retirement_total_shortfall_after_assets": features.get("retirement_total_shortfall_after_assets", 0),
        },
        "product_presence": {
            "pension_count": len(data.pensions),
            "account_count": len(data.accounts),
            "loan_count": len(data.loans),
            "investment_count": len(data.investments),
        },
    }


def _parse_llm_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def _call_question_selection_llm(
    snapshot: dict[str, Any],
    question_pool: list[dict[str, Any]],
    limit: int,
) -> list[dict[str, str]]:
    """LLM question selection agent. It may select ids only; server hydrates text."""
    from agents import _llm_text

    prompt = f"""
당신은 금융 이해도/취약성 맞춤 질문 선택 Agent입니다.

목표:
- 사용자 스냅샷을 보고 question_pool 안에서만 질문 {limit}개를 선택하세요.
- 절대 새 질문을 만들지 마세요.
- question_id는 반드시 question_pool에 존재하는 id만 사용하세요.
- 서로 다른 취약성을 확인하도록 질문을 구성하세요.
- 답변 저장 이후 활용은 아직 정해지지 않았으므로, 점수 계산이나 조언은 하지 마세요.

사용자 스냅샷:
{json.dumps(snapshot, ensure_ascii=False)}

question_pool:
{json.dumps(question_pool, ensure_ascii=False)}

JSON으로만 응답하세요.
형식:
{{
  "selections": [
    {{
      "question_id": "CFPB_06",
      "reason": "이 질문을 선택한 구체적 이유",
      "vulnerability_to_validate": "검증하려는 취약성"
    }}
  ]
}}
"""
    parsed = _parse_llm_json(_llm_text(prompt, max_tokens=1200, json_mode=True))
    raw_selections = parsed.get("selections", [])
    if not isinstance(raw_selections, list):
        return []
    return [
        {
            "question_id": str(item.get("question_id", "")),
            "reason": str(item.get("reason", "")),
            "vulnerability_to_validate": str(item.get("vulnerability_to_validate", "")),
        }
        for item in raw_selections
        if isinstance(item, dict)
    ]


def _apply_llm_question_selection(payload: dict[str, Any], limit: int) -> dict[str, Any]:
    """Use the LLM as the final question selector over deterministic candidates."""
    candidate_questions = payload.get("questions", [])
    if not candidate_questions:
        return payload

    question_pool = [
        {
            "question_id": question.get("question_id"),
            "domain": question.get("domain"),
            "domain_label": question.get("domain_label"),
            "category": question.get("category"),
            "target_context": question.get("target_context"),
            "text_ko": question.get("text_ko"),
            "response_scale": question.get("response_scale"),
            "options": question.get("options"),
            "reason": question.get("reason"),
            "selection_value": question.get("selection_value"),
            "dashboard_effect": question.get("dashboard_effect"),
        }
        for question in candidate_questions
    ]
    snapshot = {
        "domain_gaps": payload.get("domain_gaps", []),
        "persona_context": payload.get("persona_context", {}),
        "context_profile": payload.get("context_profile", {}),
        "dashboard_treatment": payload.get("dashboard_treatment", {}),
        "priority_board": payload.get("priority_board", {}),
        "answer_insights": payload.get("answer_insights", []),
    }

    llm_selections = _call_question_selection_llm(snapshot, question_pool, limit)
    by_id = {question.get("question_id"): question for question in candidate_questions}
    selected_questions = []
    seen: set[str] = set()

    for selection in llm_selections:
        question_id = selection.get("question_id", "")
        question = by_id.get(question_id)
        if not question or question_id in seen:
            continue
        enriched = dict(question)
        if selection.get("reason"):
            enriched["reason"] = selection["reason"]
        if selection.get("vulnerability_to_validate"):
            enriched["vulnerability_to_validate"] = selection["vulnerability_to_validate"]
        selected_questions.append(enriched)
        seen.add(question_id)
        if len(selected_questions) >= limit:
            break

    for question in candidate_questions:
        question_id = question.get("question_id", "")
        if len(selected_questions) >= limit:
            break
        if question_id not in seen:
            selected_questions.append(question)
            seen.add(question_id)

    payload = dict(payload)
    payload["selection_mode"] = "llm_adaptive_question_selector"
    payload["llm_used"] = True
    payload["llm_error"] = ""
    payload["questions"] = selected_questions[:limit]
    payload["question_count"] = len(payload["questions"])
    return payload


def _hydrate_question_selections(
    llm_selections: list[dict[str, str]],
    fallback_selections: list[dict[str, str]],
    limit: int,
) -> list[dict[str, Any]]:
    pool_by_id = {item.id: item for item in ADAPTIVE_QUESTION_POOL}
    selections: list[dict[str, str]] = []
    seen: set[str] = set()

    for candidate in [*llm_selections, *fallback_selections]:
        question_id = candidate.get("question_id", "")
        if question_id in pool_by_id and question_id not in seen:
            selections.append(candidate)
            seen.add(question_id)
        if len(selections) >= limit:
            break

    questions = []
    for selection in selections[:limit]:
        item = pool_by_id[selection["question_id"]]
        questions.append({
            "question_id": item.id,
            "source": item.source,
            "category": item.category,
            "text_ko": item.text_ko,
            "text_en": item.text_en,
            "response_scale": item.response_scale,
            "options": item.options,
            "reverse_coded": item.reverse_coded,
            "reason": selection.get("reason") or "LLM question selection agent가 현재 스냅샷에 맞춰 선택했습니다.",
            "vulnerability_to_validate": (
                selection.get("vulnerability_to_validate")
                or (item.vulnerability_targets[0] if item.vulnerability_targets else "")
            ),
        })
    return questions


def select_custom_questions(
    mydata_raw: dict,
    limit: int = 5,
    use_llm: bool = True,
    answer_history: list[dict[str, Any]] | None = None,
    retirement_age: int | None = None,
    target_monthly_expense: int | None = None,
) -> dict[str, Any]:
    """Adaptive questionnaire payload constrained to the approved question bank."""
    candidate_limit = max(limit, 8) if use_llm else limit
    payload = build_adaptive_questionnaire_state(
        mydata_raw=mydata_raw,
        answer_history=answer_history or [],
        limit=candidate_limit,
        retirement_age=retirement_age,
        target_monthly_expense=target_monthly_expense,
    )
    if use_llm:
        try:
            payload = _apply_llm_question_selection(payload, limit)
        except Exception as e:
            payload = dict(payload)
            payload["llm_used"] = False
            payload["llm_error"] = str(e)
            payload["questions"] = payload.get("questions", [])[:limit]
            payload["question_count"] = len(payload["questions"])
    _log_adaptive_questionnaire_selection(payload)
    return payload


def _log_adaptive_questionnaire_selection(payload: dict[str, Any]) -> None:
    """Emit human-readable selection reasoning to Docker stdout."""
    board = payload.get("priority_board", {})
    print(
        "[AdaptiveQ] "
        f"selection_mode={payload.get('selection_mode')} "
        f"primary_domain={board.get('primary_domain')} "
        f"primary_label={board.get('primary_label')} "
        f"severity={board.get('severity')} "
        f"why_now={board.get('why_now')}",
        flush=True,
    )

    for index, gap in enumerate(payload.get("domain_gaps", [])[:5], start=1):
        evidence = " | ".join(str(item) for item in gap.get("evidence", [])[:3])
        effect = gap.get("dashboard_effect", {})
        cards = ",".join(effect.get("priority_cards", [])[:4])
        print(
            "[AdaptiveQ] "
            f"gap#{index} domain={gap.get('domain')} "
            f"label={gap.get('label')} "
            f"score={gap.get('score')} "
            f"severity={gap.get('severity')} "
            f"evidence={evidence} "
            f"cards={cards}",
            flush=True,
        )

    for index, question in enumerate(payload.get("questions", []), start=1):
        cards = ",".join(question.get("dashboard_effect", {}).get("priority_cards", [])[:4])
        selection_value = question.get("selection_value", {})
        print(
            "[AdaptiveQ] "
            f"selected#{index} id={question.get('question_id')} "
            f"domain={question.get('domain')} "
            f"category={question.get('category')} "
            f"target_context={question.get('target_context')} "
            f"selection_value={selection_value.get('score')} "
            f"target={question.get('vulnerability_to_validate')} "
            f"reason={question.get('reason')} "
            f"cards={cards}",
            flush=True,
        )

    for insight in payload.get("answer_insights", []):
        print(
            "[AdaptiveQ] "
            f"answer id={insight.get('question_id')} "
            f"domain={insight.get('domain')} "
            f"gap_confirmed={insight.get('signals', {}).get('gap_confirmed')} "
            f"raw_answer={insight.get('raw_answer')}",
            flush=True,
        )


def build_asset_projection_dashboard(
    mydata_raw: dict,
    retirement_age: int | None = None,
    target_monthly_expense: int | None = None,
) -> dict[str, Any]:
    """Build result dashboard values and monthly-to-yearly asset projection."""
    data, features = parse_mydata_and_features(
        mydata_raw,
        retirement_age=retirement_age,
        target_monthly_expense=target_monthly_expense,
    )
    retirement_age = int(retirement_age or features.get("retirement_age", RETIREMENT_AGE_DEFAULT))
    status = build_status_check(mydata_raw)
    expected_monthly_pension = int(
        features.get("private_pension_monthly", 0)
        + features.get("public_pension_monthly", 0)
    )

    reference_month = _reference_month(data)
    birth_month = _birth_month(data, reference_month)
    life_age = _life_expectancy_age(features)
    max_months = max(0, int(ceil((life_age - data.profile.age) * 12)))
    retirement_month_offset = _months_until_age(data, retirement_age)
    retirement_month = _add_months(reference_month, retirement_month_offset)
    retirement_lump_sum = int(features.get("retirement_lump_sum_estimated", 0))
    current_assets = _financial_asset_total(features)
    non_loan_living_expense = int(
        target_monthly_expense
        or max(0, int(features.get("monthly_expense_total", 0)) - int(features.get("monthly_repayment_total", 0)))
    )

    private_pensions = [
        (pension.expected_monthly, _pension_start_month_for_private(pension))
        for pension in data.pensions
        if _pension_start_month_for_private(pension) is not None
    ]
    public_start = _parse_year_month(str(features.get("public_pension_start_month", "")))
    public_pension = int(features.get("public_pension_monthly", 0))

    monthly_points = []
    yearly_points = []
    shortage_month_offset: int | None = None
    asset_balance = current_assets
    lump_sum_added = False

    for month_offset in range(max_months + 1):
        current_month = _add_months(reference_month, month_offset)
        age = _age_at_month(data, month_offset)

        if not lump_sum_added and month_offset >= retirement_month_offset:
            asset_balance += retirement_lump_sum
            lump_sum_added = True

        if month_offset == 0:
            monthly_points.append((month_offset, current_month, age, asset_balance))
        else:
            before_retirement = month_offset < retirement_month_offset
            income = int(features.get("monthly_income_total", 0)) if before_retirement else 0
            if not before_retirement:
                for monthly_amount, start_month in private_pensions:
                    if start_month and _month_index(current_month) >= _month_index(start_month):
                        income += int(monthly_amount)
                if public_start and _month_index(current_month) >= _month_index(public_start):
                    income += public_pension

            active_loan_payment = sum(_loan_active_payment(loan, current_month) for loan in data.loans)
            outflow = non_loan_living_expense + active_loan_payment
            asset_balance += income - outflow
            monthly_points.append((month_offset, current_month, age, asset_balance))

        if shortage_month_offset is None and asset_balance < 0:
            shortage_month_offset = month_offset

        if month_offset % 12 == 0 or month_offset == max_months:
            yearly_points.append({
                "age": round(age, 1),
                "year_month": _format_year_month(current_month),
                "asset_balance": int(round(asset_balance)),
                "asset_balance_manwon": round(asset_balance / 10_000, 1),
                "is_shortage_point": False,
            })

    shortage_age = None
    shortage_year_month = None
    if shortage_month_offset is not None:
        shortage_month = _add_months(reference_month, shortage_month_offset)
        shortage_age = _age_at_month(data, shortage_month_offset)
        shortage_year_month = _format_year_month(shortage_month)
        yearly_points.append({
            "age": round(shortage_age, 1),
            "year_month": shortage_year_month,
            "asset_balance": int(round(monthly_points[shortage_month_offset][3])),
            "asset_balance_manwon": round(monthly_points[shortage_month_offset][3] / 10_000, 1),
            "is_shortage_point": True,
        })
        yearly_points = sorted(yearly_points, key=lambda point: (point["age"], point["year_month"]))

    stable_maintenance_years = None
    if shortage_age is not None:
        stable_maintenance_years = max(0, int(shortage_age - retirement_age))

    return {
        "summary_cards": {
            "expected_monthly_pension": expected_monthly_pension,
            "expected_monthly_pension_start_age": int(features.get("public_pension_start_age", 0)),
            "monthly_living_expense": int(target_monthly_expense or status["current_monthly_living_expense"]),
            "stable_maintenance_years": stable_maintenance_years,
            "stable_maintenance_from_age": retirement_age,
            "stable_maintenance_to_age": int(shortage_age) if shortage_age is not None else None,
            "shortage_expected_age": int(shortage_age) if shortage_age is not None else None,
            "shortage_expected_month": shortage_year_month,
        },
        "asset_projection": {
            "unit": "KRW",
            "unit_display": "만원",
            "start_age": data.profile.age,
            "retirement_age": retirement_age,
            "life_expectancy_age": life_age,
            "points": yearly_points,
        },
        "simulation_assumptions": {
            "financial_asset_total_included": [
                "deposit_balance_total",
                "investment_balance_total",
                "private_pension_balance",
            ],
            "salary_income_until_age": retirement_age,
            "retirement_lump_sum_added_at": _format_year_month(retirement_month),
            "loan_payments_applied_until_maturity": True,
            "target_monthly_expense": int(target_monthly_expense or 0),
            "public_pension_start_month": features.get("public_pension_start_month", ""),
            "private_pensions_use_expected_start": True,
            "non_loan_living_expense": non_loan_living_expense,
        },
        "source_features": {
            key: features.get(key)
            for key in [
                "monthly_income_total",
                "monthly_expense_total",
                "target_monthly_expense",
                "post_retire_expense_monthly",
                "monthly_repayment_total",
                "private_pension_monthly",
                "public_pension_monthly",
                "retirement_lump_sum_estimated",
                "loan_details",
            ]
        },
        "source_profile": asdict(data.profile),
        "birth_month": _format_year_month(birth_month),
    }

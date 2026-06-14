"""Tests for backend API payload builders."""

import dataclasses
import json

from adaptive_question_pool import ADAPTIVE_QUESTION_POOL
from api_views import (
    build_asset_projection_dashboard,
    build_status_check,
    select_custom_questions,
)
from mydata_schema import PERSONA_A


def _persona_a_raw():
    return json.loads(json.dumps(dataclasses.asdict(PERSONA_A)))


def test_status_check_returns_current_snapshot_values():
    payload = build_status_check(_persona_a_raw())

    assert payload["expected_monthly_pension"] == 2_250_000
    assert payload["expected_monthly_pension_start_age"] == 63
    assert payload["financial_asset_total"] == 176_545_000
    assert payload["loan_balance_total"] == 40_800_000
    assert payload["current_monthly_living_expense"] == 4_333_333


def test_custom_questions_selects_five_questions_from_pool_without_llm():
    payload = select_custom_questions(_persona_a_raw(), limit=5, use_llm=False)
    pool_ids = {item.id for item in ADAPTIVE_QUESTION_POOL}

    assert payload["selection_mode"] == "adaptive_questionnaire_agent"
    assert payload["llm_used"] is False
    assert payload["question_count"] == 5
    assert len(payload["questions"]) == 5
    assert all(question["question_id"] in pool_ids for question in payload["questions"])
    assert all(question["reason"] for question in payload["questions"])
    assert all(question["target_context"] for question in payload["questions"])
    assert {question["domain"] for question in payload["questions"]}.issubset({
        "product_understanding",
        "decision_check_behavior",
        "financial_confidence",
    })
    assert payload["priority_board"]["primary_domain"]
    assert all(question["dashboard_effect"]["priority_cards"] for question in payload["questions"])


def test_custom_questions_excludes_answered_questions_and_updates_insights():
    first = select_custom_questions(_persona_a_raw(), limit=5, use_llm=False)
    answered = first["questions"][0]
    second = select_custom_questions(
        _persona_a_raw(),
        limit=5,
        use_llm=False,
        answer_history=[
            {
                "question_id": answered["question_id"],
                "answer": answered["options"][0],
            }
        ],
    )

    assert answered["question_id"] not in {q["question_id"] for q in second["questions"]}
    assert second["answer_insights"]


def test_custom_questions_logs_selection_reasons(capsys):
    payload = select_custom_questions(_persona_a_raw(), limit=5, use_llm=False)
    captured = capsys.readouterr()

    assert "[AdaptiveQ]" in captured.out
    assert payload["questions"][0]["question_id"] in captured.out
    assert "reason=" in captured.out
    assert "primary_domain=" in captured.out


def test_result_dashboard_returns_projection_points_and_summary_cards():
    payload = build_asset_projection_dashboard(_persona_a_raw())
    cards = payload["summary_cards"]
    points = payload["asset_projection"]["points"]

    assert cards["expected_monthly_pension"] == 2_250_000
    assert cards["monthly_living_expense"] == 4_333_333
    assert cards["stable_maintenance_from_age"] == 60
    assert len(points) >= 5
    assert points[0]["asset_balance"] > 0
    assert any(point["age"] >= 60 for point in points)
    assert payload["simulation_assumptions"]["loan_payments_applied_until_maturity"] is True


def test_result_dashboard_uses_user_retirement_age_and_target_expense():
    payload = build_asset_projection_dashboard(
        _persona_a_raw(),
        retirement_age=62,
        target_monthly_expense=4_000_000,
    )

    assert payload["summary_cards"]["monthly_living_expense"] == 4_000_000
    assert payload["summary_cards"]["stable_maintenance_from_age"] == 62
    assert payload["asset_projection"]["retirement_age"] == 62
    assert payload["simulation_assumptions"]["target_monthly_expense"] == 4_000_000
    assert payload["simulation_assumptions"]["non_loan_living_expense"] == 4_000_000

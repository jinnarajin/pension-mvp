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

    assert payload["selection_mode"] == "fallback_question_pool_agent"
    assert payload["llm_used"] is False
    assert payload["question_count"] == 5
    assert len(payload["questions"]) == 5
    assert all(question["question_id"] in pool_ids for question in payload["questions"])
    assert all(question["reason"] for question in payload["questions"])


def test_custom_questions_uses_llm_ids_and_hydrates_from_pool(monkeypatch):
    def fake_llm(snapshot, question_pool, limit):
        assert snapshot["profile"]["age"] == 57
        assert len(question_pool) >= 5
        return [
            {
                "question_id": "CFPB_06",
                "reason": "은퇴 후 자산 지속성 우려를 확인합니다.",
                "vulnerability_to_validate": "retirement_anxiety",
            },
            {
                "question_id": "QF9",
                "reason": "공적연금과 사적연금 구성을 이해하는지 확인합니다.",
                "vulnerability_to_validate": "retirement_income_awareness",
            },
            {
                "question_id": "QF2_4",
                "reason": "대출 상환 관리 역량을 확인합니다.",
                "vulnerability_to_validate": "bill_management",
            },
            {
                "question_id": "QP9_8",
                "reason": "마이데이터 활용 경험을 확인합니다.",
                "vulnerability_to_validate": "mydata_familiarity",
            },
            {
                "question_id": "QF4",
                "reason": "예상치 못한 지출 대응력을 확인합니다.",
                "vulnerability_to_validate": "emergency_resilience",
            },
        ]

    monkeypatch.setattr("api_views._call_question_selection_llm", fake_llm)
    payload = select_custom_questions(_persona_a_raw(), limit=5)

    assert payload["selection_mode"] == "llm_question_pool_agent"
    assert payload["llm_used"] is True
    assert [q["question_id"] for q in payload["questions"]] == [
        "CFPB_06",
        "QF9",
        "QF2_4",
        "QP9_8",
        "QF4",
    ]
    assert payload["questions"][0]["text_ko"]
    assert payload["questions"][0]["reason"] == "은퇴 후 자산 지속성 우려를 확인합니다."


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

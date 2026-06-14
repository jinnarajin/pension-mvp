"""Tests for the adaptive questionnaire agent.

The agent is centered on cashflow-derived domain gaps, not CFPB scoring.
"""

import dataclasses
import json

from adaptive_questionnaire_agent import build_adaptive_questionnaire_state
from mydata_schema import PERSONA_A


def _persona_a_raw():
    return json.loads(json.dumps(dataclasses.asdict(PERSONA_A)))


def test_adaptive_questionnaire_returns_only_three_question_domains():
    payload = build_adaptive_questionnaire_state(_persona_a_raw(), answer_history=[], limit=5)

    assert payload["question_count"] == 5
    assert payload["domain_gaps"]
    assert payload["priority_board"]["primary_domain"]
    assert payload["priority_board"]["card_order"]
    assert payload["selection_mode"] == "adaptive_questionnaire_agent"

    for question in payload["questions"]:
        assert question["question_id"]
        assert question["domain"] in {
            "product_understanding",
            "decision_check_behavior",
            "financial_confidence",
        }
        assert question["reason"]
        assert question["target_context"]
        assert question["selection_value"]["score"] > 0
        assert question["selection_value"]["affects"]
        assert question["dashboard_effect"]["priority_cards"]

    assert "current_cashflow" in payload["persona_context"]
    assert "retirement_preparedness" in payload["persona_context"]


def test_adaptive_questionnaire_excludes_answered_questions_and_uses_answers():
    first = build_adaptive_questionnaire_state(_persona_a_raw(), answer_history=[], limit=5)
    answered_question = first["questions"][0]

    second = build_adaptive_questionnaire_state(
        _persona_a_raw(),
        answer_history=[
            {
                "question_id": answered_question["question_id"],
                "answer": answered_question["options"][0],
            }
        ],
        limit=5,
    )

    second_ids = {question["question_id"] for question in second["questions"]}
    assert answered_question["question_id"] not in second_ids
    assert second["answer_insights"]


def test_adaptive_questionnaire_skips_already_filled_target_context():
    payload = build_adaptive_questionnaire_state(
        _persona_a_raw(),
        answer_history=[
            {
                "question_id": "PU01",
                "answer": "모두 알고 있다",
            }
        ],
        limit=5,
    )

    assert all(
        question["target_context"] != "loan_condition_understanding"
        for question in payload["questions"]
    )


def test_adaptive_questionnaire_excludes_unowned_product_questions():
    raw = _persona_a_raw()
    raw["loans"] = []
    raw["insurances"] = []
    payload = build_adaptive_questionnaire_state(raw, answer_history=[], limit=5)
    question_ids = {question["question_id"] for question in payload["questions"]}

    assert "PU01" not in question_ids
    assert "PU02" not in question_ids
    assert "PU03" not in question_ids


def test_priority_board_maps_question_domains_to_dashboard_treatments():
    payload = build_adaptive_questionnaire_state(_persona_a_raw(), answer_history=[], limit=5)
    effects_by_domain = {
        gap["domain"]: gap["dashboard_effect"]
        for gap in payload["domain_gaps"]
    }

    assert set(effects_by_domain) == {
        "product_understanding",
        "decision_check_behavior",
        "financial_confidence",
    }
    assert effects_by_domain["product_understanding"]["priority_cards"]
    assert "explanation_profile" in payload["priority_board"]

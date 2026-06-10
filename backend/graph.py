"""
graph.py — LangGraph StateGraph 정의
Image 2의 전체 플로우를 LangGraph 노드와 엣지로 구성합니다.

플로우:
  feature_change_detection
    → orchestration_agent
        ├─ 재분석 필요 → backend_data_mapping
        │                → cashflow_snapshot
        │                → supervisor_agent_check
        │                → question_routing_agent
        │                → persona_classifier
        │                → final_cashflow_calculation
        │                → dashboard_agent
        │                → guardrail_agent
        │                → create_review_case
        │                → update_user_state → END
        └─ 변화 없음   → no_change_response → END
"""

import os
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.redis import RedisSaver

load_dotenv()
DEFAULT_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

from state import AgentState
from agents import (
    feature_change_detection,
    orchestration_agent,
    backend_data_mapping,
    cashflow_snapshot,
    supervisor_agent_check,
    question_routing_agent,
    persona_classifier,
    final_cashflow_calculation,
    dashboard_agent,
    guardrail_agent,
    create_review_case,
    update_user_state,
    no_change_response,
)


# ── 분기 함수 ────────────────────────────────────────────

def route_by_change(state: AgentState) -> str:
    """Orchestration Agent 이후 분기 결정"""
    return "reanalyze" if state["needs_reanalysis"] else "no_change"


def route_after_guardrail(state: AgentState) -> str:
    """GuardRail 이후 실무자 검토 여부 결정"""
    persona = state.get("persona")
    calc    = state.get("calculation")
    high_financial_risk = bool(
        calc and (
            calc.shortfall_monthly > 0
            or calc.survival_months_retire < 12
            or calc.dsr_retire >= 30
        )
    )
    if persona and (persona.needs_human_review or high_financial_risk):
        return "needs_review"
    return "skip_review"


# ── 그래프 구성 ──────────────────────────────────────────

def build_graph(redis_url: str = DEFAULT_REDIS_URL) -> StateGraph:
    """
    전체 Agent 파이프라인 그래프를 구성하고 반환합니다.

    Args:
        redis_url: LangGraph 체크포인트용 Redis URL

    Returns:
        컴파일된 LangGraph StateGraph
    """
    graph = StateGraph(AgentState)

    # ── 노드 등록
    graph.add_node("feature_change_detection",  feature_change_detection)
    graph.add_node("orchestration_agent",        orchestration_agent)
    graph.add_node("backend_data_mapping",       backend_data_mapping)
    graph.add_node("cashflow_snapshot",          cashflow_snapshot)
    graph.add_node("supervisor_agent_check",     supervisor_agent_check)
    graph.add_node("question_routing_agent",     question_routing_agent)
    graph.add_node("persona_classifier",         persona_classifier)
    graph.add_node("final_cashflow_calculation", final_cashflow_calculation)
    graph.add_node("dashboard_agent",            dashboard_agent)
    graph.add_node("guardrail_agent",            guardrail_agent)
    graph.add_node("create_review_case",         create_review_case)
    graph.add_node("update_user_state",          update_user_state)
    graph.add_node("no_change_response",         no_change_response)

    # ── 진입점
    graph.set_entry_point("feature_change_detection")

    # ── 엣지: feature_change → orchestration
    graph.add_edge("feature_change_detection", "orchestration_agent")

    # ── 조건 분기: orchestration → 재분석 필요 / 변화 없음
    graph.add_conditional_edges(
        "orchestration_agent",
        route_by_change,
        {
            "reanalyze": "backend_data_mapping",
            "no_change": "no_change_response",
        }
    )

    # ── 풀 파이프라인 순차 엣지
    graph.add_edge("backend_data_mapping",       "cashflow_snapshot")
    graph.add_edge("cashflow_snapshot",          "supervisor_agent_check")  # Supervisor
    graph.add_edge("supervisor_agent_check",     "question_routing_agent")
    graph.add_edge("question_routing_agent",     "persona_classifier")
    graph.add_edge("persona_classifier",         "final_cashflow_calculation")
    graph.add_edge("final_cashflow_calculation", "dashboard_agent")
    graph.add_edge("dashboard_agent",            "guardrail_agent")        # GuardRail

    # ── GuardRail 이후 조건 분기: 실무자 검토 필요 여부
    graph.add_conditional_edges(
        "guardrail_agent",
        route_after_guardrail,
        {
            "needs_review": "create_review_case",
            "skip_review":  "update_user_state",
        }
    )

    graph.add_edge("create_review_case", "update_user_state")

    # ── 종료
    graph.add_edge("update_user_state",  END)
    graph.add_edge("no_change_response", END)

    # ── Redis 체크포인트 (LangGraph Stored User State)
    checkpointer = RedisSaver(redis_url)
    checkpointer.setup()
    return graph.compile(checkpointer=checkpointer)


# ── 실행 헬퍼 ────────────────────────────────────────────

def run_pipeline(
    customer_id: str,
    query: str,
    mydata_raw: dict,
    cfpb_input: dict | None = None,
    redis_url: str = DEFAULT_REDIS_URL
) -> dict:
    """
    전체 Agent 파이프라인을 실행합니다.

    Args:
        customer_id: 고객 ID (예: "PA-0001")
        query:       사용자 상담 질문
        mydata_raw:  마이데이터 JSON dict
        redis_url:   Redis 연결 URL

    Returns:
        최종 AgentState dict
    """
    pipeline = build_graph(redis_url)

    # cfpb_input dict → CFPBInput dataclass (state.py에서 import)
    from state import CFPBInput
    cfpb_obj = None
    if cfpb_input:
        cfpb_obj = CFPBInput(
            answers=cfpb_input.get("answers", {}),
            age=int(cfpb_input.get("age", 0)),
            mode=cfpb_input.get("mode", "self"),
            translation_validated=cfpb_input.get("translation_validated", False),
        )

    initial_state: AgentState = {
        "customer_id":       customer_id,
        "query":             query,
        "mydata_raw":        mydata_raw,
        "cfpb_input":        cfpb_obj,
        "feature_change":    None,
        "needs_reanalysis":  True,
        "data_mapping":      None,
        "cashflow_snapshot": None,
        "routing":           None,
        "persona":           None,
        "calculation":       None,
        "dashboard":         None,
        "guardrail":         None,
        "final_response":    None,
        "review_case":       None,
        "user_state_updated": False,
        "error":             None,
    }

    config = {"configurable": {"thread_id": customer_id}}
    result = pipeline.invoke(initial_state, config=config)
    return result


if __name__ == "__main__":
    # 테스트 실행
    from mydata_schema import PERSONA_A
    import json, dataclasses

    class EnhancedEncoder(json.JSONEncoder):
        def default(self, o):
            if dataclasses.is_dataclass(o):
                return dataclasses.asdict(o)
            return super().default(o)

    result = run_pipeline(
        customer_id="PA-0001",
        query="퇴직연금 수익률이 1.2%인데 갈아타기를 고려 중입니다.",
        mydata_raw=json.loads(json.dumps(dataclasses.asdict(PERSONA_A), cls=EnhancedEncoder)),
    )

    print("\n" + "="*50)
    print("최종 답변:")
    print(result.get("final_response", "없음"))
    if result.get("review_case"):
        rc = result["review_case"]
        print(f"\n실무자 검토: [{rc.priority}] {rc.flag_reason}")

"""
agents.py — 각 Agent 노드 구현
Image 2의 [1]~[6] + Supervisor + GuardRail Agent를 함수로 구현합니다.

Supervisor Agent: [2]~[4] 구간을 감독하며 페르소나 분류를 위한 감독 agent
GuardRail Agent: Dashboard Agent 직전에 Claude 생성 응답을 검증
"""

from __future__ import annotations
import json
import os
import redis
from openai import OpenAI
from dotenv import load_dotenv
from state import (
    AgentState, FeatureChangeResult, DataMappingResult, CashflowSnapshot,
    RoutingResult, PersonaClassification, CashflowCalculation,
    DashboardCard, GuardRailResult, ReviewCase
)
from mydata_schema import MyDataInput
from calculations import calculate_all_metrics

load_dotenv()

client = OpenAI()
MODEL  = "gpt-4o-mini"

# Redis (Stored User State)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)


# ── 헬퍼 ────────────────────────────────────────────────

def _llm(prompt: str, max_tokens: int = 800) -> dict:
    """OpenAI Chat Completions → JSON 파싱. JSON 모드 사용."""
    resp = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    text = resp.choices[0].message.content.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def _get_stored_state(customer_id: str) -> dict | None:
    raw = redis_client.get(f"user_state:{customer_id}")
    return json.loads(raw) if raw else None


def _set_stored_state(customer_id: str, state: dict):
    redis_client.set(
        f"user_state:{customer_id}",
        json.dumps(state, ensure_ascii=False),
        ex=86400 * 30  # 30일
    )


# ══════════════════════════════════════════════════════════
# Feature Change Detection
# ══════════════════════════════════════════════════════════

def feature_change_detection(state: AgentState) -> AgentState:
    """
    Redis에 저장된 이전 User State와 현재 마이데이터를 비교합니다.
    변경이 없으면 needs_reanalysis=False → 캐시된 결과 반환.
    """
    prev = _get_stored_state(state["customer_id"])
    curr = state["mydata_raw"]

    if prev is None:
        # 최초 분석
        result = FeatureChangeResult(
            has_change=True,
            changed_fields=["최초 분석"],
            summary="최초 마이데이터 등록"
        )
        return {**state, "feature_change": result, "needs_reanalysis": True}

    # 변경 감지: 주요 필드 비교
    changed = []
    watch_fields = ["pension_balance", "irp_balance", "current_yield", "monthly_cashflow"]
    for f in watch_fields:
        if prev.get(f) != curr.get(f):
            changed.append(f)

    has_change = len(changed) > 0
    result = FeatureChangeResult(
        has_change=has_change,
        changed_fields=changed,
        summary=f"변경 감지: {', '.join(changed)}" if changed else "변화 없음"
    )
    return {**state, "feature_change": result, "needs_reanalysis": has_change}


# ══════════════════════════════════════════════════════════
# Orchestration Agent (라우팅 판단)
# ══════════════════════════════════════════════════════════

def orchestration_agent(state: AgentState) -> AgentState:
    """
    needs_reanalysis 값에 따라 분기를 결정합니다.
    LangGraph 조건 엣지에서 사용됩니다.
    """
    # 상태 전달만 — 실제 분기는 graph.py의 조건 엣지에서 처리
    print(f"[Orchestration] {state['customer_id']} — "
          f"재분석: {state['needs_reanalysis']}")
    return state


# ══════════════════════════════════════════════════════════
# [1] Backend Data Mapping
# ══════════════════════════════════════════════════════════

def backend_data_mapping(state: AgentState) -> AgentState:
    """
    마이데이터 JSON → MyDataInput 구조체로 파싱합니다.
    10개 시트 전체를 dataclass로 매핑합니다.
    """
    try:
        mydata = MyDataInput.from_dict(state["mydata_raw"])
        result = DataMappingResult(
            mydata=mydata,
            parsed_ok=True,
            sheet_count=10
        )
        print(f"[1] Data Mapping 완료 — {mydata.profile.customer_id}")
        return {**state, "data_mapping": result}
    except Exception as e:
        return {**state, "error": f"[1] 파싱 오류: {e}"}


# ══════════════════════════════════════════════════════════
# [2] Cashflow Snapshot + Feature Extractor
# ══════════════════════════════════════════════════════════

def cashflow_snapshot(state: AgentState) -> AgentState:
    """
    월별요약(02_월별요약) 12개월 평균으로 현금흐름 스냅샷 생성.
    계산 엔진(calculations.py)에서 주요 피처를 추출합니다.
    """
    mydata = state["data_mapping"].mydata
    summaries = mydata.monthly_summaries

    avg_income   = sum(s.total_income   for s in summaries) // len(summaries)
    avg_expense  = sum(s.total_expense  for s in summaries) // len(summaries)
    avg_cashflow = sum(s.cashflow       for s in summaries) // len(summaries)

    # 유동자산 합산 (04_계좌)
    liquid = sum(a.balance for a in mydata.accounts)

    # 계산 엔진 호출
    features = calculate_all_metrics(mydata)

    result = CashflowSnapshot(
        monthly_income=avg_income,
        monthly_expense=avg_expense,
        monthly_cashflow=avg_cashflow,
        liquid_assets=liquid,
        extracted_features=features
    )
    print(f"[2] Cashflow Snapshot — 월 현금흐름: {avg_cashflow:,}원")
    return {**state, "cashflow_snapshot": result}


# ══════════════════════════════════════════════════════════
# Supervisor Agent (Image 1 기준: [2]~[4] 감독)
# ══════════════════════════════════════════════════════════

def supervisor_agent_check(state: AgentState) -> AgentState:
    """
    Supervisor Agent:
    - [2] Cashflow Snapshot 결과를 검토
    - [3] Question Routing에 필요한 컨텍스트 보강
    - [4] Persona 분류 전 품질 게이트 역할
    페르소나 분류를 위한 감독 Agent (Image 1 참조)
    """
    snap = state["cashflow_snapshot"]
    features = snap.extracted_features

    # 비정상 패턴 감지
    anomalies = []
    if features.get("survival_months_retire", 99) < 6:
        anomalies.append("은퇴 후 생존여력 6개월 미만 — 긴급 검토 필요")
    if features.get("invest_risk_ratio", 0) > 80:
        anomalies.append("고위험 투자 비중 80% 초과")
    if snap.monthly_cashflow < 0:
        anomalies.append("월 현금흐름 적자")

    if anomalies:
        print(f"[Supervisor] 이상 감지: {anomalies}")

    # 상태에 anomaly 정보 추가 (persona classifier에서 활용)
    enriched_features = {**features, "supervisor_anomalies": anomalies}
    updated_snapshot = CashflowSnapshot(
        monthly_income=snap.monthly_income,
        monthly_expense=snap.monthly_expense,
        monthly_cashflow=snap.monthly_cashflow,
        liquid_assets=snap.liquid_assets,
        extracted_features=enriched_features
    )
    return {**state, "cashflow_snapshot": updated_snapshot}


# ══════════════════════════════════════════════════════════
# [3] Question Routing Agent
# ══════════════════════════════════════════════════════════

def question_routing_agent(state: AgentState) -> AgentState:
    """
    사용자 질문 의도를 분류하고 필요한 Agent를 결정합니다.
    Claude API로 의도 분류 → 세부 질문 분해.
    """
    query = state["query"]
    prompt = f"""
사용자 연금 상담 질문을 분석하고 JSON으로만 응답하세요.

질문: "{query}"

intent 선택지: 연금조회 | 갈아타기 | 세제혜택 | 수익률 | 부족액 | 일반상담

응답 JSON:
{{
  "intent": "선택된 의도",
  "sub_questions": ["세부질문1", "세부질문2"],
  "required_agents": ["persona_classifier", "cashflow_calc"]
}}
"""
    d = _llm(prompt, 400)
    result = RoutingResult(
        intent=d["intent"],
        sub_questions=d["sub_questions"],
        required_agents=d["required_agents"]
    )
    print(f"[3] Routing — intent: {result.intent}")
    return {**state, "routing": result}


# ══════════════════════════════════════════════════════════
# [4] Evidence-based Persona Classifier
# ══════════════════════════════════════════════════════════

def persona_classifier(state: AgentState) -> AgentState:
    """
    Supervisor Agent가 보강한 피처 + 마이데이터 기반으로
    취약성 점수 및 페르소나를 분류합니다.
    추출된 변수와 유저 추가정보를 통한 페르소나 분류.
    """
    features = state["cashflow_snapshot"].extracted_features
    profile  = state["data_mapping"].mydata.profile
    anomalies = features.get("supervisor_anomalies", [])

    prompt = f"""
연금 취약성 진단 전문가입니다. 아래 데이터를 분석하고 JSON으로만 응답하세요.

[프로필]
나이: {profile.age}세 / 직군: {profile.job_type} / 은퇴까지: {profile.years_to_retire}년
핵심불안: {profile.core_anxiety}

[계산된 지표]
RR_gap: {features.get("rr_gap", "N/A")}%
은퇴 후 생존여력: {features.get("survival_months_retire", "N/A")}개월
DSR 은퇴 후: {features.get("dsr_retire", "N/A")}%
포트폴리오 괴리도: {features.get("portfolio_deviation", "N/A")}%p
갈아타기 점수: {features.get("switch_score", "N/A")}점

[Supervisor 이상 감지]
{anomalies if anomalies else "없음"}

응답 JSON:
{{
  "vulnerability_score": 0~100 정수,
  "persona_label": "페르소나 한 줄 요약",
  "flags": ["플래그1", "플래그2"],
  "needs_human_review": true/false,
  "evidence": {{"rr_gap": 값, "survival": 값}}
}}
"""
    d = _llm(prompt, 500)
    result = PersonaClassification(
        vulnerability_score=d["vulnerability_score"],
        persona_label=d["persona_label"],
        flags=d["flags"],
        needs_human_review=d["needs_human_review"],
        evidence=d["evidence"]
    )
    print(f"[4] Persona — 점수: {result.vulnerability_score} | {result.persona_label}")
    return {**state, "persona": result}


# ══════════════════════════════════════════════════════════
# [5] Final Cashflow Calculation
# ══════════════════════════════════════════════════════════

def final_cashflow_calculation(state: AgentState) -> AgentState:
    """
    추출된 정보와 가정을 기준으로 현금흐름의 예상 부족 규모를 추정합니다.
    계산 엔진(calculations.py)의 전체 지표를 최종 확정합니다.
    """
    features = state["cashflow_snapshot"].extracted_features

    result = CashflowCalculation(
        rr_gap=features.get("rr_gap", 0),
        rr_full=features.get("rr_full", 0),
        survival_months_now=features.get("survival_months_now", 0),
        survival_months_retire=features.get("survival_months_retire", 0),
        income_gap_years=features.get("income_gap_years", 0),
        dsr_now=features.get("dsr_now", 0),
        dsr_retire=features.get("dsr_retire", 0),
        portfolio_deviation=features.get("portfolio_deviation", 0),
        switch_score=features.get("switch_score", 0),
        shortfall_monthly=features.get("shortfall_monthly", 0)
    )
    print(f"[5] Final Calc — 부족액: {result.shortfall_monthly:,}원/월 | "
          f"갈아타기: {result.switch_score}점")
    return {**state, "calculation": result}


# ══════════════════════════════════════════════════════════
# [6] Dashboard Agent
# ══════════════════════════════════════════════════════════

def dashboard_agent(state: AgentState) -> AgentState:
    """
    [5]의 계산 결과를 사용자 카드 리포트로 변환합니다.
    GuardRail Agent 통과 후 최종 답변 생성.
    """
    mydata  = state["data_mapping"].mydata
    calc    = state["calculation"]
    persona = state["persona"]
    query   = state["query"]

    # 연금 구성 분해
    pension_breakdown = {
        p.pension_type: p.expected_monthly
        for p in mydata.pensions
    }

    # 목표 달성률
    target = mydata.dashboard.monthly_expense_avg
    achievement = round(calc.rr_full, 1) if calc.rr_full else 0

    # 액션 아이템 생성 (Claude)
    prompt = f"""
연금 상담 AI입니다. 아래 분석을 바탕으로 사용자 답변 초안을 작성하세요. 한국어 3문단.

질문: "{query}"
페르소나: {persona.persona_label} (취약성 {persona.vulnerability_score}점)
플래그: {persona.flags}
월 부족액: {calc.shortfall_monthly:,}원
갈아타기 점수: {calc.switch_score}점
RR_gap: {calc.rr_gap}% / RR_full: {calc.rr_full}%
은퇴 후 생존여력: {calc.survival_months_retire}개월
"""
    resp = client.chat.completions.create(
        model=MODEL, max_tokens=700,
        messages=[{"role": "user", "content": prompt}],
    )
    draft = resp.choices[0].message.content

    action_items = []
    if calc.switch_score >= 60:
        action_items.append(f"IRP 갈아타기 검토 권장 ({calc.switch_score}점)")
    if calc.shortfall_monthly > 0:
        action_items.append(f"월 {calc.shortfall_monthly//10000}만원 추가 납입 필요")
    if calc.portfolio_deviation > 15:
        action_items.append(f"포트폴리오 재조정 권장 (괴리도 {calc.portfolio_deviation:.1f}%p)")
    if calc.survival_months_retire < 12:
        action_items.append(f"은퇴 후 생존여력 {calc.survival_months_retire:.1f}개월 — 긴급 대비 필요")

    result = DashboardCard(
        pension_breakdown=pension_breakdown,
        goal_achievement_rate=achievement,
        action_items=action_items,
        timeline_data={
            "rr_gap_period": f"{mydata.profile.retire_date[:4]}~{min(p.expected_start for p in mydata.pensions if p.pension_type == '국민연금')[:4] if any(p.pension_type == '국민연금' for p in mydata.pensions) else 'N/A'}",
            "rr_gap": calc.rr_gap,
            "rr_full": calc.rr_full,
        }
    )
    print(f"[6] Dashboard — 달성률: {achievement}% | 액션: {len(action_items)}개")
    return {**state, "dashboard": result, "final_response": draft}


# ══════════════════════════════════════════════════════════
# GuardRail Agent (Image 1: Dashboard Agent ← GuardRail Agent)
# ══════════════════════════════════════════════════════════

def guardrail_agent(state: AgentState) -> AgentState:
    """
    금소법 기준 5개 규칙으로 Dashboard Agent의 초안 응답을 검증합니다.
    Image 1에서 GuardRail Agent가 Dashboard Agent에 화살표로 연결된 구조.
    """
    draft = state.get("final_response", "")
    calc  = state["calculation"]

    prompt = f"""
금융 규제 준수 검토 에이전트입니다. JSON으로만 응답하세요.

금지 규칙:
1. 확정 수익 약속 ("반드시", "확실히 수익" 등 단정 표현)
2. 특정 상품명 직접 추천
3. 원금 손실 경고 누락 (투자 관련 답변)
4. AI가 투자 판단을 단정짓는 표현
5. 취약 고객 식별 후 미라우팅

초안:
{draft}

계산 근거: 갈아타기 점수={calc.switch_score}, 부족액={calc.shortfall_monthly:,}원

응답 JSON:
{{
  "passed": true/false,
  "blocked_phrases": ["제거된 표현"],
  "safe_response": "수정된 최종 답변"
}}
"""
    d = _llm(prompt, 900)
    result = GuardRailResult(
        passed=d["passed"],
        blocked_phrases=d.get("blocked_phrases", []),
        safe_response=d["safe_response"]
    )
    print(f"[GuardRail] 통과: {result.passed} | 차단: {result.blocked_phrases}")
    return {
        **state,
        "guardrail": result,
        "final_response": result.safe_response
    }


# ══════════════════════════════════════════════════════════
# User State 업데이트
# ══════════════════════════════════════════════════════════

def update_user_state(state: AgentState) -> AgentState:
    """분석 결과를 Redis에 저장합니다 (다음 Feature Change Detection용)."""
    mydata  = state["data_mapping"].mydata
    calc    = state["calculation"]
    persona = state["persona"]

    snapshot = {
        "pension_balance": sum(p.current_value for p in mydata.pensions),
        "irp_balance": next((p.current_value for p in mydata.pensions if p.pension_type=="IRP"), 0),
        "monthly_cashflow": state["cashflow_snapshot"].monthly_cashflow,
        "vulnerability_score": persona.vulnerability_score,
        "switch_score": calc.switch_score,
        "last_analyzed": mydata.profile.customer_id,
    }
    _set_stored_state(state["customer_id"], snapshot)
    print(f"[User State 업데이트] {state['customer_id']} 저장 완료")
    return {**state, "user_state_updated": True}


# ══════════════════════════════════════════════════════════
# 실무자 검토 케이스 생성
# ══════════════════════════════════════════════════════════

def create_review_case(state: AgentState) -> AgentState:
    """취약성 점수 기준으로 실무자 검토 케이스를 생성합니다."""
    persona = state["persona"]
    calc    = state["calculation"]
    profile = state["data_mapping"].mydata.profile

    if not persona.needs_human_review and calc.switch_score < 80:
        return state  # 검토 불필요

    priority = "긴급" if persona.vulnerability_score >= 80 else "주의"
    review = ReviewCase(
        customer_id=state["customer_id"],
        priority=priority,
        flag_reason=f"취약성 {persona.vulnerability_score}점 | 갈아타기 {calc.switch_score}점",
        agent_evidence=f"{persona.persona_label} | {', '.join(persona.flags[:2])}"
    )
    print(f"[실무자 검토] {priority} — {state['customer_id']}")
    return {**state, "review_case": review}


# ══════════════════════════════════════════════════════════
# 변화 없음 — 간단 알림
# ══════════════════════════════════════════════════════════

def no_change_response(state: AgentState) -> AgentState:
    """변화가 없을 때 캐시된 결과로 간단 알림을 반환합니다."""
    return {
        **state,
        "final_response": "이번 달 큰 변화 없음 — 지난 분석 결과를 유지합니다.",
        "user_state_updated": False
    }

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
    RoutingResult, AdaptiveQuestionnaireResult, PersonaClassification, CashflowCalculation,
    DashboardCard, ScenarioComparison, GuardRailResult, ReviewCase
)
from mydata_schema import MyDataInput
from calculations import calculate_all_metrics
from adaptive_questionnaire_agent import build_adaptive_questionnaire_state
from scenario_tools import build_pension_receipt_scenarios
from cfpb_fwb_scorer import (
    score_cfpb_fwb_abbreviated,
    USING_OFFICIAL_LOOKUP,
)

load_dotenv()

client = OpenAI()
MODEL  = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")

# Redis (Stored User State)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)


# ── 헬퍼 ────────────────────────────────────────────────

def _llm_text(prompt: str, max_tokens: int = 800, json_mode: bool = False) -> str:
    """OpenAI Responses API first, Chat Completions fallback for older runtimes."""
    try:
        kwargs = {
            "model": MODEL,
            "input": prompt,
            "max_output_tokens": max_tokens,
        }
        if json_mode:
            kwargs["text"] = {"format": {"type": "json_object"}}
        resp = client.responses.create(**kwargs)
        text = getattr(resp, "output_text", "")
        if text:
            return text.strip()
    except Exception:
        pass

    chat_kwargs = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if json_mode:
        chat_kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**chat_kwargs)
    return resp.choices[0].message.content.strip()


def _llm(prompt: str, max_tokens: int = 800) -> dict:
    """OpenAI JSON response helper."""
    text = _llm_text(prompt, max_tokens, json_mode=True)
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
    if state.get("scenario_options") is not None:
        result = FeatureChangeResult(
            has_change=True,
            changed_fields=["scenario_options"],
            summary="연금 수령방식 시나리오 재계산 요청"
        )
        return {**state, "feature_change": result, "needs_reanalysis": True}

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
    사용자 정의 cashflow feature set 기준으로 현금흐름 스냅샷을 생성합니다.
    계산 엔진(calculations.py)에서 월 소득·지출, 자산, 부채, 연금 피처를 추출합니다.
    """
    mydata = state["data_mapping"].mydata
    options = state.get("scenario_options")

    # 계산 엔진 호출
    features = calculate_all_metrics(
        mydata,
        retirement_age=options.retirement_age if options else None,
        target_monthly_expense=options.target_monthly_expense if options else None,
    )

    result = CashflowSnapshot(
        monthly_income=features["monthly_income_total"],
        monthly_expense=features["monthly_expense_total"],
        monthly_cashflow=features["net_cashflow_monthly"],
        liquid_assets=features["liquid_asset_total"],
        extracted_features=features
    )
    print(f"[2] Cashflow Snapshot — 월 현금흐름: {result.monthly_cashflow:,}원")
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
# [3] Adaptive Questionnaires Agent
# ══════════════════════════════════════════════════════════

def adaptive_questionnaire_agent(state: AgentState) -> AgentState:
    """
    Cashflow 기반 부족 영역을 진단하고, 승인된 질문 Bank에서 다음 질문 후보와
    dashboard priority board를 산출합니다. CFPB 점수는 사용하지 않습니다.
    """
    if state.get("mydata_raw") is None:
        return {**state, "error": "[3] Adaptive Questionnaire 입력 누락"}

    options = state.get("scenario_options")
    payload = build_adaptive_questionnaire_state(
        mydata_raw=state["mydata_raw"],
        answer_history=state.get("adaptive_answer_history", []),
        limit=5,
        retirement_age=options.retirement_age if options else None,
        target_monthly_expense=options.target_monthly_expense if options else None,
    )
    result = AdaptiveQuestionnaireResult(
        selection_mode=payload["selection_mode"],
        question_count=payload["question_count"],
        questions=payload["questions"],
        domain_gaps=payload["domain_gaps"],
        answer_insights=payload["answer_insights"],
        priority_board=payload["priority_board"],
        persona_context=payload.get("persona_context", {}),
        context_profile=payload.get("context_profile", {}),
        dashboard_treatment=payload.get("dashboard_treatment", {}),
        llm_used=payload.get("llm_used", False),
        llm_error=payload.get("llm_error", ""),
    )
    primary = result.priority_board.get("primary_label", "")
    print(f"[3] Adaptive Questionnaire — primary: {primary} | questions={result.question_count}")
    return {**state, "adaptive_questionnaire": result}


# ══════════════════════════════════════════════════════════
# [3] CFPB Administrator — 5문항 응답을 결정론적으로 채점
# (기존 Question Routing Agent 대체. 함수 이름은 graph.py 호환을 위해 유지.)
# ══════════════════════════════════════════════════════════

def question_routing_agent(state: AgentState) -> AgentState:
    """
    Legacy compatibility node.

    CFPB fwb_score는 이 제품 흐름에서 더 이상 핵심 의미를 갖지 않습니다.
    후속 호환 필드를 위해 중립값만 제공하고, 실제 질문/대시보드 우선순위는
    adaptive_questionnaire_agent 결과를 사용합니다.
    """
    result = RoutingResult(
        fwb_score=50,
        raw_total=0,
        group="not_used",
        using_official_lookup=False,
        translation_validated=False,
        intent="adaptive_questionnaire_primary",
    )
    print("[3] CFPB score not used — Adaptive Questionnaire가 우선")
    return {**state, "routing": result}


# ══════════════════════════════════════════════════════════
# [4] Vulnerability Analyzer — CFPB 주관 + 마이데이터 객관 → UVS·tier
# (기존 Persona Classifier 대체. 함수 이름은 graph.py 호환을 위해 유지.)
# ══════════════════════════════════════════════════════════

# 가중치 — 운영 데이터로 보정 대상
W_SUB_OBJ_ALPHA = 0.5         # S_sub 비중
W_SUB_OBJ_BETA  = 0.5         # S_obj 비중
W_RUNWAY        = 0.5         # 생존여력 가중
W_DSR           = 0.3         # DSR 가중
W_PENSION       = 0.2         # 연금대체율 가중
OVERLAP_PENALTY = 0.15        # 다차원 결합 위험 트리거당 증폭
ABBREV_BUFFER   = 5           # 약식 척도 컷오프 완화(%p)


def _normalize_obj(features: dict, profile_age: int) -> tuple[float, dict]:
    """마이데이터 객관 지표 → S_obj (0~1) + 정규화 컴포넌트 dict 반환."""
    # S_runway: 60세 은퇴 직후 기준, 6개월 이상=0, 1개월 이하=1, 선형
    survival = features.get("survival_months_at_retirement", 0)
    s_runway = max(0.0, min(1.0, (6 - survival) / 5))

    # S_dsr: 은퇴 후 대출 부담 기준, 40% 이상=1, 0%=0
    dsr = features.get("dsr_retire", features.get("dsr_now", 0))
    s_dsr = max(0.0, min(1.0, dsr / 40))

    # S_pension: PensionReplacementRate 70% 이상=0, 0%=1 (낮을수록 취약)
    rr = features.get("PensionReplacementRate", features.get("pension_replacement_rate", 0))
    s_pension = max(0.0, min(1.0, (70 - rr) / 70)) if rr is not None else 0.5

    s_obj = W_RUNWAY * s_runway + W_DSR * s_dsr + W_PENSION * s_pension
    return s_obj, {"s_runway": s_runway, "s_dsr": s_dsr, "s_pension": s_pension}


def _check_amplification(profile_age: int, s_sub: float, features: dict) -> tuple[int, list[str]]:
    """다차원 결합 위험 트리거 카운트 + 사유 목록."""
    triggers = []
    if profile_age >= 65 and s_sub > 0.6:
        triggers.append("age65+_high_subjective_vuln")
    if features.get("survival_months_at_retirement", 99) < 3:
        triggers.append("retirement_liquidity_runway<3m")
    if features.get("income_gap_years", 0) > 0 and s_sub > 0.5:
        triggers.append("income_gap+subjective_vuln")
    if features.get("dsr_retire", features.get("dsr_now", 0)) >= 40:
        triggers.append("retirement_dsr>=40")
    return len(triggers), triggers


def persona_classifier(state: AgentState) -> AgentState:
    """
    Vulnerability Analyzer.
    입력: CFPB fwb_score (routing) + 마이데이터 객관 지표 (cashflow_snapshot).
    산출: UVS (0~100), tier (주의/경고/위기), downstream_action, 드라이버 귀인.
    LLM은 사용하지 않습니다 — 결정론적 규칙.
    """
    routing = state.get("routing")
    snapshot = state.get("cashflow_snapshot")
    data_mapping = state.get("data_mapping")
    adaptive = state.get("adaptive_questionnaire")
    if routing is None or snapshot is None or data_mapping is None:
        return {**state, "error": "[4] Vulnerability Analyzer 입력 누락"}

    features = snapshot.extracted_features
    profile = data_mapping.mydata.profile
    fwb_score = routing.fwb_score

    # ── 1. 주관 취약 S_sub ──────────────────────────────
    # CFPB score는 더 이상 핵심 지표가 아니므로 중립값으로 둔다.
    s_sub = 0.5

    # ── 2. 객관 취약 S_obj ──────────────────────────────
    s_obj, obj_comp = _normalize_obj(features, profile.age)
    if adaptive and adaptive.domain_gaps:
        top_scores = [float(gap.get("score", 0)) for gap in adaptive.domain_gaps[:3]]
        adaptive_obj = sum(top_scores) / len(top_scores)
        s_obj = max(s_obj, adaptive_obj)
        obj_comp = {
            **obj_comp,
            "adaptive_top_domains": [
                {
                    "domain": gap.get("domain"),
                    "label": gap.get("label"),
                    "score": gap.get("score"),
                    "severity": gap.get("severity"),
                }
                for gap in adaptive.domain_gaps[:3]
            ],
        }

    # ── 3. 결합 + 비선형 증폭 ────────────────────────────
    base = W_SUB_OBJ_ALPHA * s_sub + W_SUB_OBJ_BETA * s_obj
    k, trigger_reasons = _check_amplification(profile.age, s_sub, features)
    amplification = 1 + min(1.0, k * OVERLAP_PENALTY)
    uvs_float = min(1.0, base * amplification) if amplification > 1 else base
    uvs = round(uvs_float * 100)

    # ── 4. tier 분류 (약식 척도 버퍼 반영) ──────────────
    # 컷오프를 ABBREV_BUFFER만큼 완화 (취약 과대분류 방지)
    if uvs < (40 - ABBREV_BUFFER):
        tier, action = "주의", "ui_simple_home"
    elif uvs < (70 - ABBREV_BUFFER):
        tier, action = "경고", "deliberation_period + proxy_sms"
    else:
        tier, action = "위기", "fds_block + senior_specialist_call"

    needs_review = tier in ("경고", "위기")
    fwb_confidence = "indicative"

    # ── 5. 페르소나 라벨 (간단 규칙 기반) ──────────────
    primary_board = adaptive.priority_board if adaptive else {}
    primary_label = primary_board.get("primary_label", "")
    if primary_label:
        label = f"{primary_label} 우선 관리"
    elif profile.age >= 65 and s_sub > 0.6:
        label = "은퇴기 주관 취약 고위험"
    elif features.get("years_until_retirement", profile.years_to_retire) <= 5 and s_obj > 0.5:
        label = "은퇴임박 객관 취약"
    elif s_sub > 0.6 and s_obj < 0.3:
        label = "심리적 불안 중심 취약"
    elif s_obj > 0.6 and s_sub < 0.3:
        label = "객관 지표 중심 취약"
    elif uvs < 30:
        label = "전반 양호 (관리 단계)"
    else:
        label = "복합 취약 (모니터)"

    flags = []
    if obj_comp["s_runway"] > 0.7:
        flags.append(f"60세 은퇴 직후 생존여력 부족 ({features.get('survival_months_at_retirement', 0):.1f}개월)")
    if obj_comp["s_dsr"] > 0.7:
        flags.append(f"은퇴 후 DSR 과다 ({features.get('dsr_retire', features.get('dsr_now', 0)):.0f}%)")
    if obj_comp["s_pension"] > 0.7:
        flags.append(f"연금대체율 낮음 ({features.get('PensionReplacementRate', 0):.0f}%)")
    if s_sub > 0.7:
        flags.append(f"CFPB 주관 웰빙 취약 (fwb={fwb_score})")
    if features.get("income_gap_years", 0) > 0:
        flags.append(f"소득 공백기 {features.get('income_gap_years', 0)}년")
    if primary_label:
        flags.append(f"대시보드 우선 영역: {primary_label}")

    rationale = (
        f"Adaptive Questionnaire 우선 영역={primary_label or '없음'}, "
        f"마이데이터/질문 기반 S_obj={s_obj:.2f}. "
        f"결합 base={base:.2f}, 다차원 트리거 {k}개({trigger_reasons}) "
        f"→ UVS={uvs} → tier={tier}. CFPB fwb_score는 본 흐름의 핵심 판단에 사용하지 않음."
    )

    result = PersonaClassification(
        vulnerability_score=uvs,
        persona_label=label,
        flags=flags,
        needs_human_review=needs_review,
        evidence={
            "fwb_score": fwb_score,
            "s_sub": round(s_sub, 3),
            "s_obj": round(s_obj, 3),
            "obj_components": obj_comp,
            "base": round(base, 3),
            "amplification": round(amplification, 3),
            "triggers": trigger_reasons,
            "priority_board": primary_board,
        },
        uvs=uvs,
        tier=tier,
        downstream_action=action,
        fwb_confidence=fwb_confidence,
        amplification_triggered=k > 0,
        driver_attribution={
            "resilience_subjective": round(s_sub, 2),
            "resilience_objective": round(s_obj, 2),
            "life_events": "not_measured",
            "health": "not_measured",
            "capability_digital": primary_board.get("explanation_profile", {}).get("difficulty", "not_measured"),
        },
        rationale=rationale,
    )
    print(f"[4] Vulnerability — UVS: {uvs} | tier: {tier} | {label} | action: {action}")
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
        pension_replacement_rate=features.get("PensionReplacementRate", 0),
        survival_months_at_retirement=features.get("survival_months_at_retirement", 0),
        survival_months_retire=features.get("survival_months_retire", 0),
        income_gap_years=features.get("income_gap_years", 0),
        dsr_now=features.get("dsr_now", 0),
        dsr_retire=features.get("dsr_retire", 0),
        shortfall_monthly=features.get("shortfall_monthly", 0),
        income_gap_months=features.get("income_gap_months", 0),
        life_expectancy_age=features.get("life_expectancy_age", 90),
        retirement_total_shortfall_estimated=features.get("retirement_total_shortfall_estimated", 0),
        retirement_total_shortfall_after_assets=features.get("retirement_total_shortfall_after_assets", 0),
        immediate_exhausted_month=features.get("immediate_exhausted_month", 999.0),
        semi_liquid_exhausted_month=features.get("semi_liquid_exhausted_month", 999.0),
        gap_covered_by_immediate=features.get("gap_covered_by_immediate", True),
        sequential_total_survival_months=features.get("sequential_total_survival_months", 99.0),
        retirement_shortfall_sequential=features.get("retirement_shortfall_sequential", 0),
    )
    print(f"[5] Final Calc — 부족액: {result.shortfall_monthly:,}원/월")
    return {**state, "calculation": result}


# ══════════════════════════════════════════════════════════
# [5.5] Pension Receipt Scenario Agent
# ══════════════════════════════════════════════════════════

def pension_receipt_scenario_agent(state: AgentState) -> AgentState:
    """
    Tool-calling style scenario agent.
    The agent layer decides the standard receipt-method scenarios, then calls
    deterministic tools to calculate lump-sum vs IRP annuity outcomes.
    """
    data = state["data_mapping"].mydata
    features = state["cashflow_snapshot"].extracted_features
    options = state.get("scenario_options")
    target_monthly_expense = options.target_monthly_expense if options else features.get("monthly_expense_total", 0)
    retirement_age = options.retirement_age if options else features.get("retirement_age", 60)

    comparison = build_pension_receipt_scenarios(
        data=data,
        features=features,
        target_monthly_expense=target_monthly_expense,
        retirement_age=retirement_age,
    )
    result = ScenarioComparison(
        target_monthly_expense=comparison["target_monthly_expense"],
        retirement_age=comparison["retirement_age"],
        scenarios=comparison["scenarios"],
        recommended_scenario_id=comparison["recommended_scenario_id"],
        recommendation_reason=comparison["recommendation_reason"],
        tool_trace=comparison.get("tool_trace", []),
    )
    print(f"[5.5] Scenario Tools — 추천: {result.recommended_scenario_id}")
    return {**state, "scenario_comparison": result}


# ══════════════════════════════════════════════════════════
# [6] Dashboard Agent
# ══════════════════════════════════════════════════════════

def dashboard_agent(state: AgentState) -> AgentState:
    """
    계산 결과와 5축 context profile을 프론트 대시보드 계약으로 변환합니다.

    이 노드는 LLM으로 긴 설명 초안을 만들지 않습니다. 프론트가 소비하는 값은
    현금흐름 카드, 부족 원인, 액션, 맞춤 섹션 플래그이므로 계산/프로필 기반
    구조화 데이터만 생성합니다.
    """
    mydata  = state["data_mapping"].mydata
    calc    = state["calculation"]
    features = state["cashflow_snapshot"].extracted_features
    scenario = state.get("scenario_comparison")
    adaptive = state.get("adaptive_questionnaire")
    priority_board = adaptive.priority_board if adaptive else {}
    context_profile = adaptive.context_profile if adaptive else {}
    dashboard_treatment = adaptive.dashboard_treatment if adaptive else {}

    # 연금 구성 분해
    applied_public_pension_type = features.get("applied_public_pension_type", "국민연금")
    pension_breakdown = {
        p.pension_type: p.expected_monthly
        for p in mydata.pensions
        if p.expected_monthly > 0 or p.current_value > 0
    }
    pension_breakdown["공적연금(계산 적용)"] = features.get("public_pension_monthly", 0)

    # 목표 달성률
    achievement = round(calc.pension_replacement_rate, 1) if calc.pension_replacement_rate else 0

    def _level(axis: str) -> str:
        value = context_profile.get(axis, {})
        return value.get("level", "") if isinstance(value, dict) else ""

    def _manwon(value: int | float) -> int:
        return round((value or 0) / 10_000)

    target_expense = (
        features.get("target_monthly_expense", 0)
        or features.get("monthly_expense_total", 0)
        or features.get("post_retire_expense_monthly", 0)
    )
    public_pension = features.get("public_pension_monthly", 0)
    private_pension = features.get("private_pension_monthly", 0)
    expected_pension = public_pension + private_pension
    retirement_cash_gap = max(0, target_expense - expected_pension)
    current_net_cashflow = features.get("net_cashflow_monthly", state["cashflow_snapshot"].monthly_cashflow)

    current_cashflow_level = _level("current_cashflow")
    retirement_level = _level("retirement_readiness")
    product_level = _level("product_understanding")
    decision_level = _level("decision_check_behavior")
    confidence_level = _level("financial_confidence")

    cashflow_problem = {
        "status": current_cashflow_level or ("vulnerable" if current_net_cashflow < 0 else "stable"),
        "monthly_income": features.get("monthly_income_total", 0),
        "monthly_expense": features.get("monthly_expense_total", 0),
        "net_cashflow": current_net_cashflow,
        "message": (
            f"현재 월 현금흐름이 {_manwon(abs(current_net_cashflow))}만원 적자입니다."
            if current_net_cashflow < 0
            else f"현재 월 현금흐름은 {_manwon(current_net_cashflow)}만원 흑자입니다."
        ),
    }
    retirement_problem = {
        "status": retirement_level or ("monthly_shortfall" if retirement_cash_gap > 0 else "stable"),
        "retirement_age": features.get("retirement_age", 60),
        "public_pension_start_age": features.get("public_pension_start_age", 0),
        "public_pension_start_month": features.get("public_pension_start_month", ""),
        "income_gap_months": calc.income_gap_months,
        "target_monthly_expense": target_expense,
        "expected_monthly_pension": expected_pension,
        "monthly_shortfall": retirement_cash_gap,
        "message": (
            f"은퇴 후 월 생활비 기준으로 연금보다 {_manwon(retirement_cash_gap)}만원이 부족합니다."
            if retirement_cash_gap > 0
            else "입력한 생활비 기준 월 연금 흐름은 부족하지 않습니다."
        ),
    }
    knowledge_problem = {
        "product_understanding": product_level or "unknown",
        "decision_check_behavior": decision_level or "unknown",
        "financial_confidence": confidence_level or "unknown",
        "needs_easy_explanation": bool(dashboard_treatment.get("sections", {}).get("show_easy_explanation")),
        "needs_product_cards": bool(dashboard_treatment.get("sections", {}).get("show_product_condition_cards")),
        "needs_decision_checklist": bool(dashboard_treatment.get("sections", {}).get("show_decision_checklist")),
        "needs_shared_summary": bool(dashboard_treatment.get("sections", {}).get("show_family_or_advisor_summary")),
    }

    focus_cards = []
    if cashflow_problem["status"] == "vulnerable":
        focus_cards.append({
            "id": "current_cashflow",
            "title": "현재 현금흐름",
            "severity": "high" if current_net_cashflow < 0 else "medium",
            "description": cashflow_problem["message"],
        })
    if retirement_problem["status"] in {"income_gap", "monthly_shortfall"} or retirement_cash_gap > 0:
        focus_cards.append({
            "id": "retirement_cashflow",
            "title": "은퇴 이후 현금흐름",
            "severity": "high" if retirement_cash_gap > 0 else "medium",
            "description": retirement_problem["message"],
        })
    if product_level == "low":
        focus_cards.append({
            "id": "product_understanding",
            "title": "상품 조건 이해",
            "severity": "medium",
            "description": "연금, 대출, 보험 조건을 먼저 확인할 수 있게 설명을 쉽게 보여줘야 합니다.",
        })
    if decision_level == "low":
        focus_cards.append({
            "id": "decision_check_behavior",
            "title": "결정 전 확인",
            "severity": "medium",
            "description": "수령방식 선택 전에 확인해야 할 항목을 체크리스트로 보여줘야 합니다.",
        })
    if confidence_level == "low":
        focus_cards.append({
            "id": "financial_confidence",
            "title": "공유용 요약",
            "severity": "medium",
            "description": "혼자 판단하기 어렵다면 가족이나 상담사에게 보여줄 짧은 요약이 필요합니다.",
        })
    if not focus_cards:
        focus_cards.append({
            "id": "retirement_cashflow",
            "title": "은퇴 이후 현금흐름",
            "severity": "low",
            "description": retirement_problem["message"],
        })

    action_items = []
    if retirement_cash_gap > 0:
        action_items.append(f"은퇴 후 월 부족액 {_manwon(retirement_cash_gap)}만원 보완 계획 세우기")
    if calc.income_gap_months > 0:
        action_items.append(f"공적연금 전 소득공백 {calc.income_gap_months}개월 동안 쓸 자금 분리하기")
    if not calc.gap_covered_by_immediate:
        action_items.append(f"은퇴 후 {calc.immediate_exhausted_month:.0f}개월째 준유동자산 사용 여부 점검하기")
    if product_level == "low":
        action_items.append("연금·대출·보험의 수령 조건과 중도해지 조건 먼저 확인하기")
    if decision_level == "low":
        action_items.append("수령방식 선택 전 세금, 월수령액, 초기 유동성 체크리스트 확인하기")
    if confidence_level == "low":
        action_items.append("가족 또는 상담사에게 보여줄 요약으로 결정 근거 함께 점검하기")
    action_items = action_items[:3]

    shortage_age = None
    if calc.sequential_total_survival_months and calc.sequential_total_survival_months < 990:
        shortage_age = features.get("retirement_age", 60) + int(calc.sequential_total_survival_months // 12)
    if retirement_cash_gap > 0:
        draft = (
            f"입력한 은퇴 후 월 생활비는 {_manwon(target_expense)}만원이고, 예상 월 연금은 "
            f"{_manwon(expected_pension)}만원입니다. 차액 {_manwon(retirement_cash_gap)}만원을 "
            "보유 자산에서 메우는 구조라서 자산 소진 시점을 함께 봐야 합니다."
        )
        if shortage_age:
            draft += f" 현재 계산 기준 부족 예상 시점은 {shortage_age}세 전후입니다."
    elif current_net_cashflow < 0:
        draft = (
            f"현재 월 현금흐름이 {_manwon(abs(current_net_cashflow))}만원 적자라서 "
            "은퇴 준비보다 먼저 현재 지출과 고정 납입 구조를 점검해야 합니다."
        )
    else:
        draft = "현재 입력값 기준으로는 가장 큰 확인 지점이 은퇴 이후 현금흐름과 수령방식 선택입니다."

    result = DashboardCard(
        pension_breakdown=pension_breakdown,
        goal_achievement_rate=achievement,
        action_items=action_items,
        timeline_data={
            "retirement_age": features.get("retirement_age", 60),
            "public_pension_start_age": features.get("public_pension_start_age", 0),
            "public_pension_start_month": features.get("public_pension_start_month", ""),
            "income_gap_years": calc.income_gap_years,
            "income_gap_months": calc.income_gap_months,
            "PensionReplacementRate": calc.pension_replacement_rate,
            "retirement_total_shortfall_estimated": calc.retirement_total_shortfall_estimated,
            "retirement_total_shortfall_after_assets": calc.retirement_total_shortfall_after_assets,
            "retirement_shortfall_sequential": calc.retirement_shortfall_sequential,
            "immediate_exhausted_month": calc.immediate_exhausted_month,
            "semi_liquid_exhausted_month": calc.semi_liquid_exhausted_month,
            "gap_covered_by_immediate": calc.gap_covered_by_immediate,
            "sequential_total_survival_months": calc.sequential_total_survival_months,
            "applied_public_pension_type": applied_public_pension_type,
            "target_monthly_expense": target_expense,
            "expected_monthly_pension": expected_pension,
            "monthly_retirement_cash_gap": retirement_cash_gap,
            "current_cashflow_problem": cashflow_problem,
            "retirement_cashflow_problem": retirement_problem,
            "knowledge_problem": knowledge_problem,
            "focus_cards": focus_cards,
            "priority_board": priority_board,
            "context_profile": context_profile,
            "dashboard_treatment": dashboard_treatment,
            "recommended_scenario_id": scenario.recommended_scenario_id if scenario else "",
            "recommendation_reason": scenario.recommendation_reason if scenario else "",
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

계산 근거: 부족액={calc.shortfall_monthly:,}원, 은퇴 후 생존여력={calc.survival_months_retire}개월, DSR 은퇴 후={calc.dsr_retire}%

응답 JSON:
{{
  "passed": true/false,
  "blocked_phrases": ["제거된 표현"],
  "safe_response": "수정된 최종 답변"
}}
"""
    d = _llm(prompt, 1800)
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
        "shortfall_monthly": calc.shortfall_monthly,
        "survival_months_retire": calc.survival_months_retire,
        "sequential_total_survival_months": calc.sequential_total_survival_months,
        "gap_covered_by_immediate": calc.gap_covered_by_immediate,
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

    high_financial_risk = (
        calc.shortfall_monthly > 0
        or calc.survival_months_retire < 12
        or calc.dsr_retire >= 30
    )
    if not persona.needs_human_review and not high_financial_risk:
        return state  # 검토 불필요

    priority = "긴급" if persona.vulnerability_score >= 80 else "주의"
    review = ReviewCase(
        customer_id=state["customer_id"],
        priority=priority,
        flag_reason=f"취약성 {persona.vulnerability_score}점 | 부족액 {calc.shortfall_monthly:,}원 | 은퇴 DSR {calc.dsr_retire}%",
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

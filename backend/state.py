"""
state.py — LangGraph AgentState 정의
Image 2 플로우의 전체 상태를 하나의 TypedDict로 관리합니다.

흐름:
  Stored User State
    → Feature Change Detection
    → Orchestration Agent (재분석 필요 / 변화 없음 분기)
        → [1] Backend Data Mapping
        → [2] Cashflow Snapshot + Feature Extractor
        → [3] Question Routing Agent
        → [4] Evidence-based Persona Classifier
        → [5] Final Cashflow Calculation
        → [6] Dashboard Agent
        → GuardRail Agent
        → User State 업데이트
        → 출력 (사용자 대시보드 / 실무자 검토 화면)
"""

from __future__ import annotations
from typing import TypedDict, Optional, Literal
from dataclasses import dataclass, field
from mydata_schema import MyDataInput


# ── 출력 모델들 ──────────────────────────────────────────

@dataclass
class FeatureChangeResult:
    has_change: bool
    changed_fields: list[str]   # 변경된 마이데이터 필드 목록
    summary: str                # "연금 잔액 변경 감지" 등


@dataclass
class DataMappingResult:
    """[1] Backend Data Mapping"""
    mydata: MyDataInput
    parsed_ok: bool
    sheet_count: int            # 파싱된 시트 수


@dataclass
class CashflowSnapshot:
    """[2] Cashflow Snapshot + Feature Extractor"""
    monthly_income: int         # 월 수입
    monthly_expense: int        # 월 지출
    monthly_cashflow: int       # 순 현금흐름
    liquid_assets: int          # 즉시유동자산
    extracted_features: dict    # {"PensionReplacementRate": 40.0, "survival_months_retire": 99.0, ...}


@dataclass
class CFPBInput:
    """[3] CFPB administrator 입력 — 프론트에서 받은 5문항 응답."""
    answers: dict               # {"q3":"not_at_all", ...} 5개 키 필수
    age: int                    # 만 나이 (62세 컷오프 그룹 결정)
    mode: Literal["self", "other"] = "self"
    translation_validated: bool = False


@dataclass
class RoutingResult:
    """[3] Question Routing Agent — CFPB 약식 5문항 administrator + 결정론 채점.

    intent 등은 호환을 위해 남겨두지만, 핵심 결과는 fwb_score 등이다.
    """
    fwb_score: int              # 0~100, IRT 룩업으로 산출
    raw_total: int              # 0~20
    group: str                  # "62_plus_self" 등
    using_official_lookup: bool
    translation_validated: bool
    intent: str = "cfpb_fwb"
    sub_questions: list = field(default_factory=list)
    required_agents: list = field(default_factory=list)


@dataclass
class PersonaClassification:
    """[4] Evidence-based Persona Classifier — Vulnerability Analyzer.

    CFPB 주관 점수(S_sub) + 마이데이터 객관 지표(S_obj)를 결합해 UVS·tier 산출.
    """
    vulnerability_score: int    # = uvs (0~100). 기존 호환 위해 이름 유지.
    persona_label: str
    flags: list[str]
    needs_human_review: bool
    evidence: dict              # {S_sub, S_obj, fwb_score, ...}
    # — Vulnerability Analyzer 추가 필드 —
    uvs: int = 0
    tier: Literal["주의", "경고", "위기"] = "주의"
    downstream_action: str = "ui_simple_home"
    fwb_confidence: Literal["indicative", "validated"] = "indicative"
    amplification_triggered: bool = False
    driver_attribution: dict = field(default_factory=dict)
    rationale: str = ""


@dataclass
class CashflowCalculation:
    """[5] Final Cashflow Calculation"""
    pension_replacement_rate: float  # 은퇴 후 연금소득 / 은퇴 전 월소득
    survival_months_at_retirement: float  # 60세 은퇴 직후 생존 여력
    survival_months_retire: float  # 은퇴 후 생존 여력
    income_gap_years: float     # 소득 공백기 (년)
    dsr_now: float              # DSR 재직 중
    dsr_retire: float           # DSR 은퇴 후
    shortfall_monthly: int      # 월 부족액
    income_gap_months: int = 0  # 소득 공백기 (월)
    life_expectancy_age: float = 80.0
    retirement_total_shortfall_estimated: int = 0
    retirement_total_shortfall_after_assets: int = 0


@dataclass
class DashboardCard:
    """[6] Dashboard Agent 출력"""
    pension_breakdown: dict
    goal_achievement_rate: float
    action_items: list[str]
    timeline_data: dict         # 소득 전환 타임라인


@dataclass
class ScenarioOptions:
    """프론트에서 받은 은퇴 시나리오 입력값."""
    retirement_age: int = 60
    target_monthly_expense: int = 0


@dataclass
class ScenarioComparison:
    """연금 수령방식 시나리오 tool 결과."""
    target_monthly_expense: int
    retirement_age: int
    scenarios: list[dict]
    recommended_scenario_id: str
    recommendation_reason: str
    tool_trace: list[dict] = field(default_factory=list)


@dataclass
class GuardRailResult:
    """GuardRail Agent"""
    passed: bool
    blocked_phrases: list[str]
    safe_response: str


@dataclass
class ReviewCase:
    """실무자 검토 케이스"""
    customer_id: str
    priority: Literal["긴급", "주의", "모니터"]
    flag_reason: str
    agent_evidence: str


# ── LangGraph AgentState ─────────────────────────────────

class AgentState(TypedDict):
    # 입력
    customer_id: str
    query: str
    mydata_raw: Optional[dict]              # 원본 마이데이터 (JSON)
    cfpb_input: Optional[CFPBInput]         # CFPB 5문항 응답 (프론트에서 받음)
    scenario_options: Optional[ScenarioOptions]

    # Orchestration 분기
    feature_change: Optional[FeatureChangeResult]
    needs_reanalysis: bool                  # True: 풀 파이프라인 / False: 캐시 반환

    # [1] ~ [6] Agent 결과
    data_mapping: Optional[DataMappingResult]
    cashflow_snapshot: Optional[CashflowSnapshot]
    routing: Optional[RoutingResult]
    persona: Optional[PersonaClassification]
    calculation: Optional[CashflowCalculation]
    scenario_comparison: Optional[ScenarioComparison]
    dashboard: Optional[DashboardCard]

    # GuardRail
    guardrail: Optional[GuardRailResult]

    # 최종 출력
    final_response: Optional[str]
    review_case: Optional[ReviewCase]

    # User State 업데이트용
    user_state_updated: bool

    # 에러
    error: Optional[str]

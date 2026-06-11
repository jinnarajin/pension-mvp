// src/App.tsx
// Single-page mobile-first UI. Results update on every keystroke
// via useMemo, so there's no "submit" button.

import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import type { PensionInput } from "./models/pension";
import {
  diagnose,
  formatKRW,
  formatPercent,
} from "./services/pensionCalculator";
import {
  getApiItemsByNumbers,
  recommendApiNumbers,
} from "./data/pensionOpenApiCatalog";
import {
  fetchFssPensionStat,
  fetchPsGuaranteedProdList,
  fetchRpGuaranteedProdList,
  getFssPensionStatRequestUrl,
  getPsGuaranteedProdListRequestUrl,
  getRpGuaranteedProdListRequestUrl,
  type PsGuaranteedProdListParams,
  type RpGuaranteedProdListParams,
  type FssApiResponse,
  type FssPensionStatResponse,
} from "./services/fssOpenApi";
import {
  fetchAiDiagnosis,
  fetchPersona,
  pensionInputFromMyData,
  type AiAgentExtras,
  type AnalyzeResponse,
  type CfpbAnswers,
  type MyDataPayload,
} from "./services/pensionAiAgent";
import {
  CFPB_QUESTIONS,
  P1_OPTIONS,
  P2_OPTIONS,
  P1_INTRO,
  P2_INTRO,
} from "./data/cfpbQuestions";

// Default dummy data as specified in the brief.
const DEFAULT_INPUT: PensionInput = {
  nationalPension: 700000,
  retirementPension: 300000,
  privatePension: 200000,
  targetMonthlyCost: 2000000,
  currentMonthlyLivingCost: 1800000,
  deposit: 50000000,
  loan: 10000000,
};

// Map status to a color class so the result card visually reflects the state.
const STATUS_COLOR: Record<string, string> = {
  SUFFICIENT: "status-sufficient",
  NEEDS_REVIEW: "status-review",
  NEEDS_PREPARATION: "status-prepare",
  NEEDS_FOCUSED_MGMT: "status-focus",
};

// Wizard step config — 5단계 (CFPB 5문항 step이 간이진단↔AI 상세 사이에 들어감).
// 사용자 표기 "1, 2, 2.5, 3, 4" — 2.5는 그대로 보여줘서 보조 단계임을 표현.
const STEP_LABELS = ["입력", "간이 진단", "CFPB 설문", "AI 상세", "다음 액션"] as const;
const STEP_BADGES = ["1", "2", "2.5", "3", "4"] as const;
const STEP_PRIMARY_LABEL = [
  "결과 보기",            // 0 → 1
  "재무 웰빙 설문",       // 1 → 2 (CFPB)
  "AI 진단 받기",         // 2 → 3 (자동 트리거 + AI 상세 보기)
  "다음 단계로",          // 3 → 4
  "처음부터 다시",        // 4 → 0
] as const;
const STEP_LS_KEY = "pension-wizard-step";
const MAX_STEP = STEP_LABELS.length - 1;

export default function App() {
  const [input, setInput] = useState<PensionInput>(DEFAULT_INPUT);
  // Wizard step (0–3). Persisted across reloads so refreshes don't lose place.
  const [step, setStep] = useState<number>(() => {
    const v = Number(localStorage.getItem(STEP_LS_KEY));
    return Number.isInteger(v) && v >= 0 && v <= MAX_STEP ? v : 0;
  });
  // CFPB 5문항 응답 (Step 2 입력). 모두 채워져야 AI 진단 가능.
  const [cfpbAnswers, setCfpbAnswers] = useState<CfpbAnswers>({});
  const cfpbComplete = CFPB_QUESTIONS.every((q) => cfpbAnswers[q.id]);
  useEffect(() => {
    localStorage.setItem(STEP_LS_KEY, String(step));
    // Smooth scroll to top of body when step changes — matches the prototype's
    // fresh-page feel where each step is a self-contained view.
    document.querySelector(".container")?.scrollTo?.({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // When a built-in persona is loaded, we keep its full MyData payload so the
  // /analyze call can replay it verbatim. Scenario inputs such as target living
  // cost should override calculation options without discarding the persona.
  const [aiPayload, setAiPayload] = useState<MyDataPayload | null>(null);
  const [aiExtras, setAiExtras] = useState<AiAgentExtras>({
    age: 50,
    risk_tolerance: "중립형",
  });
  const [aiState, setAiState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    data: AnalyzeResponse | null;
    error: string;
  }>({ status: "idle", data: null, error: "" });
  const [apiState, setApiState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    data: FssPensionStatResponse | null;
    error: string;
  }>({
    status: "idle",
    data: null,
    error: "",
  });
  const [guaranteedParams, setGuaranteedParams] = useState<RpGuaranteedProdListParams>({
    areaCode: 1,
    sysType: 3,
    productType: 1,
    reportDate: "2026/06",
  });
  const [guaranteedState, setGuaranteedState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    data: FssApiResponse | null;
    error: string;
  }>({
    status: "idle",
    data: null,
    error: "",
  });
  const [psGuaranteedParams, setPsGuaranteedParams] = useState<PsGuaranteedProdListParams>({
    areaCode: 4,
    channelCode: 4,
  });
  const [psGuaranteedState, setPsGuaranteedState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    data: FssApiResponse | null;
    error: string;
  }>({
    status: "idle",
    data: null,
    error: "",
  });

  // useMemo so the diagnosis recomputes only when inputs change.
  const result = useMemo(() => diagnose(input), [input]);
  const recommendedApis = useMemo(
    () => getApiItemsByNumbers(recommendApiNumbers(result.status)),
    [result.status]
  );
  const requestUrl = useMemo(
    () => getFssPensionStatRequestUrl(import.meta.env.VITE_FSS_OPENAPI_KEY),
    []
  );
  const guaranteedRequestUrl = useMemo(
    () =>
      getRpGuaranteedProdListRequestUrl(
        guaranteedParams,
        import.meta.env.VITE_FSS_OPENAPI_KEY
      ),
    [guaranteedParams]
  );
  const psGuaranteedRequestUrl = useMemo(
    () =>
      getPsGuaranteedProdListRequestUrl(
        psGuaranteedParams,
        import.meta.env.VITE_FSS_OPENAPI_KEY
      ),
    [psGuaranteedParams]
  );
  const psGuaranteedProducts = useMemo(
    () => extractPsGuaranteedProducts(psGuaranteedState.data),
    [psGuaranteedState.data]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPensionStat() {
      setApiState({ status: "loading", data: null, error: "" });

      try {
        const data = await fetchFssPensionStat();

        if (!cancelled) {
          setApiState({ status: "success", data, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setApiState({
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : "API 호출에 실패했습니다.",
          });
        }
      }
    }

    void loadPensionStat();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGuaranteedProducts() {
      setGuaranteedState({ status: "loading", data: null, error: "" });

      try {
        const data = await fetchRpGuaranteedProdList(guaranteedParams);

        if (!cancelled) {
          setGuaranteedState({ status: "success", data, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setGuaranteedState({
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : "API 호출에 실패했습니다.",
          });
        }
      }
    }

    void loadGuaranteedProducts();

    return () => {
      cancelled = true;
    };
  }, [guaranteedParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadPsGuaranteedProducts() {
      setPsGuaranteedState({ status: "loading", data: null, error: "" });

      try {
        const data = await fetchPsGuaranteedProdList(psGuaranteedParams);

        if (!cancelled) {
          setPsGuaranteedState({ status: "success", data, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setPsGuaranteedState({
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : "API 호출에 실패했습니다.",
          });
        }
      }
    }

    void loadPsGuaranteedProducts();

    return () => {
      cancelled = true;
    };
  }, [psGuaranteedParams]);

  // CAUTION: an empty input becomes "" — Number("") is 0, which is what we want.
  // But Number("12a") becomes NaN. The calculator guards against NaN.
  const handleChange =
    (key: keyof PensionInput) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9]/g, ""); // digits only
      setInput((prev) => ({ ...prev, [key]: raw === "" ? 0 : Number(raw) }));
      if (key !== "targetMonthlyCost" && key !== "currentMonthlyLivingCost") {
        setAiPayload(null);
      }
    };

  async function handleLoadPersona(id: string) {
    setAiState({ status: "loading", data: null, error: "" });
    try {
      const payload = await fetchPersona(id);
      setAiPayload(payload);
      setInput(pensionInputFromMyData(payload));
      const profile = payload.profile as {
        age: number;
        risk_tolerance: AiAgentExtras["risk_tolerance"];
        job_type: string;
      };
      setAiExtras({
        customer_id: id,
        age: profile.age,
        retire_age: Math.max(profile.age + 1, 60),
        risk_tolerance: profile.risk_tolerance,
        job_type: profile.job_type,
      });
      setAiState({ status: "idle", data: null, error: "" });
    } catch (err) {
      setAiState({ status: "error", data: null, error: String(err) });
    }
  }

  async function handleRunAi() {
    setAiState({ status: "loading", data: null, error: "" });
    try {
      // CFPB 5문항 완료 시 함께 전송 → 백엔드가 [3] CFPB 채점 + [4] UVS 산출
      const cfpb = cfpbComplete
        ? {
            answers: cfpbAnswers as Required<CfpbAnswers>,
            age: aiExtras.age ?? 50,
            mode: "self" as const,
            translation_validated: false,
          }
        : undefined;
      const response = await fetchAiDiagnosis(input, aiExtras, aiPayload ?? undefined, cfpb);
      setAiState({ status: "success", data: response, error: "" });
    } catch (err) {
      setAiState({ status: "error", data: null, error: String(err) });
    }
  }

  // CFPB 완료 후 "AI 진단 받기" 트리거: handleRunAi 실행 + 완료되면 다음 step
  async function handleCfpbSubmit() {
    if (!cfpbComplete) return;
    setStep(3); // AI 상세 step으로 미리 이동 (로딩 UI 보이도록)
    await handleRunAi();
  }

  return (
    <div className="page">
      <main className="container">
        {/* 1. Topbar: brand + step indicator */}
        <header className="topbar card">
          <div className="brand-row">
            <span className="brand-name">
              연금 진단<small> JD·JB 금융 MVP</small>
            </span>
            <span className="badge" style={{ marginBottom: 0 }}>
              {STEP_LABELS[step]}
            </span>
          </div>
          <StepBar
            labels={[...STEP_LABELS]}
            badges={[...STEP_BADGES]}
            current={step}
            onJump={(i) => setStep(i)}
          />
        </header>

        {/* Step 0: 입력 */}
        {step === 0 && (<>
        {/* Hero copy (kept as visible page header for step 0) */}
        <section className="card hero-card">
          <h1 className="hero-title">내 노후 생활비, 준비되어 있을까요?</h1>
          <p className="hero-sub">
            예상 연금과 목표 생활비를 입력하면
            <br />
            준비 상태를 단계별로 진단해 드려요.
          </p>
        </section>

        {/* 2. Input Card */}
        <section className="card">
          <h2 className="card-title">내 연금 정보 입력</h2>
          <p className="card-help">
            월 단위 금액과 총액 정보를 나눠 입력하세요. 입력하는 즉시 결과가 바뀝니다.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#666", alignSelf: "center" }}>샘플 페르소나:</span>
            <button
              type="button"
              className="api-fetch-btn"
              onClick={() => void handleLoadPersona("PA-0001")}
              disabled={aiState.status === "loading"}
            >
              PA-0001 (57세 공무원)
            </button>
            <button
              type="button"
              className="api-fetch-btn"
              onClick={() => void handleLoadPersona("PB-0001")}
              disabled={aiState.status === "loading"}
            >
              PB-0001 (35세 회사원)
            </button>
          </div>

          <NumberField
            label="목표 월 노후 생활비"
            value={input.targetMonthlyCost}
            onChange={handleChange("targetMonthlyCost")}
          />
          <NumberField
            label="현재 월 생활비"
            value={input.currentMonthlyLivingCost}
            onChange={handleChange("currentMonthlyLivingCost")}
          />
        </section>
        </>)}

        {/* Step 1: 간이 진단 */}
        {step === 1 && (<>
        {/* 3. Diagnosis Result Card */}
        <section className={`card result-card ${STATUS_COLOR[result.status]}`}>
          <h2 className="card-title">진단 결과</h2>

          <div className="status-pill">{result.statusLabel}</div>
          <p className="status-message">{result.statusMessage}</p>

          <ul className="kv-list">
            <KV
              label="총 예상 월 연금"
              value={formatKRW(result.totalMonthlyPension)}
            />
            <KV
              label="목표 월 노후 생활비"
              value={formatKRW(result.targetMonthlyCost)}
            />
            <KV
              label="월 부족액"
              value={formatKRW(result.shortageAmount)}
              highlight
            />
            <KV label="부족률" value={formatPercent(result.shortageRate)} />
            <KV
              label="현재 월 생활비"
              value={formatKRW(result.currentMonthlyLivingCost)}
            />
            <KV label="예금/현금성 자산" value={formatKRW(result.deposit)} />
            <KV label="대출 잔액" value={formatKRW(result.loan)} />
            <KV
              label="순자산"
              value={formatKRW(result.netFinancialAssets)}
              highlight
            />
          </ul>
        </section>
        </>)}

        {/* Step 2: CFPB 5문항 설문 (NEW) */}
        {step === 2 && (<>
        <section className="card">
          <h2 className="card-title">재무 웰빙 설문 (CFPB 약식 5문항)</h2>
          <p className="card-help">
            아래 5개 문장에 솔직하게 답해 주세요. 응답은 결정론적 룩업표로 채점돼
            <br />다음 단계의 AI 취약성 진단에 사용됩니다.
          </p>
          <p style={{ fontSize: 12, color: "#aab1bf", marginTop: 0 }}>
            출처: CFPB Financial Well-Being Scale (Abbreviated). 한국어는 비검증 번역 — 점수는 참고치.
          </p>
          <CfpbForm answers={cfpbAnswers} onChange={setCfpbAnswers} />
          <div style={{ marginTop: 12, fontSize: 13, color: cfpbComplete ? "#0a7" : "#aab1bf" }}>
            {cfpbComplete ? "✓ 5문항 모두 응답 완료" : `${Object.values(cfpbAnswers).filter(Boolean).length} / 5 응답`}
          </div>
        </section>
        </>)}

        {/* Step 3: AI 상세 진단 (CFPB 채점 + UVS 산출 결과 표시) */}
        {step === 3 && (<>
        {/* 3-b. AI 멀티 에이전트 상세 진단 — POST /analyze */}
        <section className="card">
          <h2 className="card-title">AI 멀티 에이전트 상세 진단</h2>
          <p className="card-help">
            LangGraph 12 Agent 파이프라인 (취약성 점수, 갈아타기 점수, GuardRail 검증 포함).
            응답까지 10–15초 정도 소요됩니다.
          </p>

          <div className="ai-extras-grid">
            <label className="ai-extra-field">
              <span>나이</span>
              <input
                type="number"
                min={20}
                max={100}
                value={aiExtras.age ?? 50}
                onChange={(e) =>
                  setAiExtras((prev) => ({ ...prev, age: Number(e.target.value) || 50 }))
                }
              />
            </label>
            <label className="ai-extra-field">
              <span>은퇴나이</span>
              <input
                type="number"
                min={40}
                max={90}
                value={aiExtras.retire_age ?? Math.max((aiExtras.age ?? 50) + 1, 60)}
                onChange={(e) =>
                  setAiExtras((prev) => ({ ...prev, retire_age: Number(e.target.value) || 60 }))
                }
              />
            </label>
            <label className="ai-extra-field">
              <span>위험 성향</span>
              <select
                value={aiExtras.risk_tolerance ?? "중립형"}
                onChange={(e) =>
                  setAiExtras((prev) => ({
                    ...prev,
                    risk_tolerance: e.target.value as AiAgentExtras["risk_tolerance"],
                  }))
                }
              >
                <option value="안정형">안정형</option>
                <option value="중립형">중립형</option>
                <option value="공격형">공격형</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            className="api-fetch-btn"
            onClick={() => void handleRunAi()}
            disabled={aiState.status === "loading"}
            style={{ marginTop: 12 }}
          >
            {aiState.status === "loading" ? "AI 분석 중…" : "🤖 AI 진단 받기"}
          </button>

          {aiPayload && (
            <p className="card-help" style={{ marginTop: 8, color: "#0a7" }}>
              ✓ 페르소나 데이터 로드됨 — 백엔드 스모크 테스트와 동일한 결과가 나옵니다.
            </p>
          )}

          {aiState.status === "error" && (
            <p style={{ color: "#c33", marginTop: 12, fontSize: 13 }}>
              오류: {aiState.error}
            </p>
          )}

          {aiState.status === "success" && aiState.data && (
            <div style={{ marginTop: 16 }}>
              <div className="status-pill">
                UVS {aiState.data.uvs}점 · {aiState.data.tier}
                {aiState.data.needs_review && ` · 실무자 검토 ${aiState.data.review_priority ?? ""}`.trim()}
              </div>
              <ul className="kv-list" style={{ marginTop: 12 }}>
                <KV label="CFPB fwb_score" value={`${aiState.data.fwb_score}점 (${aiState.data.fwb_confidence === "validated" ? "검증" : "참고치"})`} />
                <KV label="후속 조치" value={aiState.data.downstream_action} />
              </ul>
              {aiState.data.rationale && (
                <p style={{ fontSize: 12, color: "#aab1bf", marginTop: 8, lineHeight: 1.5 }}>
                  {aiState.data.rationale}
                </p>
              )}

              <h3 style={{ marginTop: 16, fontSize: 15 }}>액션 아이템</h3>
              <ol className="action-list">
                {aiState.data.action_items.length === 0 && <li>(없음)</li>}
                {aiState.data.action_items.map((a, i) => (
                  <li key={i}>
                    <strong>{i + 1}.</strong> {a}
                  </li>
                ))}
              </ol>

              <h3 style={{ marginTop: 16, fontSize: 15 }}>AI 답변</h3>
              <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>
                {aiState.data.final_response}
              </p>

              <h3 style={{ marginTop: 16, fontSize: 15 }}>연금 구성 (월)</h3>
              <ul className="kv-list">
                {Object.entries(aiState.data.dashboard.pension_breakdown).map(([k, v]) => (
                  <KV key={k} label={k} value={formatKRW(v)} />
                ))}
                <KV
                  label="목표 달성률"
                  value={`${aiState.data.dashboard.goal_achievement_rate}%`}
                  highlight
                />
              </ul>

              {aiState.data.scenario_comparison?.scenarios?.length ? (
                <>
                  <h3 style={{ marginTop: 16, fontSize: 15 }}>연금 수령방식 시나리오</h3>
                  <p style={{ fontSize: 12, color: "#aab1bf", lineHeight: 1.5 }}>
                    추천: {aiState.data.scenario_comparison.recommended_scenario_id} ·{" "}
                    {aiState.data.scenario_comparison.recommendation_reason}
                  </p>
                  <ol className="action-list">
                    {aiState.data.scenario_comparison.scenarios.map((scenario) => (
                      <li key={scenario.scenario_id}>
                        <strong>{scenario.title}</strong>
                        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
                          월 수령액 {formatKRW(scenario.monthly_pension_from_retirement_money)} ·
                          초기 유동성 {formatKRW(scenario.initial_liquidity)} ·
                          공백기 생존여력 {scenario.survival_months_gap}개월
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#aab1bf", lineHeight: 1.5 }}>
                          예상 세금 {formatKRW(scenario.estimated_tax_total)} ·
                          일시금 대비 절세 {formatKRW(scenario.total_tax_saving_vs_lump_sum)}
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}

              {(() => {
                const terms = aiState.data.dashboard.timeline_data.rag_terms as
                  | Record<string, string>
                  | undefined;
                if (!terms || Object.keys(terms).length === 0) return null;
                return (
                  <>
                    <h3 style={{ marginTop: 16, fontSize: 15 }}>금융 용어 참고</h3>
                    <ul className="kv-list">
                      {Object.entries(terms).map(([term, explanation]) => (
                        <li key={term}>
                          <span>{term}</span>
                          <strong style={{ textAlign: "right", maxWidth: "58%", lineHeight: 1.35 }}>
                            {explanation}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </div>
          )}
        </section>
        </>)}

        {/* Step 4: 다음 액션 (추천 행동 + 연관 OpenAPI 활용) */}
        {step === 4 && (<>
        {/* 4. Recommended Actions Card */}
        <section className="card">
          <h2 className="card-title">추천 행동</h2>
          <ol className="action-list">
            <li>
              <strong>1.</strong> 국민연금 예상 수령액을 확인해 보세요.
            </li>
            <li>
              <strong>2.</strong> 추가 퇴직연금이나 개인연금이 있는지
              확인해 보세요.
            </li>
            <li>
              <strong>3.</strong> 부족하다면 활용할 수 있는 공적 지원
              제도를 확인해 보세요.
            </li>
          </ol>
        </section>

        {/* 5. Related OpenAPI Card */}
        <section className="card">
          <h2 className="card-title">관련 OpenAPI 추천</h2>
          <p className="card-help">
            현재 준비 상태에 도움이 될 만한 통합연금포털 OpenAPI 항목입니다.
          </p>

          <ul className="api-list">
            {recommendedApis.map((api) => (
              <li key={api.number} className="api-item">
                <div className="api-head">
                  <span className="api-number">No.{api.number}</span>
                  <span className="api-category">{api.category}</span>
                </div>
                <h3 className="api-name">{api.name}</h3>
                <p className="api-desc">{api.description}</p>
                <p className="api-fields">
                  <strong>결과 항목 :</strong> {api.resultFields}
                </p>
                <p className="api-usage">
                  <strong>활용 :</strong> {api.usagePurpose}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* 7. Live API Preview Card */}
        <section className="card api-live-card">
          <div className="api-live-head">
            <h2 className="card-title">퇴직연금 수익률 API</h2>
            <button
              type="button"
              className="refresh-button"
              onClick={() => {
                void (async () => {
                  setApiState({ status: "loading", data: null, error: "" });
                  try {
                    const data = await fetchFssPensionStat();
                    setApiState({ status: "success", data, error: "" });
                  } catch (error) {
                    setApiState({
                      status: "error",
                      data: null,
                      error:
                        error instanceof Error
                          ? error.message
                          : "API 호출에 실패했습니다.",
                    });
                  }
                })();
              }}
            >
              다시 불러오기
            </button>
          </div>
          <p className="card-help">
            FSS OpenAPI key를 .env 파일의 VITE_FSS_OPENAPI_KEY에 넣으면 바로 조회됩니다.
          </p>

          <div className="api-meta">
            <span>요청 URL</span>
            <code>{requestUrl}</code>
          </div>

          {apiState.status === "loading" && (
            <p className="api-status">수익률 데이터를 불러오는 중입니다...</p>
          )}

          {apiState.status === "error" && (
            <p className="api-status api-status-error">{apiState.error}</p>
          )}

          {apiState.status === "success" && apiState.data && (
            <>
              <p className="api-status api-status-success">
                응답을 받아왔습니다. code={String(apiState.data.code ?? "-")}
                {apiState.data.message ? `, message=${String(apiState.data.message)}` : ""}
              </p>
              <pre className="api-json">
                {JSON.stringify(apiState.data, null, 2)}
              </pre>
            </>
          )}
        </section>

        <section className="card api-live-card">
          <div className="api-live-head">
            <h2 className="card-title">원리금보장상품 목록 API</h2>
            <button
              type="button"
              className="refresh-button"
              onClick={() => {
                void (async () => {
                  setGuaranteedState({ status: "loading", data: null, error: "" });
                  try {
                    const data = await fetchRpGuaranteedProdList(guaranteedParams);
                    setGuaranteedState({ status: "success", data, error: "" });
                  } catch (error) {
                    setGuaranteedState({
                      status: "error",
                      data: null,
                      error:
                        error instanceof Error
                          ? error.message
                          : "API 호출에 실패했습니다.",
                    });
                  }
                })();
              }}
            >
              다시 불러오기
            </button>
          </div>
          <p className="card-help">
            권역, 제도유형, 상품유형, 기준시점을 바꾸면 같은 방식으로 조회됩니다.
          </p>

          <div className="api-filter-grid">
            <label className="filter-field">
              <span>권역</span>
              <select
                value={guaranteedParams.areaCode}
                onChange={(e) =>
                  setGuaranteedParams((prev) => ({ ...prev, areaCode: Number(e.target.value) }))
                }
              >
                <option value={1}>1 - 은행</option>
                <option value={3}>3 - 자산운용</option>
                <option value={4}>4 - 생명보험</option>
                <option value={5}>5 - 손해보험</option>
              </select>
            </label>

            <label className="filter-field">
              <span>제도 유형</span>
              <select
                value={guaranteedParams.sysType}
                onChange={(e) =>
                  setGuaranteedParams((prev) => ({ ...prev, sysType: Number(e.target.value) }))
                }
              >
                <option value={1}>1 - DB</option>
                <option value={2}>2 - DC</option>
                <option value={3}>3 - IRP</option>
              </select>
            </label>

            <label className="filter-field">
              <span>상품 유형</span>
              <select
                value={guaranteedParams.productType ?? ""}
                onChange={(e) =>
                  setGuaranteedParams((prev) => ({
                    ...prev,
                    productType: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
              >
                <option value="">전체</option>
                <option value={1}>1 - 은행 예적금</option>
                <option value={2}>2 - 저축은행 예적금</option>
                <option value={3}>3 - 우체국 예적금</option>
                <option value={4}>4 - 금리연동형 보험</option>
                <option value={5}>5 - 이율보증형 보험</option>
                <option value={6}>6 - 정부보증채</option>
                <option value={7}>7 - 원리금파생상품결합사채</option>
                <option value={8}>8 - 환매조건부 매수계약</option>
                <option value={9}>9 - 발행어음 및 표지어음</option>
              </select>
            </label>

            <label className="filter-field filter-field-wide">
              <span>기준 시점</span>
              <input
                type="text"
                value={guaranteedParams.reportDate}
                onChange={(e) =>
                  setGuaranteedParams((prev) => ({ ...prev, reportDate: e.target.value }))
                }
                placeholder="YYYY/MM"
              />
            </label>
          </div>

          <div className="api-meta">
            <span>요청 URL</span>
            <code>{guaranteedRequestUrl}</code>
          </div>

          {guaranteedState.status === "loading" && (
            <p className="api-status">원리금보장상품 데이터를 불러오는 중입니다...</p>
          )}

          {guaranteedState.status === "error" && (
            <p className="api-status api-status-error">{guaranteedState.error}</p>
          )}

          {guaranteedState.status === "success" && guaranteedState.data && (
            <>
              <p className="api-status api-status-success">
                응답을 받아왔습니다. code={String(guaranteedState.data.code ?? "-")}
                {guaranteedState.data.message
                  ? `, message=${String(guaranteedState.data.message)}`
                  : ""}
              </p>
              <pre className="api-json">
                {JSON.stringify(guaranteedState.data, null, 2)}
              </pre>
            </>
          )}
        </section>

        <section className="card api-live-card">
          <div className="api-live-head">
            <h2 className="card-title">연금저축 원리금보장보험 API</h2>
            <button
              type="button"
              className="refresh-button"
              onClick={() => {
                void (async () => {
                  setPsGuaranteedState({ status: "loading", data: null, error: "" });
                  try {
                    const data = await fetchPsGuaranteedProdList(psGuaranteedParams);
                    setPsGuaranteedState({ status: "success", data, error: "" });
                  } catch (error) {
                    setPsGuaranteedState({
                      status: "error",
                      data: null,
                      error:
                        error instanceof Error
                          ? error.message
                          : "API 호출에 실패했습니다.",
                    });
                  }
                })();
              }}
            >
              다시 불러오기
            </button>
          </div>
          <p className="card-help">
            판매 중인 원리금보장 연금저축보험의 공시이율, 최저 보증이율, 수수료부과 구조를 확인합니다.
          </p>

          <div className="api-filter-grid">
            <label className="filter-field">
              <span>권역</span>
              <select
                value={psGuaranteedParams.areaCode ?? ""}
                onChange={(e) =>
                  setPsGuaranteedParams((prev) => ({
                    ...prev,
                    areaCode: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
              >
                <option value="">전체</option>
                <option value={4}>4 - 생명보험</option>
                <option value={5}>5 - 손해보험</option>
              </select>
            </label>

            <label className="filter-field">
              <span>가입자 구분</span>
              <select
                value={psGuaranteedParams.channelCode ?? ""}
                onChange={(e) =>
                  setPsGuaranteedParams((prev) => ({
                    ...prev,
                    channelCode: e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
              >
                <option value="">전체</option>
                <option value={1}>1 - 설계사</option>
                <option value={3}>3 - 대리점</option>
                <option value={4}>4 - 온라인</option>
              </select>
            </label>
          </div>

          <div className="api-meta">
            <span>요청 URL</span>
            <code>{psGuaranteedRequestUrl}</code>
          </div>

          {psGuaranteedState.status === "loading" && (
            <p className="api-status">연금저축 원리금보장보험 데이터를 불러오는 중입니다...</p>
          )}

          {psGuaranteedState.status === "error" && (
            <p className="api-status api-status-error">{psGuaranteedState.error}</p>
          )}

          {psGuaranteedState.status === "success" && psGuaranteedState.data && (
            <>
              <p className="api-status api-status-success">
                총 {psGuaranteedProducts.length}건의 상품을 불러왔습니다.
                {psGuaranteedState.data.message
                  ? ` ${String(psGuaranteedState.data.message)}`
                  : ""}
              </p>

              {psGuaranteedProducts.length > 0 ? (
                <ul className="product-list">
                  {psGuaranteedProducts.map((product, index) => (
                    <li key={`${product.title}-${index}`} className="product-card">
                      <div className="product-head">
                        <div>
                          <p className="product-kicker">상품 {index + 1}</p>
                          <h3 className="product-title">{product.title}</h3>
                          {product.subtitle && (
                            <p className="product-subtitle">{product.subtitle}</p>
                          )}
                        </div>
                      </div>

                      <dl className="product-grid">
                        {product.rows.map((row) => (
                          <div key={row.label} className="product-row">
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                          </div>
                        ))}
                      </dl>

                      <details className="product-details">
                        <summary>원문 필드 보기</summary>
                        <pre className="api-json">{JSON.stringify(product.raw, null, 2)}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="api-status">목록 형태의 상품 데이터를 찾지 못했습니다.</p>
              )}
            </>
          )}
        </section>

        </>)}

        {/* 6. Bottom Notice */}
        <footer className="notice">
          본 결과는 입력하신 금액을 바탕으로 한 간이 진단입니다.
          실제 연금 수령액은 공식 기관 데이터에 따라 달라질 수 있어요.
        </footer>

        {/* Bottom action bar — prev arrow + primary "next".
            Step 2 (CFPB) → Step 3 (AI 상세) 전환은 handleCfpbSubmit가 가로채서
            handleRunAi() 자동 실행 + step 전환을 함께 처리. */}
        <div className="step-actions">
          {step > 0 ? (
            <button
              type="button"
              className="btn-prev"
              onClick={() => setStep(step - 1)}
              aria-label="이전 단계"
            >
              ←
            </button>
          ) : (
            <span style={{ flex: "0 0 56px" }} />
          )}
          <button
            type="button"
            className="btn-next"
            onClick={() => {
              if (step === 2) {
                // CFPB → AI 자동 트리거
                void handleCfpbSubmit();
              } else if (step < MAX_STEP) {
                setStep(step + 1);
              } else {
                setStep(0);
              }
            }}
            disabled={step === 2 && !cfpbComplete}
            style={step === 2 && !cfpbComplete ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            {STEP_PRIMARY_LABEL[step]} {step < MAX_STEP ? "→" : ""}
          </button>
        </div>
      </main>
    </div>
  );
}

// ── StepBar component ─────────────────────────────────────────────
function StepBar({
  labels,
  badges,
  current,
  onJump,
}: {
  labels: string[];
  badges?: string[];
  current: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="stepwrap">
      <div className="dots-row">
        {labels.map((_, i) => (
          <React.Fragment key={i}>
            <button
              type="button"
              className={`dot ${i === current ? "on" : i < current ? "done" : ""}`}
              onClick={() => onJump(i)}
              aria-label={`${labels[i]} 단계로 이동`}
            >
              {badges ? badges[i] : i + 1}
            </button>
            {i < labels.length - 1 && (
              <span className={`ln ${i < current ? "fill" : ""}`} />
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="step-label">{labels[current]}</div>
    </div>
  );
}

// ── CFPB 5-question form ─────────────────────────────────────────
function CfpbForm({
  answers,
  onChange,
}: {
  answers: CfpbAnswers;
  onChange: (next: CfpbAnswers) => void;
}) {
  // Group questions by part so the two intros render once each.
  const p1 = CFPB_QUESTIONS.filter((q) => q.part === "P1");
  const p2 = CFPB_QUESTIONS.filter((q) => q.part === "P2");

  function setAnswer(id: keyof CfpbAnswers, value: string) {
    onChange({ ...answers, [id]: value } as CfpbAnswers);
  }

  return (
    <div>
      <div className="cfpb-intro">{P1_INTRO}</div>
      {p1.map((q) => (
        <div key={q.id} className="cfpb-q">
          <div className="cfpb-q-text">{q.text_ko}</div>
          <div className="cfpb-opts">
            {P1_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`cfpb-opt ${answers[q.id] === o.value ? "on" : ""}`}
                onClick={() => setAnswer(q.id, o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="cfpb-intro" style={{ marginTop: 16 }}>{P2_INTRO}</div>
      {p2.map((q) => (
        <div key={q.id} className="cfpb-q">
          <div className="cfpb-q-text">{q.text_ko}</div>
          <div className="cfpb-opts">
            {P2_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`cfpb-opt ${answers[q.id] === o.value ? "on" : ""}`}
                onClick={() => setAnswer(q.id, o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Small reusable components ---

function NumberField(props: {
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const displayValue = Number.isFinite(props.value)
    ? props.value.toLocaleString("ko-KR")
    : "";

  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <div className="field-input-wrap">
        {/* inputMode=numeric brings up the number pad on mobile.
            We use type="text" so we can strictly filter digits ourselves. */}
        <input
          className="field-input"
          type="text"
          inputMode="numeric"
          value={displayValue === "0" ? "" : displayValue}
          onChange={props.onChange}
          placeholder="0"
        />
        <span className="field-suffix">원</span>
      </div>
    </label>
  );
}

function KV(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <li className={`kv ${props.highlight ? "kv-highlight" : ""}`}>
      <span className="kv-label">{props.label}</span>
      <span className="kv-value">{props.value}</span>
    </li>
  );
}

type PsGuaranteedProductCard = {
  title: string;
  subtitle?: string;
  rows: Array<{ label: string; value: string }>;
  raw: Record<string, unknown>;
};

function extractPsGuaranteedProducts(payload: unknown): PsGuaranteedProductCard[] {
  const source = getPsGuaranteedCollection(payload);

  return source
    .map((item, index) => buildPsGuaranteedProductCard(item, index))
    .filter((product): product is PsGuaranteedProductCard => Boolean(product));
}

function getPsGuaranteedCollection(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const preferredKeys = ["items", "list", "data", "rows", "result", "body"];

  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function buildPsGuaranteedProductCard(
  item: unknown,
  index: number
): PsGuaranteedProductCard | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const raw = item as Record<string, unknown>;
  const title =
    pickRecordValue(raw, ["상품명", "productName", "prodName", "name", "상품"])
      ?? `상품 ${index + 1}`;
  const company = pickRecordValue(raw, ["금융회사", "회사명", "companyName", "provider", "보험사"]);
  const rate = pickRecordValue(raw, ["공시이율", "disclosureRate", "rate", "금리"]);
  const minimumRate = pickRecordValue(raw, ["최저보증이율", "minimumGuaranteedRate", "minGuaranteeRate"]);
  const feeStructure = pickRecordValue(raw, ["수수료부과구조", "feeStructure", "fee"]);
  const area = pickRecordValue(raw, ["권역", "areaCode"]);
  const channel = pickRecordValue(raw, ["가입자구분", "channelCode"]);
  const reportDate = pickRecordValue(raw, ["기준시점", "reportDate"]);

  const rows = [
    company ? { label: "판매회사", value: company } : null,
    rate ? { label: "공시이율", value: rate } : null,
    minimumRate ? { label: "최저보증이율", value: minimumRate } : null,
    feeStructure ? { label: "수수료부과 구조", value: feeStructure } : null,
    area ? { label: "권역", value: area } : null,
    channel ? { label: "가입자 구분", value: channel } : null,
    reportDate ? { label: "기준 시점", value: reportDate } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  return {
    title,
    subtitle: [area, channel].filter(Boolean).join(" · ") || undefined,
    rows,
    raw,
  };
}

function pickRecordValue(source: Record<string, unknown>, candidates: string[]): string | undefined {
  const entries = Object.entries(source);

  for (const candidate of candidates) {
    const exact = entries.find(([key]) => key === candidate);
    if (exact) {
      return valueToText(exact[1]);
    }

    const lowerCandidate = candidate.toLowerCase();
    const partial = entries.find(([key]) => {
      const lowerKey = key.toLowerCase();
      return lowerKey.includes(lowerCandidate) || lowerCandidate.includes(lowerKey);
    });

    if (partial) {
      return valueToText(partial[1]);
    }
  }

  return undefined;
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => valueToText(entry)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { Actions } from "./components/Actions";
import { Analyzing } from "./components/Analyzing";
import { DataConsent } from "./components/DataConsent";
import { Dashboard } from "./components/Dashboard";
import { Onboarding } from "./components/Onboarding";
import { Questions } from "./components/Questions";
import { Report } from "./components/Report";
import { Snapshot } from "./components/Snapshot";
import type { PensionInput } from "./models/pension";
import {
  buildMyDataFromForm,
  fetchCustomQuestions,
  fetchAiDiagnosis,
  fetchPersona,
  fetchResultDashboard,
  fetchStatusCheck,
  pensionInputFromMyData,
  type AdaptiveAnswerPayload,
  type AnalyzeResponse,
  type CustomQuestion,
  type MyDataPayload,
  type ResultDashboardResponse,
  type StatusCheckResponse,
} from "./services/pensionAiAgent";

type Screen =
  | "onboarding"
  | "consent"
  | "snapshot"
  | "questions"
  | "analyzing"
  | "dashboard"
  | "report"
  | "actions";

type IntroPhase = "ready" | "playing" | "done";

const DEFAULT_INPUT: PensionInput = {
  nationalPension: 700000,
  retirementPension: 300000,
  privatePension: 200000,
  targetMonthlyCost: 2000000,
  currentMonthlyLivingCost: 1800000,
  deposit: 50000000,
  loan: 10000000,
};

const screenLabels: Record<Screen, string> = {
  onboarding: '시작',
  consent: '데이터 연동',
  snapshot: '현황 확인',
  questions: '맞춤 질문',
  analyzing: '분석 중',
  report: '분석 결과',
  dashboard: '수령 시뮬레이션',
  actions: '추천 행동',
};

const demoNarration: Record<Screen, { eyebrow: string; title: string; description: string; points: string[] }> = {
  onboarding: {
    eyebrow: '서비스 소개',
    title: '노후 현금흐름 분석',
    description: '연금과 자산 데이터를 기반으로 은퇴 이후 생활비 흐름을 미리 확인하는 서비스입니다.',
    points: ['마이데이터 기반 자산 연결', '연령별 현금흐름 예측', '실행 가능한 준비 방법 제안'],
  },
  consent: {
    eyebrow: '1단계',
    title: '마이데이터 연동',
    description: '연금, 자산, 지출 정보를 연결해 노후 현금흐름 분석의 기초 데이터를 준비합니다.',
    points: ['국민연금 예상 수령액', '금융자산 및 대출 잔액', '월 생활비 흐름'],
  },
  snapshot: {
    eyebrow: '2단계',
    title: '현황 확인',
    description: '연동된 데이터를 기반으로 1차적으로 계산을 해서 현재 자산과 예상 연금, 생활비를 확인하고 은퇴 목표를 입력합니다.',
    points: ['현재 자산 현황 확인', '예상 월 연금 계산', '은퇴 후 목표 생활비 입력'],
  },
  questions: {
    eyebrow: '3단계',
    title: '맞춤 질문',
    description: '사용자의 답변에 따라 LLM이 다음 질문을 다시 선택해 개인화된 분석 정확도를 높입니다.',
    points: ['답변 기반 질문 재선택', '총 5개 맞춤 질문', '개인별 취약 요인 반영'],
  },
  analyzing: {
    eyebrow: 'AI 분석',
    title: '답변과 데이터를 종합',
    description: '맞춤 질문 답변과 마이데이터를 함께 반영해 부족 시점, 현금흐름, 맞춤 행동을 계산합니다.',
    points: ['질문 우선순위 재계산', '자산 변화 흐름 예측', '최종 결과 요약 생성'],
  },
  report: {
    eyebrow: '결과 요약',
    title: '분석 결과',
    description: '월평균 현금흐름과 부족 예상 시점, 주요 원인을 한눈에 확인합니다.',
    points: ['생활비 부족 예상 시점', '월평균 순 현금흐름', '분석에 영향을 준 주요 요인'],
  },
  dashboard: {
    eyebrow: '상세 비교',
    title: '수령 시뮬레이션',
    description: '퇴직급여 수령 방식에 따라 자산 소진 시점과 월 현금흐름이 어떻게 달라지는지 비교합니다.',
    points: ['일시금·10년·20년 수령 비교', '수령 방식별 월 현금흐름', '예상 자산 잔액 그래프'],
  },
  actions: {
    eyebrow: '실행 제안',
    title: '추천 행동',
    description: '분석 결과를 바탕으로 지금 실행할 수 있는 준비 방법을 우선순위대로 제안합니다.',
    points: ['우선순위별 실행 항목', '준비 전후 비교', '전문가 상담 연결'],
  },
};

function DemoNarration({ screen }: { screen: Screen }) {
  const narration = demoNarration[screen];

  return (
    <aside className="demo-narration" aria-label="시연 설명">
      <p style={{ fontSize: 13, fontWeight: 800, color: '#2A7BD6', marginBottom: 10 }}>
        {narration.eyebrow}
      </p>
      <h1 style={{ fontSize: 30, fontWeight: 800, color: '#0D2B6B', lineHeight: '130%', margin: 0 }}>
        {narration.title}
      </h1>
      <p style={{ fontSize: 17, color: '#374151', lineHeight: '165%', marginTop: 18 }}>
        {narration.description}
      </p>
      <div className="space-y-3" style={{ marginTop: 28 }}>
        {narration.points.map((point) => (
          <div key={point} className="flex items-center gap-3">
            <span style={{ width: 8, height: 8, borderRadius: 8, background: '#37C27B', flex: '0 0 auto' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{point}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function DemoIntro({ phase, onStart }: { phase: IntroPhase; onStart: () => void }) {
  if (phase === "done") return null;

  return (
    <div className={`demo-intro ${phase === "playing" ? "demo-intro-playing" : ""}`}>
      {phase === "ready" ? (
        <button className="demo-intro-start" onClick={onStart}>
          시연 시작
        </button>
      ) : (
        <div className="demo-intro-brand">
          <img src="/dundeun-naeil-intro-logo.png" alt="든든내일 로고" className="demo-intro-logo" />
          <h1 className="demo-intro-title">든든내일</h1>
        </div>
      )}
    </div>
  );
}

function App() {
  const [introPhase, setIntroPhase] = useState<IntroPhase>("ready");
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [input, setInput] = useState<PensionInput>(DEFAULT_INPUT);
  const [mydata, setMydata] = useState<MyDataPayload | undefined>();
  const [statusCheck, setStatusCheck] = useState<StatusCheckResponse | null>(null);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[] | null>(null);
  const [customQuestionsLoading, setCustomQuestionsLoading] = useState(false);
  const [customQuestionSelectionMode, setCustomQuestionSelectionMode] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [resultDashboard, setResultDashboard] = useState<ResultDashboardResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState("분석을 준비하고 있어요.");
  const [retireAge, setRetireAge] = useState(60);

  const navigate = useCallback((to: Screen) => {
    setScreen(to);
  }, []);

  function startDemoIntro() {
    setIntroPhase("playing");
  }

  useEffect(() => {
    if (introPhase !== "playing") return;
    const introTimer = window.setTimeout(() => {
      setIntroPhase("done");
    }, 2300);
    return () => window.clearTimeout(introTimer);
  }, [introPhase]);

  async function loadBackendViewData(
    payload: MyDataPayload,
    options: { retirementAge?: number; targetMonthlyExpense?: number; answers?: AdaptiveAnswerPayload[] } = {},
  ) {
    const request = {
      customer_id: "FIGMA-MAKE-MVP",
      mydata_raw: payload,
      retirement_age: options.retirementAge,
      target_monthly_expense: options.targetMonthlyExpense,
      answer_history: options.answers ?? [],
    };

    setCustomQuestionsLoading(true);
    setCustomQuestions(null);
    setCustomQuestionSelectionMode(null);
    const [status, questions] = await Promise.all([
      fetchStatusCheck(request).catch(() => null),
      fetchCustomQuestions(request).catch(() => null),
    ]);

    setStatusCheck(status);
    setCustomQuestions(questions ? questions.questions.slice(0, 5) : null);
    setCustomQuestionSelectionMode(questions?.selection_mode ?? null);
    setCustomQuestionsLoading(false);
  }

  async function refreshQuestionsForAnswers(answers: AdaptiveAnswerPayload[]) {
    const payload = mydata ?? buildMyDataFromForm(input, { customer_id: "FIGMA-MAKE-MVP", age: 55, retire_age: retireAge });
    setMydata(payload);
    setCustomQuestionsLoading(true);
    setCustomQuestions(null);
    setCustomQuestionSelectionMode(null);

    try {
      const questions = await fetchCustomQuestions({
        customer_id: "FIGMA-MAKE-MVP",
        mydata_raw: payload,
        retirement_age: retireAge,
        target_monthly_expense: input.targetMonthlyCost,
        answer_history: answers,
      });

      setCustomQuestions(questions.questions.slice(0, 5));
      setCustomQuestionSelectionMode(questions.selection_mode);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "다음 맞춤 질문 생성에 실패했습니다.");
      setCustomQuestions(null);
    } finally {
      setCustomQuestionsLoading(false);
    }
  }

  async function handleSnapshotNext(values: { livingCostManwon: number; retireAge: number }) {
    const targetMonthlyCost = values.livingCostManwon * 10_000;
    const nextInput = {
      ...input,
      targetMonthlyCost,
      currentMonthlyLivingCost: targetMonthlyCost,
    };

    setInput(nextInput);
    setRetireAge(values.retireAge);
    setScreen("questions");
    const payload = mydata ?? buildMyDataFromForm(nextInput, { customer_id: "FIGMA-MAKE-MVP", age: 55, retire_age: values.retireAge });
    setMydata(payload);
    void loadBackendViewData(payload, {
      retirementAge: values.retireAge,
      targetMonthlyExpense: targetMonthlyCost,
    });
  }

  async function completeConsent() {
    try {
      const payload = await fetchPersona("PA-0001");
      const nextInput = pensionInputFromMyData(payload);
      const nextRetireAge = 60;
      setMydata(payload);
      setInput(nextInput);
      setRetireAge(nextRetireAge);
      setApiError(null);
      setScreen("snapshot");
      void loadBackendViewData(payload, {
        retirementAge: nextRetireAge,
        targetMonthlyExpense: nextInput.targetMonthlyCost,
      });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "데이터 연동에 실패했습니다.");
      const fallbackPayload = buildMyDataFromForm(input, { customer_id: "FIGMA-MAKE-MVP", age: 55, retire_age: retireAge });
      setMydata(fallbackPayload);
      setCustomQuestions(null);
      setCustomQuestionsLoading(false);
      setCustomQuestionSelectionMode(null);
      setScreen("snapshot");
    }
  }

  async function analyzePension(answers: AdaptiveAnswerPayload[]) {
    setScreen("analyzing");
    setIsAnalyzing(true);
    setAnalysisProgress(5);
    setAnalysisStage("답변 기반 맞춤 질문을 LLM으로 다시 고르는 중");
    setApiError(null);

    const payload = mydata ?? buildMyDataFromForm(input, { customer_id: "FIGMA-MAKE-MVP", age: 55, retire_age: retireAge });
    setMydata(payload);

    const request = {
      customer_id: "FIGMA-MAKE-MVP",
      mydata_raw: payload,
      retirement_age: retireAge,
      target_monthly_expense: input.targetMonthlyCost,
    };

    try {
      const rerankedQuestions = await fetchCustomQuestions({
        ...request,
        answer_history: answers,
      });
      setCustomQuestions(rerankedQuestions.questions.slice(0, 5));
      setCustomQuestionSelectionMode(rerankedQuestions.selection_mode);
      setAnalysisProgress(rerankedQuestions.llm_used ? 35 : 28);
      setAnalysisStage(
        rerankedQuestions.llm_used
          ? "LLM이 답변을 반영한 질문 우선순위를 확정했어요."
          : "질문 우선순위 계산을 마치고 최종 분석으로 넘어가요.",
      );
    } catch (error) {
      setAnalysisProgress(25);
      setAnalysisStage("질문 재선택을 건너뛰고 최종 분석을 진행해요.");
      setApiError(error instanceof Error ? error.message : "답변 기반 질문 재선택에 실패했습니다.");
    }

    setAnalysisProgress(45);
    setAnalysisStage("최종 AI 분석과 자산 예측을 계산하는 중");

    const [analysis, dashboard] = await Promise.allSettled([
      fetchAiDiagnosis(
        input,
        { customer_id: "FIGMA-MAKE-MVP", age: 55, retire_age: retireAge },
        payload,
        undefined,
        answers,
      ),
      fetchResultDashboard(request),
    ]);

    if (analysis.status === "fulfilled") {
      setAnalysisResult(analysis.value);
    } else {
      setAnalysisResult(null);
      setApiError(analysis.reason instanceof Error ? analysis.reason.message : "AI 분석에 실패했습니다.");
    }

    if (dashboard.status === "fulfilled") {
      setResultDashboard(dashboard.value);
    } else {
      setResultDashboard(null);
      setApiError(dashboard.reason instanceof Error ? dashboard.reason.message : "결과 대시보드 계산에 실패했습니다.");
    }

    setAnalysisProgress(100);
    setAnalysisStage("분석 결과를 정리했어요.");
    setIsAnalyzing(false);
  }

  function handleAnalyzingNext() {
    setScreen("report");
  }

  async function refreshDashboard() {
    if (!mydata) return;
    const dashboard = await fetchResultDashboard({
      customer_id: "FIGMA-MAKE-MVP",
      mydata_raw: mydata,
      retirement_age: retireAge,
      target_monthly_expense: input.targetMonthlyCost,
    }).catch(() => null);
    if (dashboard) {
      setResultDashboard(dashboard);
    }
  }

  function navigateResult(to: Screen) {
    if (to === "dashboard" && !resultDashboard) {
      void refreshDashboard();
    }
    navigate(to);
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: '#E8EEF7' }}
    >
      <DemoIntro phase={introPhase} onStart={startDemoIntro} />
      <div className="demo-stage">
      <div
        className="relative flex flex-col"
        style={{
          width: '100%',
          maxWidth: '390px',
          height: '100vh',
          maxHeight: '844px',
          background: 'white',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(13,43,107,0.25)',
          borderRadius: '40px',
          marginBottom: '88px',
        }}
      >
        {/* Status bar simulation */}
        <div
          className="flex-none flex items-center justify-between px-6"
          style={{ height: '44px', background: 'white', zIndex: 10 }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1F2937' }}>9:41</span>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect x="0" y="4" width="3" height="8" rx="0.5" fill="#1F2937"/>
              <rect x="4.5" y="2.5" width="3" height="9.5" rx="0.5" fill="#1F2937"/>
              <rect x="9" y="0.5" width="3" height="11.5" rx="0.5" fill="#1F2937"/>
              <rect x="13.5" y="0" width="2.5" height="12" rx="0.5" fill="#1F2937" opacity="0.3"/>
            </svg>
            <svg width="15" height="12" viewBox="0 0 15 12" fill="none">
              <path d="M7.5 2 C4.5 2 2 4.5 0.5 7 L2.5 9 C3.5 7.5 5.5 6 7.5 6 C9.5 6 11.5 7.5 12.5 9 L14.5 7 C13 4.5 10.5 2 7.5 2 Z" fill="#1F2937"/>
              <path d="M7.5 6 C5.5 6 4 7.5 3 9 L5 11 C5.8 10 6.6 9 7.5 9 C8.4 9 9.2 10 10 11 L12 9 C11 7.5 9.5 6 7.5 6 Z" fill="#1F2937"/>
              <circle cx="7.5" cy="11" r="1" fill="#1F2937"/>
            </svg>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <div style={{ width: '22px', height: '12px', borderRadius: '3px', border: '1.5px solid #1F2937', display: 'flex', alignItems: 'center', padding: '1.5px', gap: '1px' }}>
                <div style={{ flex: 1, background: '#1F2937', borderRadius: '1px', height: '100%' }}/>
                <div style={{ flex: 1, background: '#1F2937', borderRadius: '1px', height: '100%' }}/>
                <div style={{ flex: 1, background: '#1F2937', borderRadius: '1px', height: '100%', opacity: 0.4 }}/>
              </div>
            </div>
          </div>
        </div>

        {/* Screen content */}
        <div className="flex-1 overflow-hidden relative">
          {screen === 'onboarding' && (
            <Onboarding onNext={() => navigate('consent')} />
          )}
          {screen === 'consent' && (
            <DataConsent onNext={completeConsent} />
          )}
          {screen === 'snapshot' && (
            <Snapshot status={statusCheck} initialLivingCost={input.targetMonthlyCost} initialRetireAge={retireAge} error={apiError} onNext={handleSnapshotNext} />
          )}
          {screen === 'questions' && (
            <Questions
              questions={customQuestions}
              isLoading={customQuestionsLoading}
              selectionMode={customQuestionSelectionMode}
              onAnswerChange={refreshQuestionsForAnswers}
              onNext={analyzePension}
            />
          )}
          {screen === 'analyzing' && (
            <Analyzing progress={analysisProgress} stageLabel={analysisStage} isComplete={!isAnalyzing} error={apiError} onNext={handleAnalyzingNext} />
          )}
          {screen === 'report' && (
            <Report analysis={analysisResult} dashboard={resultDashboard} error={apiError} onNext={() => navigateResult('dashboard')} />
          )}
          {screen === 'dashboard' && (
            <Dashboard dashboard={resultDashboard} analysis={analysisResult} onNext={() => navigate('actions')} />
          )}
          {screen === 'actions' && (
            <Actions analysis={analysisResult} onBack={() => navigate('dashboard')} />
          )}
        </div>

        {/* Bottom nav (shown from dashboard onwards) */}
        {['dashboard', 'report', 'actions'].includes(screen) && (
          <div
            className="flex-none flex items-center border-t"
            style={{ borderColor: '#E5E7EB', height: '56px', background: 'white' }}
          >
            {[
              { id: 'report' as Screen, label: '분석 결과', icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M6 7 L14 7 M6 10 L14 10 M6 13 L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )},
              { id: 'dashboard' as Screen, label: '수령 시뮬레이션', icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              )},
              { id: 'actions' as Screen, label: '추천 행동', icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2 L12.5 7.5 L18 8.5 L14 12.5 L15 18 L10 15 L5 18 L6 12.5 L2 8.5 L7.5 7.5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              )},
            ].map((tab) => {
              const active = screen === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.id)}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full"
                  style={{ color: active ? '#2A7BD6' : '#9CA3AF' }}
                >
                  {tab.icon}
                  <span style={{ fontSize: '10px', fontWeight: active ? 700 : 400 }}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Home indicator */}
        <div className="flex-none flex items-center justify-center" style={{ height: '20px', background: 'white' }}>
          <div className="w-28 h-1 rounded-full" style={{ background: '#E5E7EB' }}/>
        </div>
      </div>
      <DemoNarration screen={screen} />
      </div>

      {/* Screen selector pills (for prototype navigation) */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-2 rounded-full flex-wrap"
        style={{ background: 'rgba(13,43,107,0.85)', backdropFilter: 'blur(8px)', zIndex: 100, maxWidth: '95vw', justifyContent: 'center' }}
      >
        {(Object.keys(screenLabels) as Screen[]).map((s) => (
          <button
            key={s}
            onClick={() => navigate(s)}
            className="rounded-full px-2.5 py-1 transition-all"
            style={{
              background: screen === s ? 'white' : 'transparent',
              color: screen === s ? '#0D2B6B' : 'rgba(255,255,255,0.7)',
              fontSize: '10px',
              fontWeight: screen === s ? 700 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {screenLabels[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;

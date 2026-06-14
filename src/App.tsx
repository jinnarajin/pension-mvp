import { useCallback, useState } from "react";
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
  fetchCustomQuestions,
  fetchAiDiagnosis,
  fetchPersona,
  fetchResultDashboard,
  pensionInputFromMyData,
  type AnalyzeResponse,
  type CustomQuestion,
  type ResultDashboardResponse,
  type MyDataPayload,
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

function App() {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [input, setInput] = useState<PensionInput>(DEFAULT_INPUT);
  const [mydata, setMydata] = useState<MyDataPayload | undefined>();
  const [aiResult, setAiResult] = useState<AnalyzeResponse | null>(null);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[] | null>(null);
  const [resultDashboard, setResultDashboard] = useState<ResultDashboardResponse | null>(null);
  const [retireAge, setRetireAge] = useState(60);

  const navigate = useCallback((to: Screen) => {
    setScreen(to);
  }, []);

  async function loadBackendViewData(payload: MyDataPayload, nextInput: PensionInput, nextRetireAge = retireAge) {
    const request = {
      customer_id: "FIGMA-MAKE-MVP",
      mydata_raw: payload,
    };

    const [questions, dashboard] = await Promise.allSettled([
      fetchCustomQuestions(request),
      fetchResultDashboard({
        ...request,
        retirement_age: nextRetireAge,
        target_monthly_expense: nextInput.targetMonthlyCost,
      }),
    ]);

    setCustomQuestions(
      questions.status === "fulfilled"
        ? questions.value.questions.slice(0, 3)
        : null,
    );
    setResultDashboard(dashboard.status === "fulfilled" ? dashboard.value : null);
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

    if (mydata) {
      try {
        const dashboard = await fetchResultDashboard({
          customer_id: "FIGMA-MAKE-MVP",
          mydata_raw: mydata,
          retirement_age: values.retireAge,
          target_monthly_expense: targetMonthlyCost,
        });
        setResultDashboard(dashboard);
      } catch {
        setResultDashboard(null);
      }
    }
  }

  async function completeConsent() {
    try {
      const payload = await fetchPersona("PA-0001");
      const nextInput = pensionInputFromMyData(payload);
      const nextRetireAge = 60;
      setMydata(payload);
      setInput(nextInput);
      setRetireAge(nextRetireAge);
      setScreen("snapshot");
      void loadBackendViewData(payload, nextInput, nextRetireAge);
    } catch {
      setMydata(undefined);
      setCustomQuestions(null);
      setResultDashboard(null);
      setScreen("snapshot");
    }
  }

  async function analyzePension() {
    setScreen("analyzing");
    try {
      const data = await fetchAiDiagnosis(
        input,
        { customer_id: "FIGMA-MAKE-MVP", age: 55, retire_age: retireAge },
        mydata,
      );
      setAiResult(data);
    } catch {
      setAiResult(null);
    }
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: '#E8EEF7' }}
    >
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
            <Snapshot onNext={handleSnapshotNext} />
          )}
          {screen === 'questions' && (
            <Questions questions={customQuestions} onNext={analyzePension} />
          )}
          {screen === 'analyzing' && (
            <Analyzing onNext={() => navigate('report')} />
          )}
          {screen === 'report' && (
            <Report onNext={() => navigate('dashboard')} onBack={() => navigate('analyzing')} />
          )}
          {screen === 'dashboard' && (
            <Dashboard
              dashboard={resultDashboard}
              actions={aiResult?.action_items}
              onNext={() => navigate('actions')}
            />
          )}
          {screen === 'actions' && (
            <Actions onBack={() => navigate('dashboard')} />
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

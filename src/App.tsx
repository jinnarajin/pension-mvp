import { useMemo, useState } from "react";
import "./App.css";
import { Analyzing } from "./components/Analyzing";
import { DataConsent } from "./components/DataConsent";
import { Dashboard } from "./components/Dashboard";
import { Onboarding } from "./components/Onboarding";
import { Questions } from "./components/Questions";
import { Snapshot } from "./components/Snapshot";
import type { PensionInput } from "./models/pension";
import { diagnose, formatKRW, formatPercent } from "./services/pensionCalculator";
import {
  fetchAiDiagnosis,
  fetchPersona,
  pensionInputFromMyData,
  type AnalyzeResponse,
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

const SCREEN_LABELS: Partial<Record<Screen, string>> = {
  consent: "정보 연결",
  snapshot: "데이터 확인",
  questions: "간단 질문",
  analyzing: "AI 분석",
  dashboard: "진단 결과",
  report: "상세 리포트",
  actions: "실행 계획",
};

function App() {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [input, setInput] = useState<PensionInput>(DEFAULT_INPUT);
  const [mydata, setMydata] = useState<MyDataPayload | undefined>();
  const [aiResult, setAiResult] = useState<AnalyzeResponse | null>(null);
  const result = useMemo(() => diagnose(input), [input]);

  const progress = useMemo(() => {
    const order: Screen[] = ["consent", "snapshot", "questions", "analyzing", "dashboard", "report", "actions"];
    return Math.max(0, order.indexOf(screen) + 1);
  }, [screen]);

  async function connectDemoData() {
    try {
      const payload = await fetchPersona("PA-0001");
      setMydata(payload);
      setInput(pensionInputFromMyData(payload));
    } catch {
      setMydata(undefined);
    }
  }

  async function completeConsent() {
    await connectDemoData();
    setScreen("snapshot");
  }

  async function analyzePension() {
    setScreen("analyzing");
    try {
      const data = await fetchAiDiagnosis(
        input,
        { customer_id: "FIGMA-MAKE-MVP", age: 55, retire_age: 65 },
        mydata,
      );
      setAiResult(data);
    } catch {
      setAiResult(null);
    }
  }

  if (screen === "onboarding") {
    return <Onboarding onNext={() => setScreen("consent")} />;
  }

  if (screen === "consent") {
    return <DataConsent onNext={completeConsent} />;
  }

  if (screen === "snapshot") {
    return <Snapshot onNext={() => setScreen("questions")} />;
  }

  if (screen === "questions") {
    return <Questions onNext={analyzePension} />;
  }

  if (screen === "dashboard") {
    return <Dashboard onNext={() => setScreen("report")} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setScreen("onboarding")}
          aria-label="처음으로"
        >
          <span className="brand-mark">든</span>
          <span>든든내일</span>
        </button>
        <div className="topbar-label">{SCREEN_LABELS[screen]}</div>
        <button className="icon-button" aria-label="도움말">?</button>
      </header>

      <div className="progress-track" aria-label="진행률">
        <div className="progress-value" style={{ width: `${(progress / 7) * 100}%` }} />
      </div>

      {screen === "analyzing" && <Analyzing onNext={() => setScreen("dashboard")} />}
      {screen === "report" && (
        <ReportScreen
          input={input}
          result={result}
          aiResult={aiResult}
          onBack={() => setScreen("dashboard")}
          onNext={() => setScreen("actions")}
        />
      )}
      {screen === "actions" && (
        <ActionsScreen
          aiResult={aiResult}
          shortage={result.shortageAmount}
          onBack={() => setScreen("report")}
          onRestart={() => setScreen("onboarding")}
        />
      )}
    </div>
  );
}

function ReportScreen({
  input,
  result,
  aiResult,
  onBack,
  onNext,
}: {
  input: PensionInput;
  result: ReturnType<typeof diagnose>;
  aiResult: AnalyzeResponse | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const pensionItems = [
    ["국민연금", input.nationalPension, "var(--green)"],
    ["퇴직연금", input.retirementPension, "#64b28d"],
    ["개인연금", input.privatePension, "#b8d8c8"],
  ] as const;
  return (
    <main className="page report-page">
      <span className="eyebrow">DETAILED REPORT</span>
      <h1>내 연금의 빈틈을<br />차근차근 살펴봤어요</h1>
      <section className="report-section">
        <div className="section-title"><span>01</span><div><h2>예상 연금 구성</h2><p>매월 들어오는 연금의 구성입니다.</p></div></div>
        <div className="stacked-bar">
          {pensionItems.map(([name, value, color]) => (
            <i key={name} style={{ width: `${(value / result.totalMonthlyPension) * 100}%`, background: color }} />
          ))}
        </div>
        <div className="legend">
          {pensionItems.map(([name, value, color]) => (
            <div key={name}><span style={{ background: color }} /><p>{name}<b>{formatKRW(value)}</b></p></div>
          ))}
        </div>
      </section>
      <section className="report-section">
        <div className="section-title"><span>02</span><div><h2>목표 대비 부족률</h2><p>목표 생활비와 예상 연금을 비교했어요.</p></div></div>
        <div className="gap-visual">
          <div><span>목표 생활비</span><b>{formatKRW(result.targetMonthlyCost)}</b></div>
          <div><span>예상 연금</span><b>{formatKRW(result.totalMonthlyPension)}</b></div>
          <div className="gap-result"><span>부족률</span><strong>{formatPercent(result.shortageRate)}</strong></div>
        </div>
      </section>
      {aiResult?.rationale && <section className="ai-rationale"><span>AI 분석 근거</span><p>{aiResult.rationale}</p></section>}
      <div className="button-row">
        <button className="secondary-button" onClick={onBack}>이전</button>
        <button className="primary-button" onClick={onNext}>실행 계획 확인 →</button>
      </div>
    </main>
  );
}

function ActionsScreen({
  aiResult,
  shortage,
  onBack,
  onRestart,
}: {
  aiResult: AnalyzeResponse | null;
  shortage: number;
  onBack: () => void;
  onRestart: () => void;
}) {
  const actions = aiResult?.action_items?.length
    ? aiResult.action_items
    : [
        `매월 ${formatKRW(Math.max(100000, Math.round(shortage * 0.3)))} 추가 저축 가능 여부 확인하기`,
        "퇴직연금 수익률과 수수료를 한 번 비교해 보기",
        "국민연금 예상 수령액과 수령 시기 다시 확인하기",
      ];
  return (
    <main className="page action-page">
      <span className="eyebrow">YOUR ACTION PLAN</span>
      <h1>오늘 할 수 있는 것부터<br />하나씩 시작해요</h1>
      <p className="lead">무리하지 않아도 괜찮아요. 가장 쉬운 행동 하나가 든든한 내일을 만듭니다.</p>
      <div className="action-list">
        {actions.slice(0, 3).map((action, index) => (
          <article key={action}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><small>{index === 0 ? "이번 주" : index === 1 ? "이번 달" : "3개월 안에"}</small><h2>{action}</h2></div>
            <button aria-label="완료 표시">✓</button>
          </article>
        ))}
      </div>
      <section className="finish-card"><span>든든내일</span><h2>연금 진단을 완료했어요</h2><p>정보가 바뀌면 언제든 다시 확인해 보세요.</p></section>
      <div className="button-row">
        <button className="secondary-button" onClick={onBack}>리포트 다시 보기</button>
        <button className="primary-button" onClick={onRestart}>처음으로</button>
      </div>
    </main>
  );
}

export default App;

import { useEffect, useMemo, useState } from "react";
import "./App.css";
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
  | "questions"
  | "analyzing"
  | "dashboard"
  | "report"
  | "actions";

const ANALYSIS_MESSAGES = [
  "연금 정보를 모으고 있어요",
  "노후 현금흐름을 계산하고 있어요",
  "맞춤 실행 계획을 만들고 있어요",
];

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
  questions: "간단 질문",
  analyzing: "AI 분석",
  dashboard: "진단 결과",
  report: "상세 리포트",
  actions: "실행 계획",
};

const moneyFields: Array<{
  key: keyof PensionInput;
  label: string;
  help: string;
}> = [
  { key: "nationalPension", label: "국민연금 예상액", help: "매월 받을 예상 금액" },
  { key: "retirementPension", label: "퇴직연금 예상액", help: "IRP 포함, 매월 예상 금액" },
  { key: "privatePension", label: "개인연금 예상액", help: "연금저축 등 매월 예상 금액" },
  { key: "targetMonthlyCost", label: "희망 노후 생활비", help: "노후에 매월 필요한 목표 금액" },
];

function App() {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const [input, setInput] = useState<PensionInput>(DEFAULT_INPUT);
  const [mydata, setMydata] = useState<MyDataPayload | undefined>();
  const [aiResult, setAiResult] = useState<AnalyzeResponse | null>(null);
  const [connectionState, setConnectionState] = useState<"idle" | "loading" | "connected">("idle");
  const [analysisNote, setAnalysisNote] = useState("");
  const result = useMemo(() => diagnose(input), [input]);

  const progress = useMemo(() => {
    const order: Screen[] = ["consent", "questions", "analyzing", "dashboard", "report", "actions"];
    return Math.max(0, order.indexOf(screen) + 1);
  }, [screen]);

  async function connectDemoData() {
    setConnectionState("loading");
    try {
      const payload = await fetchPersona("PA-0001");
      setMydata(payload);
      setInput(pensionInputFromMyData(payload));
    } catch {
      setMydata(undefined);
    } finally {
      setConnectionState("connected");
    }
  }

  async function analyzePension() {
    setScreen("analyzing");
    setAnalysisNote("");
    try {
      const data = await fetchAiDiagnosis(
        input,
        { customer_id: "FIGMA-MAKE-MVP", age: 55, retire_age: 65 },
        mydata,
      );
      setAiResult(data);
    } catch {
      setAnalysisNote("백엔드 연결 전이라 로컬 계산 결과로 먼저 보여드려요.");
    }
  }

  useEffect(() => {
    if (screen !== "analyzing") return;
    const timer = window.setTimeout(() => setScreen("dashboard"), 2600);
    return () => window.clearTimeout(timer);
  }, [screen]);

  if (screen === "onboarding") {
    return <Onboarding onStart={() => setScreen("consent")} />;
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
        <div className="progress-value" style={{ width: `${(progress / 6) * 100}%` }} />
      </div>

      {screen === "consent" && (
        <ConsentScreen
          state={connectionState}
          onConnect={connectDemoData}
          onNext={() => setScreen("questions")}
        />
      )}
      {screen === "questions" && (
        <QuestionsScreen
          input={input}
          onChange={setInput}
          onBack={() => setScreen("consent")}
          onAnalyze={analyzePension}
        />
      )}
      {screen === "analyzing" && <AnalyzingScreen />}
      {screen === "dashboard" && (
        <DashboardScreen
          input={input}
          result={result}
          aiResult={aiResult}
          note={analysisNote}
          onReport={() => setScreen("report")}
          onRestart={() => setScreen("questions")}
        />
      )}
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

function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <main className="onboarding">
      <div className="onboarding-glow glow-one" />
      <div className="onboarding-glow glow-two" />
      <nav className="landing-nav">
        <div className="brand light"><span className="brand-mark">든</span><span>든든내일</span></div>
        <span className="secure-label">안전한 연금 진단</span>
      </nav>
      <section className="hero">
        <span className="eyebrow light-eyebrow">AI 연금 건강검진</span>
        <h1>내 연금,<br /><strong>내일까지 든든하게.</strong></h1>
        <p>
          흩어진 연금 정보를 한눈에 모으고,<br />
          나에게 필요한 다음 행동을 쉽게 알려드려요.
        </p>
        <button className="primary-button hero-button" onClick={onStart}>
          무료로 진단 시작하기 <span>→</span>
        </button>
        <small>회원가입 없이 약 3분이면 충분해요</small>
      </section>
      <section className="trust-row">
        <div><b>1분</b><span>정보 연결</span></div>
        <div><b>맞춤형</b><span>AI 분석</span></div>
        <div><b>무료</b><span>실행 계획</span></div>
      </section>
    </main>
  );
}

function ConsentScreen({
  state,
  onConnect,
  onNext,
}: {
  state: "idle" | "loading" | "connected";
  onConnect: () => void;
  onNext: () => void;
}) {
  const connected = state === "connected";
  return (
    <main className="page narrow">
      <span className="eyebrow">STEP 1</span>
      <h1>흩어진 연금 정보를<br />한 번에 불러올게요</h1>
      <p className="lead">정확한 진단을 위해 마이데이터를 연결해 주세요. 데모에서는 준비된 샘플 데이터를 사용합니다.</p>

      <div className={`connection-card ${connected ? "connected" : ""}`}>
        <div className="connection-icon">{connected ? "✓" : "···"}</div>
        <div>
          <strong>{connected ? "연금 정보 연결 완료" : "마이데이터 연금 정보"}</strong>
          <p>{connected ? "국민연금, 퇴직연금, 개인연금을 불러왔어요." : "연금과 자산 정보를 안전하게 확인합니다."}</p>
        </div>
      </div>

      <div className="info-list">
        <div><span>✓</span><p><strong>조회만 진행해요</strong><small>어떤 상품도 임의로 변경하지 않아요.</small></p></div>
        <div><span>✓</span><p><strong>분석 후 바로 삭제 가능</strong><small>동의한 정보만 진단에 사용해요.</small></p></div>
        <div><span>✓</span><p><strong>암호화된 안전한 연결</strong><small>민감한 원본 정보는 화면에 노출하지 않아요.</small></p></div>
      </div>

      {!connected ? (
        <button className="primary-button full" onClick={onConnect} disabled={state === "loading"}>
          {state === "loading" ? "연결하고 있어요..." : "동의하고 정보 연결하기"}
        </button>
      ) : (
        <button className="primary-button full" onClick={onNext}>간단 질문으로 계속하기 →</button>
      )}
    </main>
  );
}

function QuestionsScreen({
  input,
  onChange,
  onBack,
  onAnalyze,
}: {
  input: PensionInput;
  onChange: (input: PensionInput) => void;
  onBack: () => void;
  onAnalyze: () => void;
}) {
  return (
    <main className="page narrow">
      <span className="eyebrow">STEP 2</span>
      <h1>원하는 노후 모습을<br />조금만 알려주세요</h1>
      <p className="lead">입력한 금액은 언제든 다시 바꿀 수 있어요.</p>
      <div className="question-list">
        {moneyFields.map((field) => (
          <label className="money-field" key={field.key}>
            <span><strong>{field.label}</strong><small>{field.help}</small></span>
            <span className="money-input">
              <input
                type="number"
                min="0"
                step="100000"
                value={input[field.key]}
                onChange={(event) =>
                  onChange({ ...input, [field.key]: Math.max(0, Number(event.target.value)) })
                }
              />
              <b>원</b>
            </span>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className="secondary-button" onClick={onBack}>이전</button>
        <button className="primary-button" onClick={onAnalyze}>AI 진단 받기 →</button>
      </div>
    </main>
  );
}

function AnalyzingScreen() {
  const [message, setMessage] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setMessage((value) => (value + 1) % ANALYSIS_MESSAGES.length), 800);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <main className="analysis-page">
      <div className="analysis-orbit"><span /><span /><span /><b>AI</b></div>
      <span className="eyebrow">STEP 3</span>
      <h1>든든한 내일을<br />분석하고 있어요</h1>
      <p>{ANALYSIS_MESSAGES[message]}</p>
      <div className="analysis-lines"><i /><i /><i /></div>
    </main>
  );
}

function DashboardScreen({
  input,
  result,
  aiResult,
  note,
  onReport,
  onRestart,
}: {
  input: PensionInput;
  result: ReturnType<typeof diagnose>;
  aiResult: AnalyzeResponse | null;
  note: string;
  onReport: () => void;
  onRestart: () => void;
}) {
  const achievement = Math.min(100, Math.round((result.totalMonthlyPension / input.targetMonthlyCost) * 100));
  const score = aiResult ? Math.max(20, 100 - aiResult.uvs) : Math.max(20, achievement);
  return (
    <main className="page dashboard-page">
      <div className="dashboard-heading">
        <div><span className="eyebrow">MY PENSION REPORT</span><h1>지금 연금 상태는<br /><strong>{result.statusLabel}</strong></h1></div>
        <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
          <div><b>{score}</b><span>든든 점수</span></div>
        </div>
      </div>
      {note && <div className="notice">{note}</div>}
      <section className="summary-grid">
        <article className="summary-card dark-card">
          <span>매월 예상 연금</span>
          <b>{formatKRW(result.totalMonthlyPension)}</b>
          <small>목표의 {achievement}%를 준비했어요</small>
          <div className="bar"><i style={{ width: `${achievement}%` }} /></div>
        </article>
        <article className="summary-card">
          <span>매월 부족 예상액</span>
          <b className="negative">{formatKRW(result.shortageAmount)}</b>
          <small>지금부터 준비하면 충분히 줄일 수 있어요</small>
        </article>
        <article className="summary-card">
          <span>순금융자산</span>
          <b>{formatKRW(result.netFinancialAssets)}</b>
          <small>예금에서 대출 잔액을 제외했어요</small>
        </article>
      </section>
      <section className="insight-card">
        <div className="insight-number">01</div>
        <div><span>AI 핵심 진단</span><h2>{aiResult?.final_response || result.statusMessage}</h2></div>
      </section>
      <div className="button-row dashboard-actions">
        <button className="secondary-button" onClick={onRestart}>금액 수정</button>
        <button className="primary-button" onClick={onReport}>상세 리포트 보기 →</button>
      </div>
    </main>
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

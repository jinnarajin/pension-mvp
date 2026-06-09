import { runPensionDashboardAgent } from "../agents/pensionDashboardAgent";
import type { DashboardCard, UserPensionInput } from "../types/pension";

const sampleUser: UserPensionInput = {
  age: 45,
  retirementAge: 60,
  targetMonthlyLivingCost: 2000000,

  pensionType: "연금저축보험",
  productType: "보험형",

  currentBalance: 12000000,
  monthlyPayment: 200000,
  joinedYears: 3,

  annualReturnRate: 1.8,
  marketAverageReturnRate: 3.2,

  feeRate: 1.2,
  marketAverageFeeRate: 0.6,

  hasTaxBenefit: true,
  hasIRP: false,
  hasSurrenderValueLossRisk: true,
};

function getSeverityLabel(severity: DashboardCard["severity"]) {
  if (severity === "high") return "중요";
  if (severity === "medium") return "확인 필요";

  return "참고";
}

function getSeverityColor(severity: DashboardCard["severity"]) {
  if (severity === "high") return "#DC2626";
  if (severity === "medium") return "#D97706";

  return "#2563EB";
}

function Card({ card }: { card: DashboardCard }) {
  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: "8px",
        padding: "18px",
        marginBottom: "14px",
        backgroundColor: "#FFFFFF",
        boxShadow: "0 8px 20px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 700,
          marginBottom: "8px",
          color: getSeverityColor(card.severity),
        }}
      >
        {getSeverityLabel(card.severity)}
      </div>

      <h3
        style={{
          fontSize: "18px",
          lineHeight: "1.35",
          margin: "0 0 8px 0",
          letterSpacing: 0,
        }}
      >
        {card.title}
      </h3>

      <p
        style={{
          fontSize: "14px",
          lineHeight: "1.6",
          color: "#4B5563",
          whiteSpace: "pre-line",
          margin: "0 0 14px 0",
        }}
      >
        {card.description}
      </p>

      {card.actionText && (
        <button
          type="button"
          style={{
            border: "none",
            borderRadius: "8px",
            padding: "10px 14px",
            fontSize: "14px",
            fontWeight: 700,
            backgroundColor: "#111827",
            color: "#FFFFFF",
            cursor: "pointer",
          }}
        >
          {card.actionText}
        </button>
      )}
    </div>
  );
}

export default function PensionDashboard() {
  const result = runPensionDashboardAgent(sampleUser);

  return (
    <main
      style={{
        maxWidth: "430px",
        margin: "0 auto",
        minHeight: "100vh",
        backgroundColor: "#F9FAFB",
        padding: "24px 18px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <section style={{ marginBottom: "24px" }}>
        <p
          style={{
            fontSize: "14px",
            color: "#6B7280",
            margin: "0 0 6px 0",
          }}
        >
          연금 인사이트 대시보드
        </p>

        <h1
          style={{
            fontSize: "28px",
            lineHeight: "1.25",
            margin: 0,
            letterSpacing: 0,
          }}
        >
          지금 확인해야 할 연금 이슈
        </h1>
      </section>

      <section
        style={{
          backgroundColor: "#111827",
          color: "#FFFFFF",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
        }}
      >
        <p
          style={{
            fontSize: "13px",
            color: "#D1D5DB",
            margin: "0 0 8px 0",
          }}
        >
          AI Agent 요약
        </p>

        <p
          style={{
            fontSize: "16px",
            lineHeight: "1.6",
            margin: 0,
          }}
        >
          {result.summary}
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "8px",
            padding: "16px",
            border: "1px solid #E5E7EB",
          }}
        >
          <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
            예상 월 연금
          </p>
          <strong style={{ fontSize: "20px" }}>
            {Math.round(result.expectedMonthlyPension).toLocaleString("ko-KR")}원
          </strong>
        </div>

        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: "8px",
            padding: "16px",
            border: "1px solid #E5E7EB",
          }}
        >
          <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
            갈아타기 점수
          </p>
          <strong style={{ fontSize: "20px" }}>
            {result.transferScore}점
          </strong>
        </div>
      </section>

      <section>
        {result.cards.map((card, index) => (
          <Card key={`${card.type}-${index}`} card={card} />
        ))}
      </section>
    </main>
  );
}

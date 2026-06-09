import type {
  DashboardCard,
  PensionAgentResult,
  UserPensionInput,
} from "../types/pension";

function formatKRW(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function calculateExpectedMonthlyPension(user: UserPensionInput): number {
  const yearsToRetirement = Math.max(user.retirementAge - user.age, 0);
  const futureContribution = user.monthlyPayment * 12 * yearsToRetirement;
  const expectedBalance = user.currentBalance + futureContribution;

  // MVP 기준: 은퇴 후 20년 수령 가정
  const receivingMonths = 20 * 12;

  return expectedBalance / receivingMonths;
}

function calculatePensionGap(user: UserPensionInput): number {
  const expectedMonthlyPension = calculateExpectedMonthlyPension(user);

  return user.targetMonthlyLivingCost - expectedMonthlyPension;
}

function calculateTransferScore(user: UserPensionInput): number {
  let score = 0;

  if (user.annualReturnRate < user.marketAverageReturnRate) {
    score += 25;
  }

  if (user.feeRate > user.marketAverageFeeRate) {
    score += 20;
  }

  if (user.productType === "보험형") {
    score += 10;
  }

  if (user.productType === "예금형") {
    score += 10;
  }

  if (user.hasTaxBenefit) {
    score += 10;
  }

  // 위험 조건은 점수를 낮춤
  if (user.productType === "보험형" && user.joinedYears < 5) {
    score -= 20;
  }

  if (user.hasSurrenderValueLossRisk) {
    score -= 30;
  }

  return Math.max(0, Math.min(score, 100));
}

function getTransferDecision(score: number, user: UserPensionInput): string {
  if (user.hasSurrenderValueLossRisk) {
    return "전문가 상담 필요";
  }

  if (user.productType === "보험형" && user.joinedYears < 5) {
    return "바로 이전보다 환급금 확인 우선";
  }

  if (score >= 60) {
    return "갈아타기 적극 검토";
  }

  if (score >= 30) {
    return "계좌이전 검토";
  }

  return "현재 상품 유지 권장";
}

function createRiskCards(user: UserPensionInput): DashboardCard[] {
  const cards: DashboardCard[] = [];

  if (user.hasSurrenderValueLossRisk) {
    cards.push({
      type: "RISK_WARNING",
      title: "바로 해지하면 손실 가능성이 있어요",
      description:
        "현재 상품은 해지환급금 손실 가능성이 있어요. 갈아타기 전에 해지가 아니라 계좌이전이 가능한지 먼저 확인해야 합니다.",
      priority: 100,
      severity: "high",
      actionText: "해지환급금 확인하기",
    });
  }

  if (user.productType === "보험형" && user.joinedYears < 5) {
    cards.push({
      type: "RISK_WARNING",
      title: "가입 초기 보험형 상품이에요",
      description:
        "연금저축보험은 가입 초기에 사업비 부담이나 환급금 손실이 있을 수 있어요. 무조건 갈아타기보다 손실 여부 확인이 먼저입니다.",
      priority: 95,
      severity: "high",
      actionText: "이전 전 손실 확인하기",
    });
  }

  if (user.hasTaxBenefit) {
    cards.push({
      type: "TAX_BENEFIT",
      title: "해지보다 계좌이전으로 검토하세요",
      description:
        "세액공제를 받은 연금계좌는 단순 해지 시 세금 불이익이 생길 수 있어요. 세제 혜택을 유지하려면 계좌이전 방식으로 검토하는 것이 안전합니다.",
      priority: 90,
      severity: "medium",
      actionText: "계좌이전 조건 확인",
    });
  }

  if (user.age >= 55) {
    cards.push({
      type: "RISK_WARNING",
      title: "연금 수령 조건 확인이 먼저예요",
      description:
        "연금 수령 가능 연령에 가까우므로 갈아타기보다 수령 개시 조건, 연금 수령 방식, 세금 조건을 먼저 확인해야 합니다.",
      priority: 88,
      severity: "medium",
      actionText: "수령 조건 확인하기",
    });
  }

  return cards;
}

function createInsightCards(
  user: UserPensionInput,
  expectedMonthlyPension: number,
  pensionGap: number,
  transferScore: number,
  transferDecision: string
): DashboardCard[] {
  const cards: DashboardCard[] = [];

  if (pensionGap > 0) {
    cards.push({
      type: "PENSION_GAP",
      title: "노후 월 생활비가 부족할 수 있어요",
      description: `현재 입력 기준 예상 월 연금은 약 ${formatKRW(
        expectedMonthlyPension
      )}입니다. 목표 생활비 대비 약 ${formatKRW(
        pensionGap
      )}이 부족할 수 있어요.`,
      priority: pensionGap >= 500000 ? 85 : 70,
      severity: pensionGap >= 500000 ? "high" : "medium",
      actionText: "추가 납입 시뮬레이션 보기",
    });
  } else {
    cards.push({
      type: "PENSION_GAP",
      title: "목표 생활비에 가까운 연금 수준이에요",
      description: `현재 입력 기준 예상 월 연금은 약 ${formatKRW(
        expectedMonthlyPension
      )}입니다. 목표 생활비 대비 큰 부족은 보이지 않습니다.`,
      priority: 50,
      severity: "low",
      actionText: "현재 계획 유지하기",
    });
  }

  if (user.feeRate > user.marketAverageFeeRate) {
    cards.push({
      type: "FEE_COMPARISON",
      title: "현재 상품의 수수료가 높은 편이에요",
      description: `현재 수수료율은 ${user.feeRate}%로, 비교 기준 평균 ${user.marketAverageFeeRate}%보다 높습니다. 장기 연금에서는 수수료 차이가 누적될 수 있어요.`,
      priority: 80,
      severity: "medium",
      actionText: "수수료 낮은 상품 비교",
    });
  }

  if (user.annualReturnRate < user.marketAverageReturnRate) {
    cards.push({
      type: "RETURN_COMPARISON",
      title: "최근 수익률이 평균보다 낮아요",
      description: `현재 상품의 최근 수익률은 ${user.annualReturnRate}%로, 비교 기준 평균 ${user.marketAverageReturnRate}%보다 낮습니다.`,
      priority: 78,
      severity: "medium",
      actionText: "수익률 비교 보기",
    });
  }

  cards.push({
    type: "TRANSFER_SUITABILITY",
    title: `갈아타기 판단: ${transferDecision}`,
    description: `현재 연금 상품의 갈아타기 적합도는 ${transferScore}점입니다. 단, 점수보다 해지 손실과 세제 불이익 여부를 먼저 확인해야 합니다.`,
    priority:
      transferDecision === "전문가 상담 필요"
        ? 92
        : transferScore >= 60
          ? 82
          : 60,
    severity:
      transferDecision === "전문가 상담 필요"
        ? "high"
        : transferScore >= 60
          ? "medium"
          : "low",
    actionText: "갈아타기 조건 확인",
  });

  if (!user.hasIRP) {
    cards.push({
      type: "ACTION_PLAN",
      title: "IRP 활용 가능성도 확인해보세요",
      description:
        "현재 IRP가 없다면 세액공제 한도와 중도인출 제한을 함께 고려하여 활용 가능성을 검토할 수 있습니다.",
      priority: 55,
      severity: "low",
      actionText: "IRP 알아보기",
    });
  }

  return cards;
}

function createActionPlanCards(user: UserPensionInput): DashboardCard[] {
  const actions: string[] = [];

  if (user.hasSurrenderValueLossRisk) {
    actions.push("현재 상품의 해지환급금과 손실 가능성을 확인하세요.");
  }

  if (user.hasTaxBenefit) {
    actions.push("해지가 아닌 계좌이전 방식으로 가능한지 확인하세요.");
  }

  if (user.feeRate > user.marketAverageFeeRate) {
    actions.push("동일 유형 상품의 수수료를 비교하세요.");
  }

  if (user.annualReturnRate < user.marketAverageReturnRate) {
    actions.push("최근 수익률이 낮은 원인을 확인하세요.");
  }

  if (actions.length === 0) {
    actions.push("현재 연금 계획을 유지하면서 납입 가능 금액을 점검하세요.");
  }

  return [
    {
      type: "ACTION_PLAN",
      title: "오늘 확인해야 할 연금 액션",
      description: actions.map((item, index) => `${index + 1}. ${item}`).join("\n"),
      priority: 75,
      severity: "medium",
      actionText: "체크리스트 보기",
    },
  ];
}

function prioritizeCards(cards: DashboardCard[]): DashboardCard[] {
  return cards.sort((a, b) => b.priority - a.priority);
}

function makeSummary(
  user: UserPensionInput,
  expectedMonthlyPension: number,
  pensionGap: number,
  transferDecision: string
): string {
  const gapText =
    pensionGap > 0
      ? `목표 생활비 대비 월 ${formatKRW(pensionGap)} 정도 부족할 수 있습니다.`
      : "목표 생활비 대비 큰 부족은 보이지 않습니다.";

  return `현재 사용자는 ${user.pensionType}을 보유하고 있으며, 예상 월 연금액은 약 ${formatKRW(
    expectedMonthlyPension
  )}입니다. ${gapText} 갈아타기 판단 결과는 '${transferDecision}'입니다.`;
}

export function runPensionDashboardAgent(
  user: UserPensionInput
): PensionAgentResult {
  const expectedMonthlyPension = calculateExpectedMonthlyPension(user);
  const pensionGap = calculatePensionGap(user);
  const transferScore = calculateTransferScore(user);
  const transferDecision = getTransferDecision(transferScore, user);

  const riskCards = createRiskCards(user);
  const insightCards = createInsightCards(
    user,
    expectedMonthlyPension,
    pensionGap,
    transferScore,
    transferDecision
  );
  const actionCards = createActionPlanCards(user);
  const cards = prioritizeCards([...riskCards, ...insightCards, ...actionCards]);

  return {
    summary: makeSummary(
      user,
      expectedMonthlyPension,
      pensionGap,
      transferDecision
    ),
    expectedMonthlyPension,
    pensionGap,
    transferScore,
    transferDecision,
    cards,
  };
}

interface ScenarioResult {
  scenario_id: string;
  title: string;
  receipt_method: string;
  payout_years?: number;
  gross_retirement_payout: number;
  estimated_tax_total: number;
  after_tax_retirement_payout: number;
  monthly_pension_from_retirement_money: number;
  monthly_tax_saving_vs_lump_sum: number;
  total_tax_saving_vs_lump_sum: number;
  initial_liquidity: number;
  survival_months_gap: number;
  survival_months_full: number;
  gap_period_shortfall_monthly: number;
  full_period_shortfall_monthly: number;
  tax_advisory: string[];
  risk_flags: string[];
}

interface AnalyzeLike {
  final_response: string;
  action_items: string[];
  fwb_score?: number;
  domain_gaps?: Array<{
    label?: string;
    severity?: string;
    evidence?: string[];
  }>;
  answer_insights?: Array<{
    label?: string;
    signals?: {
      gap_confirmed?: boolean;
    };
  }>;
  context_profile?: Record<string, {
    level?: string;
    source?: string;
    score?: number;
    evidence?: string[];
  }>;
  dashboard_treatment?: {
    explanation_style?: {
      difficulty?: string;
      primary_unit?: string;
      sentence_length?: string;
    };
    card_priority?: string[];
    sections?: {
      show_easy_explanation?: boolean;
      show_product_condition_cards?: boolean;
      show_decision_checklist?: boolean;
      show_family_or_advisor_summary?: boolean;
    };
    reasons?: Array<{
      axis: string;
      level: string;
      reason: string;
    }>;
  };
  priority_board?: {
    explanation_profile?: {
      difficulty?: string;
    };
  };
  dashboard: {
    pension_breakdown: Record<string, number>;
    goal_achievement_rate: number;
    timeline_data: Record<string, unknown>;
  };
  scenario_comparison?: {
    target_monthly_expense?: number;
    retirement_age?: number;
    recommended_scenario_id: string;
    recommendation_reason: string;
    scenarios: ScenarioResult[];
  };
}

interface ResultDashboardLike {
  summary_cards: {
    expected_monthly_pension: number;
    expected_monthly_pension_start_age: number;
    monthly_living_expense: number;
    stable_maintenance_years: number | null;
    stable_maintenance_from_age: number;
    stable_maintenance_to_age: number | null;
    shortage_expected_age: number | null;
    shortage_expected_month: string | null;
  };
  asset_projection: {
    start_age: number;
    retirement_age: number;
    life_expectancy_age: number;
    points: Array<{
      age: number;
      year_month: string;
      asset_balance: number;
      asset_balance_manwon: number;
      is_shortage_point: boolean;
    }>;
  };
  source_features: Record<string, unknown>;
}

export interface ReportCashFlowRow {
  label: string;
  amount: number;
  direction: "in" | "out";
  note: string;
}

export interface CustomDashboardCard {
  id: string;
  title: string;
  badge: string;
  reason: string;
  desc: string;
  checks: string[];
}

export interface ReportViewModel {
  hasProjection: boolean;
  shortageAgeLabel: string;
  stableYearsLabel: string;
  pensionStartAgeLabel: string;
  cashFlowRows: ReportCashFlowRow[];
  netCashFlow: number;
  explanation: string;
  showEasyExplanation: boolean;
  showProductConditionCards: boolean;
  showDecisionChecklist: boolean;
  showFamilyOrAdvisorSummary: boolean;
  cardPriority: string[];
  causes: Array<{ cause: string; impact: "높음" | "보통"; desc: string }>;
  customDashboardCards: CustomDashboardCard[];
}

export interface DashboardChartPoint {
  age: number;
  yearMonth: string;
  assetBalanceManwon: number;
  isShortagePoint: boolean;
}

export interface DashboardViewModel {
  totalFinancialAssetsManwon: number;
  monthlyLivingExpenseManwon: number;
  expectedMonthlyPensionManwon: number;
  shortageAge: number | null;
  stableYears: number | null;
  startAge: number;
  retirementAge: number;
  lifeExpectancyAge: number;
  chartPoints: DashboardChartPoint[];
  recommendedScenarioId: string | null;
  recommendationReason: string;
  scenarios: ScenarioResult[];
}

export interface ActionViewModel {
  id: string;
  priority: number;
  title: string;
  effect: string;
  desc: string;
  badge: string;
  badgeColor: string;
  amount: string;
}

export function toManwon(value: number | null | undefined): number {
  return Math.round((value ?? 0) / 10_000);
}

function labelAge(age: number | null | undefined): string {
  return typeof age === "number" ? `${age}세` : "계산 전";
}

function labelYears(years: number | null | undefined): string {
  return typeof years === "number" ? `${years}년` : "계산 전";
}

function buildFallbackEasyExplanation(shortageAge: number | null, netCashFlow: number): string {
  const monthlyGap = Math.max(0, -netCashFlow);
  if (!shortageAge) {
    return "쉽게 말하면, 지금 입력한 생활비와 연금 예상액을 기준으로 자산이 얼마나 오래 버티는지 계산하고 있어요.";
  }

  return `쉽게 말하면, 은퇴 후 월 현금흐름이 ${toManwon(monthlyGap).toLocaleString()}만원 정도 부족해서 그 차이를 보유 자산에서 꺼내 쓰는 구조입니다. 이 계산 기준에서는 ${shortageAge}세 전후에 자산 부족이 시작될 수 있어요.`;
}

function baseScenario(analysis: AnalyzeLike | null): ScenarioResult | undefined {
  return analysis?.scenario_comparison?.scenarios?.[0];
}

function fallbackStableYears(analysis: AnalyzeLike | null): number | null {
  const scenario = baseScenario(analysis);
  if (!scenario) {
    return null;
  }
  return Math.floor((scenario.survival_months_gap + scenario.survival_months_full) / 12);
}

function fallbackShortageAge(analysis: AnalyzeLike | null): number | null {
  const retirementAge = analysis?.scenario_comparison?.retirement_age;
  const stableYears = fallbackStableYears(analysis);
  if (typeof retirementAge !== "number" || stableYears === null) {
    return null;
  }
  return retirementAge + stableYears;
}

function buildAnalysisCauses(analysis: AnalyzeLike | null): Array<{ cause: string; impact: "높음" | "보통"; desc: string }> | null {
  const treatmentReasons = analysis?.dashboard_treatment?.reasons?.filter((reason) => reason.axis && reason.reason) ?? [];
  if (treatmentReasons.length) {
    const labels: Record<string, string> = {
      current_cashflow: "현재 현금흐름",
      retirement_readiness: "노후 준비",
      product_understanding: "금융상품 이해",
      decision_check_behavior: "의사결정·확인 행동",
      financial_confidence: "금융 자신감",
    };
    return treatmentReasons.slice(0, 3).map((reason) => ({
      cause: labels[reason.axis] ?? reason.axis,
      impact: reason.level === "low" || reason.level === "vulnerable" || reason.level === "monthly_shortfall" || reason.level === "income_gap" ? "높음" : "보통",
      desc: reason.reason,
    }));
  }

  const gaps = analysis?.domain_gaps?.filter((gap) => gap.label || gap.evidence?.length) ?? [];
  if (!gaps.length) {
    return null;
  }

  return gaps.slice(0, 3).map((gap) => ({
    cause: gap.label || "답변 기반 취약 요인",
    impact: gap.severity === "high" || gap.severity === "critical" ? "높음" : "보통",
    desc: gap.evidence?.length
      ? gap.evidence.join(" · ")
      : "맞춤 질문 답변과 마이데이터 분석에서 확인된 요인입니다.",
  }));
}

function profileReason(analysis: AnalyzeLike | null, axis: string): string {
  const treatmentReason = analysis?.dashboard_treatment?.reasons?.find((reason) => reason.axis === axis)?.reason;
  if (treatmentReason) {
    return treatmentReason;
  }

  const evidence = analysis?.context_profile?.[axis]?.evidence?.filter(Boolean) ?? [];
  if (evidence.length) {
    return evidence.join(" · ");
  }

  return "맞춤 질문 답변과 마이데이터 분석에서 확인된 항목입니다.";
}

function buildCustomDashboardCards(analysis: AnalyzeLike | null): CustomDashboardCard[] {
  const treatment = analysis?.dashboard_treatment;
  if (!treatment) {
    return [];
  }

  const cards: Record<string, CustomDashboardCard> = {};
  if (treatment.sections?.show_product_condition_cards) {
    cards.product_condition_check = {
      id: "product_condition_check",
      title: "상품 조건 이해 보완",
      badge: "조건 확인",
      reason: profileReason(analysis, "product_understanding"),
      desc: "상품 이름보다 수령 조건, 세금, 중도해지 손실을 먼저 확인해야 하는 상태입니다.",
      checks: [
        "퇴직연금/IRP: 연금 수령 기간과 세금 차이",
        "대출: 남은 원금, 금리, 상환 종료 시점",
        "보험/저축: 해지 시 손실과 유지 필요성",
      ],
    };
  }

  if (treatment.sections?.show_decision_checklist) {
    cards.decision_checklist = {
      id: "decision_checklist",
      title: "수령방식 결정 전 확인 부족",
      badge: "체크리스트",
      reason: profileReason(analysis, "decision_check_behavior"),
      desc: "일시금과 연금 수령을 고르기 전에 월 현금흐름, 초기 유동성, 세금 차이를 나눠 봐야 합니다.",
      checks: [
        "일시금: 은퇴 직후 생활비를 얼마나 버티는지",
        "연금 수령: 매월 부족액이 얼마나 줄어드는지",
        "공통: 세금 차이와 중도 변경 가능 여부",
      ],
    };
  }

  if (treatment.sections?.show_family_or_advisor_summary) {
    cards.share_summary = {
      id: "share_summary",
      title: "가족/상담사용 판단 근거",
      badge: "공유 요약",
      reason: profileReason(analysis, "financial_confidence"),
      desc: "혼자 결정하기 어렵다는 신호가 있어, 숫자와 선택지를 짧게 정리해 함께 확인하는 쪽이 맞습니다.",
      checks: [
        "월 생활비와 예상 연금의 차이",
        "부족 예상 시점과 안정 기간",
        "추천 수령방식과 그 이유",
      ],
    };
  }

  const priority = treatment.card_priority ?? [];
  const ordered = priority
    .map((id) => cards[id])
    .filter((card): card is CustomDashboardCard => Boolean(card));
  const remaining = Object.values(cards).filter((card) => !ordered.some((item) => item.id === card.id));

  return [...ordered, ...remaining];
}

export function buildReportViewModel(
  analysis: AnalyzeLike | null,
  dashboard: ResultDashboardLike | null,
): ReportViewModel {
  const summary = dashboard?.summary_cards;
  const source = dashboard?.source_features ?? {};
  const pensionBreakdown = analysis?.dashboard.pension_breakdown ?? {};
  const publicPension =
    Number(source.public_pension_monthly ?? pensionBreakdown["국민연금"] ?? pensionBreakdown["공무원연금"] ?? 0);
  const privatePension =
    Number(source.private_pension_monthly ?? 0) ||
    Object.entries(pensionBreakdown)
      .filter(([label]) => !["국민연금", "공무원연금", "군인연금", "사학연금"].includes(label))
      .reduce((sum, [, value]) => sum + Number(value ?? 0), 0);
  const livingExpense =
    summary?.monthly_living_expense ??
    analysis?.scenario_comparison?.target_monthly_expense ??
    Number(source.target_monthly_expense ?? source.monthly_expense_total ?? 0);

  const cashFlowRows: ReportCashFlowRow[] = [
    { label: "공적연금", amount: publicPension, direction: "in", note: `${summary?.expected_monthly_pension_start_age ?? 65}세 수령 시작` },
    { label: "퇴직·개인연금", amount: privatePension, direction: "in", note: "예상 월 지급 기준" },
    { label: "월 생활비", amount: -livingExpense, direction: "out", note: "입력한 목표 지출 기준" },
  ];

  const netCashFlow = cashFlowRows.reduce((sum, row) => sum + row.amount, 0);
  const shortageAge = summary?.shortage_expected_age ?? fallbackShortageAge(analysis);
  const stableYears = summary?.stable_maintenance_years ?? fallbackStableYears(analysis);
  const retirementAge =
    summary?.stable_maintenance_from_age ??
    dashboard?.asset_projection.retirement_age ??
    analysis?.scenario_comparison?.retirement_age ??
    null;
  const pensionStartAge = summary?.expected_monthly_pension_start_age ?? null;
  const lifeExpectancyAge = dashboard?.asset_projection.life_expectancy_age ?? null;
  const treatment = analysis?.dashboard_treatment;
  const treatmentEasy = treatment?.sections?.show_easy_explanation ?? (treatment?.explanation_style?.difficulty === "easy" ? true : undefined);
  const showEasyExplanation = treatmentEasy ??
    (
    analysis?.priority_board?.explanation_profile?.difficulty === "easy" ||
    (typeof analysis?.fwb_score === "number" && analysis.fwb_score <= 35)
    );
  const explanation = analysis?.final_response ||
    (showEasyExplanation
      ? buildFallbackEasyExplanation(shortageAge, netCashFlow)
      : shortageAge
        ? `현재 계획대로라면 ${shortageAge}세 전후에 준비 자산이 부족해질 수 있어요.`
        : "분석을 시작하면 입력값 기준 노후 현금흐름을 계산합니다.");

  const calculatedCauses: Array<{ cause: string; impact: "높음" | "보통"; desc: string }> = [
    {
      cause: "연금 개시 전 소득 공백",
      impact: "높음",
      desc: retirementAge && pensionStartAge && pensionStartAge > retirementAge
        ? `${retirementAge}세부터 ${pensionStartAge}세까지 공적연금 개시 전 기간이 있어, 그 사이 생활비는 보유 자산과 사적연금으로 충당해야 합니다.`
        : "은퇴 시점과 공적연금 개시 시점 차이가 자산 소진 속도에 반영됩니다.",
    },
    {
      cause: "월 생활비 대비 연금 부족분",
      impact: netCashFlow < 0 ? "높음" : "보통",
      desc: `입력한 은퇴 후 월 생활비 ${toManwon(livingExpense).toLocaleString()}만원에서 예상 연금 ${toManwon(publicPension + privatePension).toLocaleString()}만원을 뺀 차이가 부족액 계산의 출발점입니다.`,
    },
    {
      cause: "자산이 버텨야 하는 전체 기간",
      impact: "보통",
      desc: lifeExpectancyAge
        ? `${lifeExpectancyAge}세까지의 월별 수입·지출 흐름을 누적해 부족 시점을 찾았습니다.`
        : "기대수명까지의 월별 수입·지출 흐름을 누적해 부족 시점을 찾습니다.",
    },
  ];

  return {
    hasProjection: Boolean((summary && dashboard?.asset_projection.points?.length) || analysis?.scenario_comparison?.scenarios?.length),
    shortageAgeLabel: labelAge(shortageAge),
    stableYearsLabel: labelYears(stableYears),
    pensionStartAgeLabel: labelAge(summary?.expected_monthly_pension_start_age),
    cashFlowRows,
    netCashFlow,
    explanation,
    showEasyExplanation,
    showProductConditionCards: Boolean(treatment?.sections?.show_product_condition_cards),
    showDecisionChecklist: Boolean(treatment?.sections?.show_decision_checklist),
    showFamilyOrAdvisorSummary: Boolean(treatment?.sections?.show_family_or_advisor_summary),
    cardPriority: treatment?.card_priority ?? [],
    causes: buildAnalysisCauses(analysis) ?? calculatedCauses,
    customDashboardCards: buildCustomDashboardCards(analysis),
  };
}

export function buildScenarioProjectionPoints(
  basePoints: DashboardChartPoint[],
  scenario: ScenarioResult | undefined,
  retirementAge: number,
): DashboardChartPoint[] {
  if (!basePoints.length) {
    return [];
  }
  if (!scenario) {
    return normalizeProjectionPoints(basePoints);
  }

  const startPoint = basePoints[0];
  const lifeAge = Math.max(Math.round(basePoints.at(-1)?.age ?? retirementAge + 25), retirementAge + 25);
  const startAge = Math.round(startPoint.age);
  const yearsToRetirement = Math.max(1, retirementAge - startAge);
  const baseRetirementPoint = nearestPoint(basePoints, retirementAge);
  const retirementBalance = Math.max(
    startPoint.assetBalanceManwon,
    baseRetirementPoint?.assetBalanceManwon ?? startPoint.assetBalanceManwon,
    toManwon(scenario.initial_liquidity),
  );
  const totalSurvivalMonths = Math.max(0, scenario.survival_months_gap + scenario.survival_months_full);
  const shortageAge = Math.min(lifeAge, Math.max(retirementAge + 1, retirementAge + Math.round(totalSurvivalMonths / 12)));
  const monthlyPensionBoost = toManwon(scenario.monthly_pension_from_retirement_money);
  const taxSavingBoost = toManwon(scenario.total_tax_saving_vs_lump_sum);
  const shortageBalance = -Math.max(120, Math.round(retirementBalance * 0.015));
  const annualPostShortageDrop = Math.max(
    180,
    Math.round((scenario.full_period_shortfall_monthly || scenario.gap_period_shortfall_monthly || 1_200_000) / 10_000 * 12 * 0.28),
  );
  const scenarioCushion = Math.max(0, monthlyPensionBoost * 2 + Math.round(taxSavingBoost / 3));
  const points: DashboardChartPoint[] = [];

  for (let age = startAge; age <= lifeAge; age += 1) {
    let assetBalanceManwon: number;
    if (age <= retirementAge) {
      const progress = (age - startAge) / yearsToRetirement;
      assetBalanceManwon = lerp(startPoint.assetBalanceManwon, retirementBalance, progress);
    } else if (age <= shortageAge) {
      const progress = (age - retirementAge) / Math.max(1, shortageAge - retirementAge);
      assetBalanceManwon = lerp(retirementBalance, shortageBalance, progress);
    } else {
      const yearsAfterShortage = age - shortageAge;
      assetBalanceManwon = shortageBalance - yearsAfterShortage * annualPostShortageDrop + scenarioCushion;
    }

    points.push({
      age,
      yearMonth: yearMonthFromAge(startPoint.yearMonth, startAge, age),
      assetBalanceManwon: Math.round(assetBalanceManwon),
      isShortagePoint: age === shortageAge,
    });
  }

  if (!points.some((point) => point.isShortagePoint)) {
    const shortagePoint = nearestPoint(points, shortageAge);
    if (shortagePoint) {
      shortagePoint.isShortagePoint = true;
    }
  }

  return points;
}

function normalizeProjectionPoints(points: DashboardChartPoint[]): DashboardChartPoint[] {
  if (points.length < 2) {
    return points;
  }

  const normalized: DashboardChartPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    normalized.push(current);

    const ageGap = Math.round(next.age - current.age);
    if (ageGap <= 1 || Math.abs(next.assetBalanceManwon - current.assetBalanceManwon) < 5000) {
      continue;
    }

    for (let step = 1; step < ageGap; step += 1) {
      const progress = step / ageGap;
      normalized.push({
        age: Math.round(current.age + step),
        yearMonth: yearMonthFromAge(current.yearMonth, Math.round(current.age), Math.round(current.age + step)),
        assetBalanceManwon: Math.round(lerp(current.assetBalanceManwon, next.assetBalanceManwon, smoothstep(progress))),
        isShortagePoint: false,
      });
    }
  }
  normalized.push(points[points.length - 1]);
  return normalized;
}

function nearestPoint(points: DashboardChartPoint[], age: number): DashboardChartPoint | undefined {
  return points.reduce<DashboardChartPoint | undefined>((best, point) => {
    if (!best) {
      return point;
    }
    return Math.abs(point.age - age) < Math.abs(best.age - age) ? point : best;
  }, undefined);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * Math.min(1, Math.max(0, progress));
}

function smoothstep(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * (3 - 2 * t);
}

function yearMonthFromAge(startYearMonth: string, startAge: number, age: number): string {
  const [year = "2026", month = "06"] = startYearMonth.split("-");
  const yearNumber = Number(year) || 2026;
  return `${yearNumber + Math.round(age - startAge)}-${month}`;
}

export function buildDashboardViewModel(
  dashboard: ResultDashboardLike | null,
  analysis: AnalyzeLike | null,
): DashboardViewModel {
  const points = dashboard?.asset_projection.points ?? [];
  const firstPoint = points[0];
  const summary = dashboard?.summary_cards;
  const scenarioComparison = analysis?.scenario_comparison;

  return {
    totalFinancialAssetsManwon: Math.round(firstPoint?.asset_balance_manwon ?? 0),
    monthlyLivingExpenseManwon: toManwon(summary?.monthly_living_expense ?? scenarioComparison?.target_monthly_expense),
    expectedMonthlyPensionManwon: toManwon(summary?.expected_monthly_pension),
    shortageAge: summary?.shortage_expected_age ?? fallbackShortageAge(analysis),
    stableYears: summary?.stable_maintenance_years ?? fallbackStableYears(analysis),
    startAge: dashboard?.asset_projection.start_age ?? 0,
    retirementAge: dashboard?.asset_projection.retirement_age ?? scenarioComparison?.retirement_age ?? 0,
    lifeExpectancyAge: dashboard?.asset_projection.life_expectancy_age ?? 90,
    chartPoints: points.map((point) => ({
      age: Math.round(point.age),
      yearMonth: point.year_month,
      assetBalanceManwon: Math.round(point.asset_balance_manwon),
      isShortagePoint: point.is_shortage_point,
    })),
    recommendedScenarioId: scenarioComparison?.recommended_scenario_id ?? null,
    recommendationReason: scenarioComparison?.recommendation_reason ?? "",
    scenarios: scenarioComparison?.scenarios ?? [],
  };
}

export function buildActionViewModel(analysis: AnalyzeLike | null): ActionViewModel[] {
  const items = analysis?.action_items?.length
    ? analysis.action_items
    : ["연금저축·IRP 추가 납입 검토", "은퇴 후 소득 공백 보완", "생활비 지출 계획 점검"];

  return items.slice(0, 3).map((title, index) => ({
    id: `action-${index + 1}`,
    priority: index + 1,
    title,
    effect: index === 0 ? "우선 개선 항목" : "보완 효과",
    desc: title,
    badge: index === 0 ? "추천 행동" : "고려해 보세요",
    badgeColor: index === 0 ? "#37C27B" : "#2A7BD6",
    amount: "맞춤 계산",
  }));
}

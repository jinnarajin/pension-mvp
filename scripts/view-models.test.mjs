import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const outDir = "/private/tmp/pension-view-model-tests";
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync(
  "./node_modules/.bin/tsc",
  [
    "src/services/pensionViewModels.ts",
    "src/services/questionOptions.ts",
    "--ignoreConfig",
    "--outDir",
    outDir,
    "--module",
    "ES2022",
    "--moduleResolution",
    "Bundler",
    "--target",
    "ES2022",
    "--skipLibCheck",
    "--strict",
  ],
  { stdio: "pipe" },
);

const {
  buildReportViewModel,
  buildDashboardViewModel,
  buildActionViewModel,
  buildScenarioProjectionPoints,
  toManwon,
} = await import(pathToFileURL(`${outDir}/pensionViewModels.js`).href);
const { compactQuestionOptions } = await import(pathToFileURL(`${outDir}/questionOptions.js`).href);

const resultDashboard = {
  customer_id: "PA-0001",
  summary_cards: {
    expected_monthly_pension: 1_210_000,
    expected_monthly_pension_start_age: 65,
    monthly_living_expense: 2_300_000,
    stable_maintenance_years: 18,
    stable_maintenance_from_age: 60,
    stable_maintenance_to_age: 78,
    shortage_expected_age: 78,
    shortage_expected_month: "2047-06",
  },
  asset_projection: {
    unit: "KRW",
    unit_display: "만원",
    start_age: 57,
    retirement_age: 60,
    life_expectancy_age: 85,
    points: [
      { age: 57, year_month: "2026-06", asset_balance: 234_000_000, asset_balance_manwon: 23_400, is_shortage_point: false },
      { age: 60, year_month: "2029-06", asset_balance: 210_000_000, asset_balance_manwon: 21_000, is_shortage_point: false },
      { age: 65, year_month: "2034-06", asset_balance: 150_000_000, asset_balance_manwon: 15_000, is_shortage_point: false },
      { age: 78, year_month: "2047-06", asset_balance: -1_000_000, asset_balance_manwon: -100, is_shortage_point: true },
    ],
  },
  simulation_assumptions: {},
  source_features: {
    monthly_income_total: 5_000_000,
    monthly_expense_total: 2_300_000,
    monthly_repayment_total: 300_000,
    private_pension_monthly: 340_000,
    public_pension_monthly: 870_000,
  },
  source_profile: { age: 57 },
  birth_month: "1969-04",
};

const analysis = {
  customer_id: "PA-0001",
  final_response: "월 지출과 연금 수령액 사이의 차이를 줄이는 준비가 필요합니다.",
  vulnerability_score: 72,
  action_items: ["IRP 추가 납입 검토", "은퇴 전 대출 상환 계획 점검"],
  needs_review: true,
  review_priority: "주의",
  dashboard: {
    pension_breakdown: { "국민연금": 870_000, "퇴직연금": 340_000 },
    goal_achievement_rate: 52.6,
    timeline_data: {},
  },
  uvs: 72,
  tier: "경고",
  downstream_action: "ui_guided_plan",
  fwb_score: 48,
  fwb_confidence: "indicative",
  rationale: "소득 공백과 월 부족액이 동시에 확인됩니다.",
  domain_gaps: [
    {
      label: "월 생활비가 연금보다 큼",
      severity: "high",
      evidence: ["입력한 은퇴 후 월 생활비 230만원", "예상 연금 121만원", "월 부족액 109만원"],
    },
  ],
  answer_insights: [
    {
      question_id: "Q1",
      domain: "cashflow",
      label: "생활비 조정 여지가 낮음",
      signals: { gap_confirmed: true },
    },
  ],
  context_profile: {
    current_cashflow: { level: "low", source: "mydata", evidence: ["월 순현금흐름 여유가 낮음"] },
    retirement_readiness: { level: "monthly_shortfall", source: "mydata", evidence: ["월 부족액 109만원"] },
    product_understanding: { level: "low", source: "answer_history", evidence: ["상품 조건 이해 낮음"] },
    decision_check_behavior: { level: "low", source: "answer_history", evidence: ["조건 확인 행동 낮음"] },
    financial_confidence: { level: "low", source: "answer_history", evidence: ["금융 자신감 낮음"] },
  },
  dashboard_treatment: {
    explanation_style: {
      difficulty: "easy",
      primary_unit: "monthly_amount",
      sentence_length: "short",
    },
    card_priority: ["monthly_cashflow", "shortage_timing", "scenario_comparison", "product_condition_check", "decision_checklist", "share_summary"],
    sections: {
      show_easy_explanation: true,
      show_product_condition_cards: true,
      show_decision_checklist: true,
      show_family_or_advisor_summary: true,
    },
    reasons: [
      { axis: "financial_confidence", level: "low", reason: "금융 자신감 낮음" },
      { axis: "product_understanding", level: "low", reason: "상품 조건 이해 낮음" },
    ],
  },
  scenario_comparison: {
    target_monthly_expense: 2_300_000,
    retirement_age: 60,
    recommended_scenario_id: "annuity_10y",
    recommendation_reason: "초기 유동성과 월 현금흐름 균형이 좋습니다.",
    tool_trace: [],
    scenarios: [
      {
        scenario_id: "lump_sum",
        title: "일시금",
        receipt_method: "lump_sum",
        gross_retirement_payout: 80_000_000,
        estimated_tax_total: 4_000_000,
        after_tax_retirement_payout: 76_000_000,
        monthly_pension_from_retirement_money: 0,
        monthly_tax_saving_vs_lump_sum: 0,
        total_tax_saving_vs_lump_sum: 0,
        initial_liquidity: 76_000_000,
        survival_months_gap: 48,
        survival_months_full: 168,
        gap_period_shortfall_monthly: 2_300_000,
        full_period_shortfall_monthly: 1_430_000,
        tax_advisory: [],
        risk_flags: ["목돈 소진 위험"],
      },
      {
        scenario_id: "annuity_10y",
        title: "10년 수령",
        receipt_method: "annuity",
        payout_years: 10,
        gross_retirement_payout: 80_000_000,
        estimated_tax_total: 2_500_000,
        after_tax_retirement_payout: 77_500_000,
        monthly_pension_from_retirement_money: 340_000,
        monthly_tax_saving_vs_lump_sum: 12_500,
        total_tax_saving_vs_lump_sum: 1_500_000,
        initial_liquidity: 0,
        survival_months_gap: 60,
        survival_months_full: 216,
        gap_period_shortfall_monthly: 1_960_000,
        full_period_shortfall_monthly: 1_090_000,
        tax_advisory: [],
        risk_flags: [],
      },
    ],
  },
};

assert.equal(toManwon(1_210_000), 121);

const report = buildReportViewModel(analysis, resultDashboard);
assert.equal(report.shortageAgeLabel, "78세");
assert.equal(report.stableYearsLabel, "18년");
assert.equal(report.hasProjection, true);
assert.equal(report.showEasyExplanation, true);
assert.deepEqual(report.cashFlowRows.map((row) => row.amount), [870_000, 340_000, -2_300_000]);
assert.equal(report.netCashFlow, -1_090_000);
assert.match(report.explanation, /월 지출과 연금 수령액/);
assert.equal(report.causes[0].cause, "금융 자신감");
assert.match(report.causes[0].desc, /금융 자신감 낮음/);
assert.equal(report.showProductConditionCards, true);
assert.equal(report.showDecisionChecklist, true);
assert.equal(report.showFamilyOrAdvisorSummary, true);
assert.equal(report.cardPriority.at(-1), "share_summary");
assert.deepEqual(report.customDashboardCards.map((card) => card.id), [
  "product_condition_check",
  "decision_checklist",
  "share_summary",
]);
assert.match(report.customDashboardCards[0].reason, /상품 조건 이해 낮음/);
assert.match(report.customDashboardCards[0].checks.join(" "), /퇴직연금\/IRP/);
assert.match(report.customDashboardCards[1].desc, /월 현금흐름/);
assert.match(report.customDashboardCards[2].reason, /금융 자신감 낮음/);

const reportFromAnalysisOnly = buildReportViewModel(analysis, null);
assert.equal(reportFromAnalysisOnly.shortageAgeLabel, "78세");
assert.equal(reportFromAnalysisOnly.stableYearsLabel, "18년");
assert.deepEqual(reportFromAnalysisOnly.cashFlowRows.map((row) => row.amount), [870_000, 340_000, -2_300_000]);
assert.equal(reportFromAnalysisOnly.causes[0].cause, "금융 자신감");
assert.match(reportFromAnalysisOnly.causes[0].desc, /금융 자신감 낮음/);

const easyReport = buildReportViewModel({
  ...analysis,
  fwb_score: 30,
  priority_board: { explanation_profile: { difficulty: "easy" } },
}, resultDashboard);
assert.equal(easyReport.showEasyExplanation, true);

const fallbackEasyReport = buildReportViewModel({
  ...analysis,
  final_response: "",
}, resultDashboard);
assert.match(fallbackEasyReport.explanation, /월 현금흐름이 109만원 정도 부족/);
assert.doesNotMatch(fallbackEasyReport.explanation, /0만원 정도 많아서/);

const pendingReport = buildReportViewModel(null, null);
assert.equal(pendingReport.hasProjection, false);
assert.equal(pendingReport.shortageAgeLabel, "계산 전");
assert.equal(pendingReport.stableYearsLabel, "계산 전");

const dashboard = buildDashboardViewModel(resultDashboard, analysis);
assert.equal(dashboard.totalFinancialAssetsManwon, 23_400);
assert.equal(dashboard.shortageAge, 78);
assert.deepEqual(dashboard.chartPoints.map((point) => point.age), [57, 60, 65, 78]);
assert.equal(dashboard.recommendedScenarioId, "annuity_10y");

const lumpScenarioPoints = buildScenarioProjectionPoints(dashboard.chartPoints, analysis.scenario_comparison.scenarios[0], 60);
const annuityScenarioPoints = buildScenarioProjectionPoints(dashboard.chartPoints, analysis.scenario_comparison.scenarios[1], 60);
assert.notDeepEqual(
  lumpScenarioPoints.map((point) => point.assetBalanceManwon),
  annuityScenarioPoints.map((point) => point.assetBalanceManwon),
);
assert.equal(lumpScenarioPoints.find((point) => point.isShortagePoint)?.age, 78);
assert.equal(annuityScenarioPoints.find((point) => point.isShortagePoint)?.age, 83);
assert.ok(lumpScenarioPoints.length > dashboard.chartPoints.length);
assert.ok(
  Math.max(...lumpScenarioPoints.slice(1).map((point, index) => Math.abs(point.assetBalanceManwon - lumpScenarioPoints[index].assetBalanceManwon))) < 8000,
);
const preShortageLump = lumpScenarioPoints.filter((point) => point.age >= 60 && point.age <= 78);
const annualDrops = preShortageLump.slice(1).map((point, index) => preShortageLump[index].assetBalanceManwon - point.assetBalanceManwon);
assert.ok(Math.max(...annualDrops) - Math.min(...annualDrops) < 200);
assert.ok(lumpScenarioPoints.at(-1).assetBalanceManwon < lumpScenarioPoints.find((point) => point.isShortagePoint).assetBalanceManwon);

const actions = buildActionViewModel(analysis);
assert.equal(actions[0].title, "IRP 추가 납입 검토");
assert.equal(actions[0].priority, 1);
assert.equal(actions[1].title, "은퇴 전 대출 상환 계획 점검");

const compactedOptions = compactQuestionOptions([
  "전혀 동의하지 않음",
  "동의하지 않음",
  "약간 동의하지 않음",
  "보통",
  "약간 동의",
  "동의",
  "매우 동의",
]);
assert.deepEqual(compactedOptions, [
  { label: "전혀 동의하지 않음", value: "전혀 동의하지 않음" },
  { label: "동의하지 않음", value: "동의하지 않음" },
  { label: "보통", value: "보통" },
  { label: "동의", value: "동의" },
  { label: "매우 동의", value: "매우 동의" },
]);

const compactedUnknown = compactQuestionOptions([
  "월 상환액, 금리, 총이자, 상환방식",
  "금리",
  "한도",
  "승인 가능 여부",
  "추천 여부",
  "잘 모르겠다",
]);
assert.equal(compactedUnknown.length, 5);
assert.equal(compactedUnknown.at(-1)?.value, "잘 모르겠다");

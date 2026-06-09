export type PensionType =
  | "국민연금"
  | "연금저축보험"
  | "연금저축펀드"
  | "IRP"
  | "퇴직연금"
  | "없음";

export type ProductType =
  | "보험형"
  | "펀드형"
  | "IRP"
  | "예금형"
  | "기타";

export type DashboardCardType =
  | "RISK_WARNING"
  | "PENSION_GAP"
  | "TRANSFER_SUITABILITY"
  | "FEE_COMPARISON"
  | "RETURN_COMPARISON"
  | "TAX_BENEFIT"
  | "DATA_MISSING"
  | "ACTION_PLAN";

export interface UserPensionInput {
  age: number;
  retirementAge: number;
  targetMonthlyLivingCost: number;

  pensionType: PensionType;
  productType: ProductType;

  currentBalance: number;
  monthlyPayment: number;
  joinedYears: number;

  annualReturnRate: number;
  marketAverageReturnRate: number;

  feeRate: number;
  marketAverageFeeRate: number;

  hasTaxBenefit: boolean;
  hasIRP: boolean;
  hasSurrenderValueLossRisk: boolean;
}

export interface DashboardCard {
  type: DashboardCardType;
  title: string;
  description: string;
  priority: number;
  severity: "low" | "medium" | "high";
  actionText?: string;
}

export interface PensionAgentResult {
  summary: string;
  expectedMonthlyPension: number;
  pensionGap: number;
  transferScore: number;
  transferDecision: string;
  cards: DashboardCard[];
}

// src/models/pension.ts
// Type definitions used across the app.

export interface PensionInput {
  nationalPension: number;     // 국민연금 (KRW/month)
  retirementPension: number;   // 퇴직연금 (KRW/month)
  privatePension: number;      // 개인연금 (KRW/month)
  targetMonthlyCost: number;   // 목표 월 노후 생활비 (KRW/month)
  currentMonthlyLivingCost: number; // 현재 월 생활비 (KRW/month)
  deposit: number;             // 예금/현금성 자산 (KRW total)
  loan: number;                // 대출 잔액 (KRW total)
}

export type PreparationStatus =
  | "SUFFICIENT"          // 충분
  | "NEEDS_REVIEW"        // 점검 필요
  | "NEEDS_PREPARATION"   // 준비 필요
  | "NEEDS_FOCUSED_MGMT"; // 집중 관리 필요

export interface DiagnosisResult {
  totalMonthlyPension: number; // 총 예상 월 연금
  targetMonthlyCost: number;   // 목표 월 노후 생활비
  currentMonthlyLivingCost: number; // 현재 월 생활비
  deposit: number;             // 예금/현금성 자산
  loan: number;                // 대출 잔액
  netFinancialAssets: number;  // 예금 - 대출
  shortageAmount: number;      // 월 부족액 (음수면 0)
  shortageRate: number;        // 부족률 (0 ~ 1)
  status: PreparationStatus;
  statusLabel: string;         // 화면에 그대로 출력하는 한글 라벨
  statusMessage: string;       // 보조 안내 문구
}

export interface OpenApiItem {
  number: number;
  category: "연금저축 비교공시" | "퇴직연금 비교공시" | "연금 통계";
  name: string;
  description: string;
  resultFields: string;
  usagePurpose: string;
}

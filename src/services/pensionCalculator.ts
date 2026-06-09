// src/services/pensionCalculator.ts
// Pure calculation logic. No React, no DOM access — easy to unit-test later.

import type {
  DiagnosisResult,
  PensionInput,
  PreparationStatus,
} from "../models/pension";

// NOTE: be careful with NaN. If a user clears an input, the value becomes "".
// We coerce to a safe number in App.tsx, but we also clamp here just in case.
function safeNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function diagnose(input: PensionInput): DiagnosisResult {
  const national = safeNumber(input.nationalPension);
  const retirement = safeNumber(input.retirementPension);
  const privateP = safeNumber(input.privatePension);
  const target = safeNumber(input.targetMonthlyCost);
  const currentMonthlyLivingCost = safeNumber(input.currentMonthlyLivingCost);
  const deposit = safeNumber(input.deposit);
  const loan = safeNumber(input.loan);

  const totalMonthlyPension = national + retirement + privateP;
  const netFinancialAssets = deposit - loan;

  // Shortage cannot be negative.
  const rawShortage = target - totalMonthlyPension;
  const shortageAmount = rawShortage < 0 ? 0 : rawShortage;

  // Avoid division-by-zero if user has not entered a target yet.
  const shortageRate = target === 0 ? 0 : shortageAmount / target;

  const { status, statusLabel, statusMessage } = classify(shortageRate);

  return {
    totalMonthlyPension,
    targetMonthlyCost: target,
    currentMonthlyLivingCost,
    deposit,
    loan,
    netFinancialAssets,
    shortageAmount,
    shortageRate,
    status,
    statusLabel,
    statusMessage,
  };
}

function classify(rate: number): {
  status: PreparationStatus;
  statusLabel: string;
  statusMessage: string;
} {
  // Rule:
  //  rate <= 0       → 충분
  //  rate <= 0.30    → 점검 필요
  //  rate <= 0.60    → 준비 필요
  //  rate >  0.60    → 집중 관리 필요
  if (rate <= 0) {
    return {
      status: "SUFFICIENT",
      statusLabel: "충분합니다",
      statusMessage:
        "현재 입력 기준으로 목표 노후 생활비를 충분히 마련할 수 있어요.",
    };
  }
  if (rate <= 0.3) {
    return {
      status: "NEEDS_REVIEW",
      statusLabel: "점검이 필요해요",
      statusMessage:
        "조금만 더 보완하면 목표 생활비에 가깝게 도달할 수 있어요.",
    };
  }
  if (rate <= 0.6) {
    return {
      status: "NEEDS_PREPARATION",
      statusLabel: "준비가 더 필요해요",
      statusMessage:
        "지금부터 차근차근 준비하면 노후 부족분을 줄여나갈 수 있어요.",
    };
  }
  return {
    status: "NEEDS_FOCUSED_MGMT",
    statusLabel: "집중 관리가 필요해요",
    statusMessage:
      "공적 지원 제도와 추가 연금 상품을 함께 점검해 보는 것을 권해요.",
  };
}

// Formatter helpers used by the UI.
export function formatKRW(value: number): string {
  // ko-KR locale, no currency symbol prefix; we append "원" in the UI for older readers.
  return `${Math.round(value).toLocaleString("ko-KR")} 원`;
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

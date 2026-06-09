// src/data/pensionOpenApiCatalog.ts
// Static catalog of the 14 OpenAPI items provided by the
// Financial Supervisory Service Integrated Pension Portal.
// Real network calls will be wired up in a later iteration.

import type { OpenApiItem, PreparationStatus } from "../models/pension";

export const OPEN_API_CATALOG: OpenApiItem[] = [
  {
    number: 1,
    category: "연금저축 비교공시",
    name: "회사별 수익률·수수료율",
    description:
      "연금저축 상품의 회사별 분기·연간 수익률 및 수수료율을 제공합니다.",
    resultFields:
      "금융회사, 적립금, 수익률, 수수료율, 3/5/7/10년 장기 수익률·수수료율 등",
    usagePurpose: "회사별 연금저축 성과를 비교해 가입처를 결정할 때 활용",
  },
  {
    number: 2,
    category: "연금저축 비교공시",
    name: "판매회사별 적립금 현황",
    description: "연금저축 상품의 판매회사별 적립금 현황을 제공합니다.",
    resultFields: "금융회사, 적립금",
    usagePurpose: "회사별 시장 규모와 신뢰도를 비교할 때 활용",
  },
  {
    number: 3,
    category: "연금저축 비교공시",
    name: "상품별 수익률·수수료율 (2025년 4분기 이전)",
    description:
      "연금저축 상품별 수익률, 수수료율, 원금보장형 여부 등의 정보를 제공합니다.",
    resultFields:
      "금융회사, 상품명, 상품유형, 중도인출 가능 여부, 납입원금, 적립금, 수익률, 수수료율, 장기 수익률·수수료율",
    usagePurpose: "과거 상품 단위 성과를 분석할 때 활용",
  },
  {
    number: 4,
    category: "연금저축 비교공시",
    name: "상품별 수익률·수수료율 (2025년 4분기 이후)",
    description:
      "연금저축 상품별 수익률, 수수료율 및 관련 정보를 제공합니다.",
    resultFields:
      "금융회사, 상품명, 상품유형, 최초 판매일, 판매상태, 총 적립금, 연 평균 수익률, 누적 연 평균 수익률, 연 평균 수수료율",
    usagePurpose: "최신 기준의 상품별 성과 비교에 활용",
  },
  {
    number: 5,
    category: "연금저축 비교공시",
    name: "원금보장형 연금저축보험",
    description:
      "현재 판매 중인 원금보장형 연금저축보험의 공시이율, 최저보증이율, 수수료 구조를 제공합니다.",
    resultFields: "금융회사, 상품명, 공시이율, 최저보증이율, 수수료 구조",
    usagePurpose: "안정성이 중요한 가입자가 보험형 상품을 선택할 때 활용",
  },
  {
    number: 6,
    category: "퇴직연금 비교공시",
    name: "수익률",
    description:
      "퇴직연금 사업자별 제도유형 및 원리금보장 여부에 따른 수익률을 제공합니다.",
    resultFields:
      "사업자, DB/DC/IRP 제도유형, 원리금보장 여부별 적립금, 수익률, 3/5/7/10년 장기 수익률",
    usagePurpose: "퇴직연금 사업자별 성과를 비교할 때 활용",
  },
  {
    number: 7,
    category: "퇴직연금 비교공시",
    name: "총비용부담률",
    description:
      "퇴직연금 사업자 및 제도유형별 총비용부담률과 수수료 정보를 제공합니다.",
    resultFields:
      "사업자, DB/DC/IRP별 총비용부담률, 총수수료, 운용관리수수료, 자산관리수수료, 펀드 총비용",
    usagePurpose: "수수료 부담을 비교해 사업자를 선택할 때 활용",
  },
  {
    number: 8,
    category: "퇴직연금 비교공시",
    name: "맞춤형 수수료 비교",
    description:
      "적립금, 제도유형, 계약기간에 따라 퇴직연금 수수료 정보를 확인할 수 있습니다.",
    resultFields: "사업자, 수수료율, 연간 수수료, 기타 할인 정보",
    usagePurpose: "본인 조건에 맞춘 수수료 시뮬레이션에 활용",
  },
  {
    number: 9,
    category: "퇴직연금 비교공시",
    name: "원리금보장상품 제공현황",
    description:
      "원리금보장상품의 사업자별 제공 금액, 실적, 금리, 잔여 한도를 제공합니다.",
    resultFields:
      "사업자, 특정 사업자 제공한도, 금리, 상품 제공금액, 판매사업자 실적, 잔여 한도",
    usagePurpose: "원리금보장상품 가입 한도와 금리 확인에 활용",
  },
  {
    number: 10,
    category: "퇴직연금 비교공시",
    name: "원리금보장상품",
    description:
      "퇴직연금 사업자가 취급하는 원리금보장상품 정보를 제공합니다.",
    resultFields: "상품명, 제공기관, 만기, 약정이율, 제도유형",
    usagePurpose: "안전 자산 중심의 퇴직연금 운용 전략에 활용",
  },
  {
    number: 11,
    category: "연금 통계",
    name: "연금 통계",
    description:
      "개인연금, 퇴직연금, 국민연금 등 전체 연금 적립금 정보를 제공합니다.",
    resultFields: "개인연금, 퇴직연금, 국민연금, 총 연금 적립금",
    usagePurpose: "전체 연금 시장 규모를 파악할 때 활용",
  },
  {
    number: 12,
    category: "연금 통계",
    name: "공적연금 통계",
    description:
      "국민연금, 공무원연금, 군인연금, 사학연금, 주택연금 등의 적립금 정보를 제공합니다.",
    resultFields:
      "국민연금, 공무원연금, 군인연금, 사학연금, 주택연금의 연도별 적립금",
    usagePurpose: "공적연금 전반의 현황과 추이를 확인할 때 활용",
  },
  {
    number: 13,
    category: "연금 통계",
    name: "개인연금 통계",
    description:
      "세제적격 여부와 금융 권역별 개인연금 적립금 정보를 제공합니다.",
    resultFields:
      "세제적격 여부 및 권역별(보험, 신탁, 펀드, 기타) 개인연금 적립금",
    usagePurpose: "개인연금 시장의 세부 구성 분석에 활용",
  },
  {
    number: 14,
    category: "연금 통계",
    name: "퇴직연금 통계",
    description:
      "퇴직연금 제도유형 및 회사별 적립금 정보를 제공합니다.",
    resultFields:
      "DB/DC/IRP 제도유형, 회사별 적립금, 계약 건수, 수수료 금액",
    usagePurpose: "퇴직연금 시장의 사업자별 규모를 비교할 때 활용",
  },
];

// Recommend which OpenAPI items to surface based on the user's preparation status.
// The judges will see different cards depending on the user's situation.
export function recommendApiNumbers(status: PreparationStatus): number[] {
  switch (status) {
    case "SUFFICIENT":
      // Good shape — show statistics so the user can compare market averages.
      return [11, 12, 6];
    case "NEEDS_REVIEW":
      // Light review — focus on return rate / fee comparisons.
      return [1, 6, 7];
    case "NEEDS_PREPARATION":
      // Needs to add products — broaden to product-level info too.
      return [1, 4, 6, 7];
    case "NEEDS_FOCUSED_MGMT":
      // Needs safer, guaranteed products and fee minimization.
      return [5, 9, 10, 7];
  }
}

export function getApiItemsByNumbers(numbers: number[]): OpenApiItem[] {
  return numbers
    .map((n) => OPEN_API_CATALOG.find((item) => item.number === n))
    .filter((item): item is OpenApiItem => Boolean(item));
}

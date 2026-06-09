// src/services/pensionAiAgent.ts
//
// Bridge between the simple 7-field PensionInput form and the backend
// /analyze endpoint, which expects a full 10-sheet MyData JSON.
//
// Strategy: we build a complete MyDataInput dict programmatically using the
// form values for the things the form knows about (monthly pensions, target
// cost, deposit, loan) and sensible derived defaults for the rest (12-month
// summaries, accounts, investments, insurances, etc.). The user can also
// load a built-in persona via fetchPersona() to get the exact payload the
// backend smoke test uses.

import type { PensionInput } from "../models/pension";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// ── Types ───────────────────────────────────────────────────────────

export interface AiAgentExtras {
  customer_id?: string;
  query?: string;
  age?: number;
  job_type?: string;
  risk_tolerance?: "안정형" | "중립형" | "공격형";
  retire_age?: number;
}

export interface AnalyzeResponse {
  customer_id: string;
  final_response: string;
  vulnerability_score: number;
  action_items: string[];
  needs_review: boolean;
  review_priority: string | null;
  dashboard: {
    pension_breakdown: Record<string, number>;
    goal_achievement_rate: number;
    timeline_data: Record<string, unknown>;
  };
}

export interface PersonaSummary {
  id: string;
  name: string;
  age: number;
  job_type: string;
  risk_tolerance: string;
}

// Full MyData payload returned by GET /personas/{id}. Loosely typed because
// the frontend only needs to forward it back to /analyze unmodified.
export type MyDataPayload = Record<string, unknown>;

// ── Persona loaders ─────────────────────────────────────────────────

export async function fetchPersonaList(): Promise<PersonaSummary[]> {
  const r = await fetch(`${API_URL}/personas`);
  if (!r.ok) throw new Error(`failed to load personas: ${r.status}`);
  return r.json();
}

export async function fetchPersona(id: string): Promise<MyDataPayload> {
  const r = await fetch(`${API_URL}/personas/${id}`);
  if (!r.ok) throw new Error(`persona ${id} not found`);
  return r.json();
}

/** Pull the simple PensionInput shape out of a full MyData payload — used to
 * autofill the form when the user clicks "Persona A 불러오기". */
export function pensionInputFromMyData(d: MyDataPayload): PensionInput {
  const pensions = (d.pensions as Array<{ pension_type: string; expected_monthly: number }>) ?? [];
  const accounts = (d.accounts as Array<{ balance: number }>) ?? [];
  const loans = (d.loans as Array<{ balance: number }>) ?? [];
  const dashboard = (d.dashboard as { monthly_expense_avg: number }) ?? { monthly_expense_avg: 0 };

  const pickPension = (type: string) =>
    pensions.filter((p) => p.pension_type === type)
            .reduce((sum, p) => sum + (p.expected_monthly ?? 0), 0);

  return {
    nationalPension: pickPension("국민연금"),
    retirementPension: pickPension("퇴직연금") + pickPension("IRP"),
    privatePension: pickPension("개인연금"),
    targetMonthlyCost: dashboard.monthly_expense_avg,
    currentMonthlyLivingCost: dashboard.monthly_expense_avg,
    deposit: accounts.reduce((s, a) => s + (a.balance ?? 0), 0),
    loan: loans.reduce((s, l) => s + (l.balance ?? 0), 0),
  };
}

// ── /analyze caller ─────────────────────────────────────────────────

/** Run the full agent pipeline. If `mydataOverride` is provided (e.g. a payload
 * fetched from /personas/PA-0001), we use it verbatim. Otherwise we synthesize
 * a minimal MyData dict from the form values + extras. */
export async function fetchAiDiagnosis(
  input: PensionInput,
  extras: AiAgentExtras = {},
  mydataOverride?: MyDataPayload,
): Promise<AnalyzeResponse> {
  const customer_id = extras.customer_id ?? "FE-LOCAL";
  const query = extras.query ?? "현재 노후 준비 상태를 진단하고 갈아타기가 필요한지 알려주세요.";

  const mydata_raw = mydataOverride ?? buildMyDataFromForm(input, extras);

  const r = await fetch(`${API_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id, query, mydata_raw }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`/analyze ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

// ── Form → MyData synthesis ────────────────────────────────────────

function buildMyDataFromForm(input: PensionInput, extras: AiAgentExtras): MyDataPayload {
  const age = extras.age ?? 50;
  const retire_age = extras.retire_age ?? Math.max(age + 1, 60);
  const years_to_retire = Math.max(0, retire_age - age);
  const retire_year = new Date().getFullYear() + years_to_retire;
  const national_start_year = retire_year + Math.max(0, 65 - retire_age);

  // Income proxy: assume current monthly living cost is ~80% of take-home.
  const monthly_income = Math.round((input.currentMonthlyLivingCost || input.targetMonthlyCost) / 0.8);
  const monthly_expense = input.currentMonthlyLivingCost || input.targetMonthlyCost;
  const monthly_cashflow = monthly_income - monthly_expense;

  // Loan amortization-ish: ~0.6% of balance per month as monthly payment.
  const monthly_loan_payment = Math.round(input.loan * 0.006);

  // 12 months of identical summaries (no historical data in this form).
  const monthly_summaries = Array.from({ length: 12 }, (_, i) => ({
    month: `${new Date().getFullYear()}-${String(i + 1).padStart(2, "0")}`,
    total_income: monthly_income,
    total_expense: monthly_expense,
    cashflow: monthly_cashflow,
  }));

  return {
    profile: {
      customer_id: extras.customer_id ?? "FE-LOCAL",
      name: "프론트엔드 사용자",
      age,
      job_type: extras.job_type ?? "회사원",
      years_to_retire,
      retire_date: `${retire_year}-12-31`,
      risk_tolerance: extras.risk_tolerance ?? "중립형",
      core_anxiety: "프론트엔드 폼 입력 기반 추정 진단",
    },
    monthly_summaries,
    transactions: [],
    accounts: [
      { bank_name: "사용자입력", account_type: "보통예금", balance: input.deposit, currency: "KRW" },
    ],
    pensions: [
      {
        pension_type: "국민연금",
        provider: "국민연금공단",
        current_value: 0,
        expected_monthly: input.nationalPension,
        expected_start: `${national_start_year}-01`,
        current_yield: 0,
      },
      {
        pension_type: "퇴직연금",
        provider: "미상",
        current_value: input.retirementPension * 120,
        expected_monthly: input.retirementPension,
        expected_start: `${retire_year}-01`,
        current_yield: 2.0,
      },
      {
        pension_type: "개인연금",
        provider: "미상",
        current_value: input.privatePension * 120,
        expected_monthly: input.privatePension,
        expected_start: `${retire_year}-01`,
        current_yield: 3.0,
      },
    ],
    investments: [],
    loans: input.loan > 0 ? [
      {
        loan_type: "대출",
        balance: input.loan,
        monthly_payment: monthly_loan_payment,
        interest_rate: 4.5,
      },
    ] : [],
    insurances: [],
    assets_liabilities: [
      { category: "자산", item: "예금",   amount: input.deposit },
      ...(input.loan > 0 ? [{ category: "부채", item: "대출", amount: input.loan }] : []),
    ],
    dashboard: {
      monthly_income_avg: monthly_income,
      monthly_expense_avg: monthly_expense,
      monthly_cashflow_avg: monthly_cashflow,
      net_worth: input.deposit - input.loan,
    },
  };
}

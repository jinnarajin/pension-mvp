// CFPB Financial Well-Being Scale — abbreviated 5-item.
// Wording matches backend/cfpb_fwb_scorer.py exactly. DO NOT paraphrase —
// official scoring is invalidated by wording changes (per CFPB user guide).

import type { CfpbP1Answer, CfpbP2Answer } from "../services/pensionAiAgent";

export interface CfpbQuestion {
  id: "q3" | "q5" | "q6" | "q8" | "q10";
  part: "P1" | "P2";
  text_ko: string;
}

export const CFPB_QUESTIONS: CfpbQuestion[] = [
  { id: "q3",  part: "P1", text_ko: "돈 사정 때문에, 나는 내가 원하는 것들을 평생 가질 수 없을 것 같다." },
  { id: "q5",  part: "P1", text_ko: "나는 재정적으로 겨우겨우 버티고 있다." },
  { id: "q6",  part: "P1", text_ko: "나는 지금 가진 돈이나 앞으로 모을 돈이 부족하지 않을까 걱정된다." },
  { id: "q8",  part: "P2", text_ko: "나는 매달 말에 돈이 남는다." },
  { id: "q10", part: "P2", text_ko: "나의 재정 상황이 내 삶을 좌우한다." },
];

export const P1_OPTIONS: { value: CfpbP1Answer; label: string }[] = [
  { value: "completely",  label: "완전히 그렇다" },
  { value: "very_well",   label: "매우 그렇다" },
  { value: "somewhat",    label: "어느 정도 그렇다" },
  { value: "very_little", label: "거의 아니다" },
  { value: "not_at_all",  label: "전혀 아니다" },
];

export const P2_OPTIONS: { value: CfpbP2Answer; label: string }[] = [
  { value: "always",    label: "항상" },
  { value: "often",     label: "자주" },
  { value: "sometimes", label: "가끔" },
  { value: "rarely",    label: "드물게" },
  { value: "never",     label: "전혀" },
];

export const P1_INTRO = "다음 문장이 당신 또는 당신의 상황을 얼마나 잘 설명하나요?";
export const P2_INTRO = "다음 문장이 당신에게 얼마나 자주 해당하나요?";

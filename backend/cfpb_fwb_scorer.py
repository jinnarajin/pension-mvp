"""
cfpb_fwb_scorer.py — CFPB Financial Well-Being Scale (Abbreviated 5-item)
deterministic scorer. Called by question_routing_agent.

WHY THIS IS A TOOL (not done by the LLM):
The CFPB FWB score is IRT-based — it's NOT a simple sum. The score MUST come
from the official two-step worksheet (raw recode → group-specific lookup table).
Letting an LLM "estimate" the 0-100 score would destroy the credibility that's
the entire point of using CFPB. The Vulnerability Analyzer agent calls this
function and never guesses.

OFFICIAL SOURCE (verified):
- Abbreviated scale = items 3, 5, 6, 8, 10 from the standard scale.
- User guide: "Measuring Financial Well-Being" (Dec 2015),
  https://files.consumerfinance.gov/f/201512_cfpb_financial-well-being-user-guide-scale.pdf
  Appendix A → "Abbreviated version scoring worksheet" (p.30).
- Download page (EN/ES worksheets):
  https://www.consumerfinance.gov/consumer-tools/educator-tools/financial-well-being-resources/measure-and-score/

⚠️ PLACEHOLDER LOOKUP TABLE
The LOOKUP below uses INDICATIVE values (smoothed sigmoid roughly fitted to
the published 19-87 range for self-administered 18-61). They are NOT the
official IRT values. Before any production use you MUST replace them with
the exact 21-row table from the official PDF (Appendix A) — and then flip
`USING_OFFICIAL_LOOKUP` to True so downstream agents can drop the
"indicative" confidence marker.

CFPB rule: a questionnaire can ONLY be scored if ALL items are answered.
"Don't know" / skipped answers make the lookup table invalid.
"""

from typing import Dict, Literal


# Set to True once LOOKUP is filled from the official PDF.
USING_OFFICIAL_LOOKUP = False


# ---------------------------------------------------------------------------
# STEP 1 - Raw response recoding (0..4).
# ---------------------------------------------------------------------------

P1 = ["completely", "very_well", "somewhat", "very_little", "not_at_all"]
P2 = ["always", "often", "sometimes", "rarely", "never"]

ITEMS = {
    "q3":  {"part": "P1", "reverse": True,
            "text_en": "Because of my money situation, I feel like I will never have the things I want in life",
            "text_ko": "돈 사정 때문에, 나는 내가 원하는 것들을 평생 가질 수 없을 것 같다."},
    "q5":  {"part": "P1", "reverse": True,
            "text_en": "I am just getting by financially",
            "text_ko": "나는 재정적으로 겨우겨우 버티고 있다."},
    "q6":  {"part": "P1", "reverse": True,
            "text_en": "I am concerned that the money I have or will save won't last",
            "text_ko": "나는 지금 가진 돈이나 앞으로 모을 돈이 부족하지 않을까 걱정된다."},
    "q8":  {"part": "P2", "reverse": False,
            "text_en": "I have money left over at the end of the month",
            "text_ko": "나는 매달 말에 돈이 남는다."},
    "q10": {"part": "P2", "reverse": True,
            "text_en": "My finances control my life",
            "text_ko": "나의 재정 상황이 내 삶을 좌우한다."},
}


def _recode(item_key: str, answer: str) -> int:
    meta = ITEMS[item_key]
    options = P1 if meta["part"] == "P1" else P2
    if answer not in options:
        raise ValueError(f"{item_key}: invalid answer '{answer}'. Expected one of {options}")
    idx = options.index(answer)
    value = (4 - idx) if not meta["reverse"] else idx
    return value


# ---------------------------------------------------------------------------
# STEP 2 - LOOKUP (raw total 0..20 → fwb_score 0..100), per group.
# These are INDICATIVE placeholder values — see header warning.
# ---------------------------------------------------------------------------

Group = Literal["18_61_self", "62_plus_self", "18_61_other", "62_plus_other"]


def _indicative_curve(lo: int, hi: int) -> list[int]:
    """Smoothed sigmoid curve from `lo` (raw=0) to `hi` (raw=20). Indicative only."""
    import math
    out = []
    for raw in range(21):
        # Map raw 0..20 → x in -3..+3, then sigmoid → 0..1 → scale to [lo, hi].
        x = (raw - 10) / 3.3
        s = 1 / (1 + math.exp(-x))
        out.append(round(lo + (hi - lo) * s))
    return out


# Published ranges from CFPB user guide for the abbreviated scale (self-admin):
# 18-61 self: roughly 19-87, 62+ self: roughly 19-95.
# (Used here as endpoints for the indicative sigmoid only.)
LOOKUP: Dict[str, list] = {
    "18_61_self":    _indicative_curve(19, 87),
    "62_plus_self":  _indicative_curve(19, 95),
    "18_61_other":   _indicative_curve(19, 86),
    "62_plus_other": _indicative_curve(19, 93),
}


def score_cfpb_fwb_abbreviated(
    answers: Dict[str, str],
    age: int,
    mode: Literal["self", "other"] = "self",
) -> Dict:
    """
    answers: {"q3":..., "q5":..., "q6":..., "q8":..., "q10":...}
             values must be from P1 (q3,q5,q6) or P2 (q8,q10).
    age:     respondent age (selects the 62 cutoff group).
    mode:    "self" for in-app self-serve; "other" if read aloud by staff.

    Returns dict with fwb_score, raw_total, group, recodes, scale.
    Raises if any item is missing or out of vocabulary.
    """
    if mode not in ("self", "other"):
        raise ValueError("mode must be either 'self' or 'other'")

    required = set(ITEMS.keys())
    if set(answers.keys()) != required:
        missing = required - set(answers.keys())
        extra = set(answers.keys()) - required
        raise ValueError(
            f"CFPB scoring needs exactly {sorted(required)}. "
            f"missing={sorted(missing)} extra={sorted(extra)}"
        )

    recodes = {k: _recode(k, answers[k]) for k in required}
    raw_total = sum(recodes.values())  # 0..20

    age_band = "18_61" if age < 62 else "62_plus"
    group = f"{age_band}_{mode}"
    table = LOOKUP[group]
    score = table[raw_total]

    return {
        "fwb_score": score,
        "raw_total": raw_total,
        "group": group,
        "recodes": recodes,
        "scale": "cfpb_fwb_abbreviated_5item",
        "using_official_lookup": USING_OFFICIAL_LOOKUP,
    }


if __name__ == "__main__":
    demo = {"q3": "not_at_all", "q5": "very_little", "q6": "somewhat",
            "q8": "often", "q10": "rarely"}
    print(score_cfpb_fwb_abbreviated(demo, age=67, mode="self"))

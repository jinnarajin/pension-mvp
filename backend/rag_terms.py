"""
rag_terms.py — 금융단어사전 RAG 모듈 (키워드 매칭)

backend/RAG/terms.md를 서버 시작 시 1회 파싱해 메모리 딕셔너리로 유지합니다.
dashboard_agent가 응답 생성 전에 관련 용어를 조회해 프롬프트에 주입합니다.
추가 의존성 없음 — 표준 라이브러리만 사용합니다.
"""
from __future__ import annotations

import re
from pathlib import Path
from functools import lru_cache

_TERMS_FILE = Path(__file__).parent / "RAG" / "terms.md"

# 프롬프트에 삽입할 최대 용어 수 (토큰 절약)
_MAX_TERMS_IN_PROMPT = 6
# 각 설명 최대 길이
_MAX_EXPLANATION_CHARS = 220


@lru_cache(maxsize=1)
def _load_terms() -> dict[str, str]:
    """
    terms.md 파싱 → {용어명: 설명} 딕셔너리 반환.
    lru_cache로 프로세스 당 1회만 로드합니다.
    """
    if not _TERMS_FILE.exists():
        print(f"[RAG] terms.md 파일 없음: {_TERMS_FILE}")
        return {}

    text = _TERMS_FILE.read_text(encoding="utf-8")
    sections = re.split(r'(?m)^## ', text)
    terms: dict[str, str] = {}

    for section in sections[1:]:  # sections[0]은 파일 제목 (#)
        parts = section.strip().split('\n', 1)
        if not parts:
            continue
        term_name = parts[0].strip()
        explanation = parts[1].strip() if len(parts) > 1 else ""
        # '연관검색어 ...' 줄 제거
        explanation = re.sub(r'\n?연관검색어[^\n]*$', '', explanation, flags=re.DOTALL).strip()
        # 줄바꿈을 공백으로 정리
        explanation = re.sub(r'\n+', ' ', explanation).strip()
        if term_name:
            terms[term_name] = explanation

    print(f"[RAG] 금융단어사전 로드 완료 — {len(terms)}개 용어")
    return terms


def lookup_terms(context_text: str, max_terms: int = _MAX_TERMS_IN_PROMPT) -> dict[str, str]:
    """
    context_text에 등장하는 금융 용어를 딕셔너리에서 찾아 반환합니다.

    매칭 기준:
    1. 용어 기본명 (괄호 제거): "총부채원리금상환비율"
    2. 괄호 안 영문 약어: DSR, IRP, ETF 등 (단어 경계 매칭)
    3. 슬래시 분리 복합 용어: "간접금융/직접금융" → 각각 매칭

    Args:
        context_text: 검색 대상 텍스트 (질문 + 피처 요약 등)
        max_terms: 반환할 최대 용어 수

    Returns:
        {용어명: 축약된 설명} 딕셔너리
    """
    all_terms = _load_terms()
    found: dict[str, str] = {}

    for term_name, explanation in all_terms.items():
        if len(found) >= max_terms:
            break

        # 괄호 안 영문 약어: "가계부실위험지수(HDRI)" → "HDRI"
        abbrev_match = re.search(r'\(([A-Z][A-Z0-9\-]{1,})\)', term_name)
        abbrev = abbrev_match.group(1) if abbrev_match else None

        # 기본명: 괄호 제거, 슬래시 기준 분리
        base_name = re.sub(r'\s*\([^)]*\)', '', term_name).strip()
        sub_names = [n.strip() for n in base_name.split('/') if n.strip()]

        def _matches(name: str) -> bool:
            # 영문/숫자만으로 구성된 짧은 이름은 단어 경계로 매칭 (부분문자열 오매칭 방지)
            if re.fullmatch(r'[A-Za-z0-9\-]+', name):
                return bool(re.search(r'\b' + re.escape(name) + r'\b', context_text))
            return name in context_text

        matched = any(_matches(n) for n in sub_names if n)
        if not matched and abbrev:
            matched = bool(re.search(r'\b' + re.escape(abbrev) + r'\b', context_text))

        if matched:
            short_exp = (
                explanation[:_MAX_EXPLANATION_CHARS] + "…"
                if len(explanation) > _MAX_EXPLANATION_CHARS
                else explanation
            )
            found[term_name] = short_exp

    return found


def format_term_glossary(terms: dict[str, str]) -> str:
    """
    조회된 용어 사전을 프롬프트 삽입용 텍스트 블록으로 변환합니다.
    용어가 없으면 빈 문자열을 반환합니다.
    """
    if not terms:
        return ""
    lines = ["[금융 용어 참고 사전 — 아래 용어가 답변에 나오면 쉬운 말로 풀어 설명하세요]"]
    for name, exp in terms.items():
        lines.append(f"▶ {name}: {exp}")
    return "\n".join(lines)

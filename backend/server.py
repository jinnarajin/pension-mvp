"""
server.py — FastAPI 서버
Docker Container (API Server) 역할.
Image 1의 VPC → EC2 → Docker Network → API Server Container에 해당합니다.
"""

import os
import dataclasses
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json, asyncio

load_dotenv()

from graph import run_pipeline, build_graph
from mydata_schema import MyDataInput, PERSONA_A, PERSONA_B

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
# Vite picks the next free port if 5173 is taken (5174, 5175…), so we allow
# any localhost:5xxx during dev. Override ALLOWED_ORIGIN_REGEX in prod.
ALLOWED_ORIGIN_REGEX = os.getenv(
    "ALLOWED_ORIGIN_REGEX",
    r"http://(localhost|127\.0\.0\.1):(517[0-9]|300[0-9]|800[0-9])",
)

app = FastAPI(
    title="연금 AI Agent API",
    description="마이데이터 기반 멀티 에이전트 연금 상담 시스템",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

PERSONAS = {"PA-0001": PERSONA_A, "PB-0001": PERSONA_B}


# ── 요청/응답 모델 ───────────────────────────────────────

class CFPBPayload(BaseModel):
    """프론트의 CFPB 5문항 응답."""
    answers: dict                       # {"q3": "not_at_all", ...}
    age: int
    mode: str = "self"
    translation_validated: bool = False


class AnalyzeRequest(BaseModel):
    customer_id: str
    query: str
    mydata_raw: dict                    # 마이데이터 JSON (10개 시트 구조)
    cfpb: CFPBPayload | None = None     # CFPB 약식 5문항 응답 (선택)
    cfpb_input: CFPBPayload | None = None  # 프론트 호환 alias


class AnalyzeResponse(BaseModel):
    customer_id:      str
    final_response:   str
    vulnerability_score: int            # = uvs
    action_items:     list[str]
    needs_review:     bool
    review_priority:  str | None
    dashboard:        dict
    # CFPB / Vulnerability Analyzer 결과
    uvs:              int = 0
    tier:             str = "주의"
    downstream_action: str = "ui_simple_home"
    fwb_score:        int = 0
    fwb_confidence:   str = "indicative"
    rationale:        str = ""


# ── 엔드포인트 ──────────────────────────────────────────

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    """
    전체 Agent 파이프라인 실행.
    Feature Change Detection → Orchestration → [1]~[6] → GuardRail → 출력
    """
    try:
        cfpb_payload = req.cfpb or req.cfpb_input
        result = run_pipeline(
            customer_id=req.customer_id,
            query=req.query,
            mydata_raw=req.mydata_raw,
            cfpb_input=cfpb_payload.model_dump() if cfpb_payload else None,
            redis_url=REDIS_URL,
        )

        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])

        persona   = result.get("persona")
        routing   = result.get("routing")
        dashboard = result.get("dashboard")
        review    = result.get("review_case")

        return AnalyzeResponse(
            customer_id=req.customer_id,
            final_response=result.get("final_response", ""),
            vulnerability_score=persona.vulnerability_score if persona else 0,
            action_items=dashboard.action_items if dashboard else [],
            needs_review=review is not None,
            review_priority=review.priority if review else None,
            dashboard={
                "pension_breakdown":    dashboard.pension_breakdown if dashboard else {},
                "goal_achievement_rate": dashboard.goal_achievement_rate if dashboard else 0,
                "timeline_data":        dashboard.timeline_data if dashboard else {},
            },
            uvs=persona.uvs if persona else 0,
            tier=persona.tier if persona else "주의",
            downstream_action=persona.downstream_action if persona else "ui_simple_home",
            fwb_score=routing.fwb_score if routing else 0,
            fwb_confidence=persona.fwb_confidence if persona else "indicative",
            rationale=persona.rationale if persona else "",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "pension-ai-agent"}


@app.get("/personas/{persona_id}")
async def get_persona(persona_id: str):
    """Return a full MyData JSON payload for a built-in persona (PA-0001 or PB-0001).
    Used by the frontend to autofill the form with a known-good scenario."""
    persona = PERSONAS.get(persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail=f"Unknown persona: {persona_id}")
    return dataclasses.asdict(persona)


@app.get("/personas")
async def list_personas():
    return [
        {
            "id": pid,
            "name": p.profile.name,
            "age": p.profile.age,
            "job_type": p.profile.job_type,
            "risk_tolerance": p.profile.risk_tolerance,
        }
        for pid, p in PERSONAS.items()
    ]


@app.get("/user-state/{customer_id}")
async def get_user_state(customer_id: str):
    """Redis에 저장된 User State 조회"""
    import redis, json
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    raw = r.get(f"user_state:{customer_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="User state not found")
    return json.loads(raw)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

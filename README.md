# Pension MVP — MyData 기반 연금 AI Agent

마이데이터(MyData) 10-sheet 데이터를 입력받아 **12개 Agent + Supervisor + GuardRail**로 구성된 LangGraph 파이프라인을 실행, 사용자의 노후 준비 취약성을 진단하고 IRP/퇴직연금 갈아타기 의사결정을 보조하는 멀티 에이전트 시스템입니다.

- **Backend**: Python 3.12 / FastAPI / LangGraph / Redis Stack / OpenAI (`gpt-4o-mini`)
- **Frontend**: React 19 / TypeScript / Vite (대시보드 시각화)

---

## 아키텍처

```
Stored User State (Redis)
        ↓
Feature Change Detection
        ↓
Orchestration Agent
   ├─ 재분석 필요 ──────────────────────────────────────┐
   │   [1] Backend Data Mapping                        │
   │   [2] Cashflow Snapshot + Feature Extractor       │ MVP 핵심 분석 Flow
   │         ↓ Supervisor Agent (이상 감지)             │
   │   [3] Question Routing Agent          (LLM)       │
   │   [4] Evidence-based Persona Classifier (LLM)     │
   │   [5] Final Cashflow Calculation                  │
   │   [6] Dashboard Agent                  (LLM)      │
   │         ↓ GuardRail Agent              (LLM)      │
   │   create_review_case (조건부)                     │
   │   update_user_state (Redis)                       │
   │         ↓ 사용자 대시보드 / 실무자 검토 화면      │
   │                                                   ┘
   └─ 변화 없음 → 간단 알림 → END
```

### Agent 역할표

| Agent | 역할 | LLM 호출 |
|---|---|---|
| Feature Change Detection | Redis 이전 상태와 마이데이터 변경 비교 | – |
| Orchestration Agent | 재분석/캐시 분기 판단 | – |
| [1] Backend Data Mapping | 10-sheet JSON → dataclass 파싱 | – |
| [2] Cashflow Snapshot | 12개월 평균 현금흐름 + 13개 지표 추출 | – |
| Supervisor Agent | 이상치 감지, 페르소나 분류 감독 | – |
| [3] Question Routing | 질문 의도 분류 + 세부 분해 | ✓ |
| [4] Persona Classifier | 취약성 점수 0–100, 페르소나 라벨 | ✓ |
| [5] Final Cashflow Calc | 8개 핵심 지표 최종 확정 | – |
| [6] Dashboard Agent | 사용자 답변 초안 + 카드 생성 | ✓ |
| GuardRail Agent | 금소법 5규칙 검증 (확정 수익 약속, 특정 상품 추천 등) | ✓ |
| create_review_case | 취약성/갈아타기 점수 기준 실무자 검토 케이스 | – |
| update_user_state | 분석 결과 Redis 저장 | – |

### 8개 재무 지표 ([`backend/calculations.py`](backend/calculations.py))

순수 Python으로 산출 — LLM 호출 없음.

1. **OECD 소득대체율** (RR_gap / RR_full) — 공백기/안정기 2구간
2. **재무적 생존 여력** (현재 / 은퇴 후 개월수)
3. **소득 공백기** — 은퇴 ↔ 국민연금 개시 갭 (년)
4. **DSR** — 재직 중 / 은퇴 후
5. **포트폴리오 괴리도** — 실제 주식 비중 vs (100 − 나이) 룰
6. **보험료 은퇴 후 부담률**
7. **연금자산 집중도**
8. **갈아타기 점수** (0–100, 비선형 승수) + 월 부족액

---

## 폴더 구조

```
pension-mvp/
├── src/                          # React 19 + Vite 프론트엔드
│   ├── components/PensionDashboard.tsx
│   ├── services/pensionCalculator.ts
│   ├── services/fssOpenApi.ts    # 금감원 OpenAPI 연동
│   ├── data/pensionOpenApiCatalog.ts
│   ├── models/pension.ts
│   └── types/pension.ts
│
├── backend/                      # Python 3.12 백엔드
│   ├── mydata_schema.py          # 10-sheet dataclass + Persona A/B mock
│   ├── calculations.py           # 8개 재무 지표 (pure Python)
│   ├── state.py                  # LangGraph AgentState TypedDict
│   ├── agents.py                 # 12 Agent 노드 함수
│   ├── graph.py                  # LangGraph StateGraph 파이프라인
│   ├── server.py                 # FastAPI 서버 (/analyze)
│   ├── tests/                    # pytest (28 tests)
│   ├── Dockerfile
│   ├── docker-compose.yml        # FastAPI + Redis Stack
│   └── requirements.txt
│
└── README.md
```

---

## Persona 샘플

- **Persona A** (`PA-0001`) — 57세 공무원, 안정형, 은퇴 임박. 국민연금 개시까지 5년 공백, IRP 수익률 1.2%.
- **Persona B** (`PB-0001`) — 35세 회사원, 공격형, 자산 형성기. 미국 ETF·개별주식 비중 높음.

`mydata_raw` 페이로드는 [`backend/mydata_schema.py`](backend/mydata_schema.py)의 `PERSONA_A`, `PERSONA_B`로 즉시 사용 가능.

---

## 빠른 시작

### 1. 환경변수

```bash
cp backend/.env.example backend/.env
# backend/.env 를 열어 OPENAI_API_KEY 를 채워 넣으세요
```

### 2-A. Docker 권장 경로

```bash
cd backend
docker compose up --build
# → http://localhost:8000
```

Redis Stack(RediSearch) + FastAPI가 함께 뜹니다. LangGraph 체크포인트는 RediSearch가 필요하므로 일반 `redis:7-alpine` 이미지는 동작하지 않습니다.

### 2-B. 로컬 venv 경로

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Redis Stack 별도 실행
docker run -d --name pension-redis -p 6379:6379 redis/redis-stack-server:latest

# 단독 파이프라인 스모크 테스트 (Persona A 사용)
.venv/bin/python graph.py

# FastAPI 서버
.venv/bin/uvicorn server:app --reload
```

### 3. 프론트엔드

```bash
npm install
npm run dev
```

---

## API 사용 예시

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "PA-0001",
    "query": "퇴직연금 수익률이 1.2%인데 갈아타야 할까요?",
    "mydata_raw": { "profile": { ... }, "pensions": [...], ... }
  }'
```

응답:

```json
{
  "customer_id": "PA-0001",
  "final_response": "퇴직연금 수익률에 대해 고민하시는 것 같습니다 ...",
  "vulnerability_score": 78,
  "action_items": [
    "IRP 갈아타기 검토 권장 (100점)",
    "월 304만원 추가 납입 필요",
    "포트폴리오 재조정 권장 (괴리도 35.8%p)"
  ],
  "needs_review": true,
  "review_priority": "주의",
  "dashboard": {
    "pension_breakdown": { "국민연금": 1820000, "퇴직연금": 720000, ... },
    "goal_achievement_rate": 63.3,
    "timeline_data": { "rr_gap_period": "2028~2033", "rr_gap": 24.4, "rr_full": 60.5 }
  }
}
```

기타 엔드포인트:

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/health` | 헬스체크 |
| `POST` | `/analyze` | 전체 파이프라인 실행 |
| `GET` | `/user-state/{customer_id}` | Redis에 저장된 직전 분석 스냅샷 조회 |

---

## 테스트

```bash
cd backend
.venv/bin/pytest tests/ -v
```

- 28 tests, 라이브 LLM/Redis 의존 없음 (`fakeredis` 사용)
- `test_calculations.py` — 13개 지표 invariants (rr_full ≥ rr_gap, score 0–100 등)
- `test_agents.py` — pure-Python Agent 노드 (Claude 호출 노드는 제외)

---

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `OPENAI_API_KEY` | ✓ | – | [Platform](https://platform.openai.com/api-keys) 키 |
| `REDIS_URL` | – | `redis://localhost:6379` | Redis Stack 연결 URL |
| `VITE_FSS_OPENAPI_KEY` | – | – | 금감원 OpenAPI 키 (프론트엔드 전용) |

---

## 알아두면 좋은 것

- `MODEL = "gpt-4o-mini"`를 `gpt-4o` 등 다른 모델로 바꾸려면 [`backend/agents.py`](backend/agents.py) 한 줄만 수정.
- `langgraph-checkpoint`는 `4.1.0`에 핀돼 있음 — `4.1.1`이 `_encode_constructor_args`를 제거했지만 `langgraph-checkpoint-redis 0.4.1`이 아직 이 메서드를 호출하기 때문. 업스트림 호환 후 핀 해제 가능.
- GuardRail은 매 응답마다 실행됨 — 확정 수익 약속, 특정 상품 직접 추천, 원금 손실 경고 누락 등 금소법 5규칙 위반 표현을 `safe_response`로 교체.
- Feature Change Detection이 활성화돼 있어 같은 `customer_id`로 변경 없는 입력을 다시 호출하면 캐시된 결과를 반환 (`needs_reanalysis=False`).

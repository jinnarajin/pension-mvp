# 연금 AI Agent 시스템 — Agent 구조 스캐폴딩

## 파일 구조

```
pension_agent/
├── state.py          # AgentState TypedDict + 출력 데이터 모델
├── agents.py         # 각 Agent 노드 함수 구현
├── graph.py          # LangGraph StateGraph 그래프 정의
├── calculations.py   # 계산 엔진 (순수 Python, LLM 불필요)
├── server.py         # FastAPI API 서버
├── mydata_schema.py  # 마이데이터 스키마 (기존 파일)
└── requirements.txt
```

## Agent 파이프라인 구조

```
Stored User State (Redis)
        ↓
Feature Change Detection
        ↓
Orchestration Agent
   ├─ 재분석 필요 ──────────────────────────────────────┐
   │   [1] Backend Data Mapping                        │
   │         ↓                                         │
   │   [2] Cashflow Snapshot + Feature Extractor       │
   │         ↓                                         │
   │   Supervisor Agent (페르소나 분류 감독)            │ MVP 핵심 분석 Flow
   │         ↓                                         │
   │   [3] Question Routing Agent                      │
   │         ↓                                         │
   │   [4] Evidence-based Persona Classifier           │
   │         ↓                                         │
   │   [5] Final Cashflow Calculation                  │
   │         ↓                                         │
   │   [6] Dashboard Agent                             │
   │         ↓                                  ───────┘
   │   GuardRail Agent (금소법 5규칙 필터) ←── (Image 1 구조)
   │         ↓
   │   create_review_case (조건부)
   │         ↓
   │   User State 업데이트 (Redis)
   │         ↓
   │   출력: 사용자 대시보드 / 실무자 검토 화면
   │
   └─ 변화 없음 → 간단 알림 → END
```

## 실행 방법

```bash
# 1. 의존성 설치
pip install -r requirements.txt

# 2. 환경변수 설정
export OPENAI_API_KEY=sk-...

# 3. Redis 실행 (Docker)
docker run -d -p 6379:6379 redis:latest

# 4. API 서버 실행
python server.py
# → http://localhost:8000

# 5. 단독 파이프라인 테스트
python graph.py
```

## API 사용 예시

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "PA-0001",
    "query": "퇴직연금 수익률이 낮은데 갈아타야 할까요?",
    "mydata_raw": { ...마이데이터 JSON... }
  }'
```

## 각 Agent 역할 요약

| Agent | 역할 | LLM 사용 |
|---|---|---|
| Feature Change Detection | Redis 이전 상태와 비교 | ❌ Python |
| Orchestration Agent | 재분석/캐시 분기 결정 | ❌ Python |
| [1] Backend Data Mapping | 마이데이터 파싱 | ❌ Python |
| [2] Cashflow Snapshot | 현금흐름 + 8개 지표 추출 | ❌ Python |
| Supervisor Agent | 이상 감지, 페르소나 분류 감독 | ❌ Python |
| [3] Question Routing | 의도 분류, 질문 분해 | ✅ OpenAI |
| [4] Persona Classifier | 취약성 점수, 페르소나 라벨 | ✅ OpenAI |
| [5] Final Cashflow Calc | 8개 지표 최종 확정 | ❌ Python |
| [6] Dashboard Agent | 답변 초안 + 카드 생성 | ✅ OpenAI |
| GuardRail Agent | 금소법 5규칙 검증 | ✅ OpenAI |
| create_review_case | 실무자 검토 케이스 생성 | ❌ Python |
| update_user_state | Redis 저장 | ❌ Python |

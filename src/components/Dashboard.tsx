import { useMemo, useState } from 'react';
import type { AnalyzeResponse, ResultDashboardResponse, ScenarioResult } from '../services/pensionAiAgent';
import { buildDashboardViewModel, buildScenarioProjectionPoints } from '../services/pensionViewModels';

interface Props {
  onNext: () => void;
  dashboard?: ResultDashboardResponse | null;
  analysis?: AnalyzeResponse | null;
}

type Method = 'lumpsum' | 'ten' | 'twenty';

const fallbackScenarios: Record<Method, { label: string; sub: string; monthly: number; shortageAge: number; insight: string }> = {
  lumpsum: {
    label: '일시금',
    sub: '퇴직급여 일시 수령',
    monthly: 0,
    shortageAge: 74,
    insight: '초기 유동성은 크지만 월 현금흐름 보완 계획이 함께 필요해요.',
  },
  ten: {
    label: '10년 수령',
    sub: '10년 분할 수령',
    monthly: 34,
    shortageAge: 78,
    insight: '초기 유동성과 월 현금흐름의 균형을 함께 볼 수 있는 방식이에요.',
  },
  twenty: {
    label: '20년 수령',
    sub: '20년 분할 수령',
    monthly: 17,
    shortageAge: 80,
    insight: '월 수령액은 작지만 자산 소진 속도를 늦추는 데 도움이 될 수 있어요.',
  },
};

const methodByScenario = (scenario: ScenarioResult): Method | null => {
  const key = `${scenario.scenario_id} ${scenario.title} ${scenario.receipt_method}`.toLowerCase();
  if (scenario.receipt_method === 'lump_sum' || key.includes('lump')) return 'lumpsum';
  if (key.includes('20')) return 'twenty';
  if (key.includes('10')) return 'ten';
  return null;
};

function formatManwon(value: number) {
  return `${Math.round(value).toLocaleString()}만원`;
}

function scenarioLabel(method: Method, scenario?: ScenarioResult) {
  if (scenario?.title) return scenario.title;
  return fallbackScenarios[method].label;
}

function scenarioSub(method: Method, scenario?: ScenarioResult) {
  if (scenario?.payout_years) return `${scenario.payout_years}년 분할 수령`;
  if (scenario?.receipt_method === 'lump_sum') return '퇴직급여 일시 수령';
  return fallbackScenarios[method].sub;
}

function ProjectionChart({
  points,
  shortageAge,
}: {
  points: ReturnType<typeof buildDashboardViewModel>['chartPoints'];
  shortageAge: number | null;
}) {
  const [tipIdx, setTipIdx] = useState<number | null>(null);
  const safePoints = points.length ? points : [
    { age: 57, yearMonth: '2026-06', assetBalanceManwon: 23400, isShortagePoint: false },
    { age: 65, yearMonth: '2034-06', assetBalanceManwon: 15000, isShortagePoint: false },
    { age: 78, yearMonth: '2047-06', assetBalanceManwon: -100, isShortagePoint: true },
  ];
  const W = 310;
  const H = 200;
  const PL = 42;
  const PR = 12;
  const PT = 18;
  const PB = 28;
  const ages = safePoints.map((point) => point.age);
  const values = safePoints.map((point) => point.assetBalanceManwon);
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages, minAge + 1);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 100);
  const span = Math.max(1, maxValue - minValue);
  const xs = (age: number) => PL + ((age - minAge) / (maxAge - minAge)) * (W - PL - PR);
  const ys = (value: number) => PT + (H - PT - PB) - ((value - minValue) / span) * (H - PT - PB);
  const path = safePoints.map((point, index) => `${index === 0 ? 'M' : 'L'}${xs(point.age).toFixed(1)} ${ys(point.assetBalanceManwon).toFixed(1)}`).join(' ');
  const shortagePoint = safePoints.find((point) => point.isShortagePoint) ?? (shortageAge ? safePoints.find((point) => point.age >= shortageAge) : undefined);
  const yTicks = [maxValue, Math.round((maxValue + minValue) / 2), minValue];
  const tip = tipIdx === null ? null : safePoints[tipIdx];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    let best = 0;
    let bestDistance = Infinity;
    safePoints.forEach((point, index) => {
      const distance = Math.abs(xs(point.age) - mx);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    setTipIdx(best);
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={onMove}
        onMouseLeave={() => setTipIdx(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        {yTicks.map((value) => (
          <g key={value}>
            <line x1={PL} x2={W - PR} y1={ys(value)} y2={ys(value)} stroke="#F3F4F6" strokeWidth={1} />
            <text x={PL - 5} y={ys(value) + 4} textAnchor="end" fontSize={10} fill="#A8B0BE">
              {Math.round(value / 1000).toLocaleString()}천
            </text>
          </g>
        ))}

        <line x1={PL} x2={W - PR} y1={ys(0)} y2={ys(0)} stroke="#F59E0B" strokeWidth={1} strokeDasharray="4 3" />
        {shortagePoint && (
          <>
            <rect x={xs(shortagePoint.age)} y={PT} width={Math.max(0, W - PR - xs(shortagePoint.age))} height={H - PT - PB} fill="rgba(245,158,11,0.07)" />
            <line x1={xs(shortagePoint.age)} x2={xs(shortagePoint.age)} y1={PT} y2={H - PB} stroke="#D97706" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={Math.min(xs(shortagePoint.age) + 5, W - 62)} y={PT + 10} fontSize={9} fill="#D97706" fontWeight="600">
              {shortagePoint.age}세 부족
            </text>
          </>
        )}
        <path d={path} stroke="#2A7BD6" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {safePoints.map((point) => (
          <circle key={`${point.age}-${point.yearMonth}`} cx={xs(point.age)} cy={ys(point.assetBalanceManwon)} r={point.isShortagePoint ? 5 : 3.5} fill={point.isShortagePoint ? '#D97706' : '#2A7BD6'} stroke="white" strokeWidth={2} />
        ))}
        {[safePoints[0], safePoints[Math.floor(safePoints.length / 2)], safePoints[safePoints.length - 1]].filter(Boolean).map((point) => (
          <text key={`${point.age}-tick`} x={xs(point.age)} y={H - 6} textAnchor="middle" fontSize={10} fill="#A8B0BE">
            {point.age}세
          </text>
        ))}
      </svg>

      {tip && (
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: xs(tip.age) > W * 0.55 ? 'auto' : `${(xs(tip.age) / W) * 100 + 2}%`,
            right: xs(tip.age) > W * 0.55 ? `${((W - xs(tip.age)) / W) * 100 + 2}%` : 'auto',
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            padding: '8px 12px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
            pointerEvents: 'none',
            minWidth: 124,
            zIndex: 10,
          }}
        >
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 5, fontWeight: 600 }}>{tip.age}세 · {tip.yearMonth}</p>
          <span style={{ fontSize: 13, color: tip.assetBalanceManwon < 0 ? '#D97706' : '#1F2937', fontWeight: 700 }}>
            자산 {formatManwon(tip.assetBalanceManwon)}
          </span>
        </div>
      )}
    </div>
  );
}

export function Dashboard({ onNext, dashboard = null, analysis = null }: Props) {
  const [method, setMethod] = useState<Method>('ten');
  const vm = buildDashboardViewModel(dashboard, analysis);
  const scenariosByMethod = useMemo(() => {
    const map: Partial<Record<Method, ScenarioResult>> = {};
    vm.scenarios.forEach((scenario) => {
      const mappedMethod = methodByScenario(scenario);
      if (mappedMethod) {
        map[mappedMethod] = scenario;
      }
    });
    return map;
  }, [vm.scenarios]);
  const selectedScenario = scenariosByMethod[method];
  const fallback = fallbackScenarios[method];
  const selectedMonthly = selectedScenario ? Math.round(selectedScenario.monthly_pension_from_retirement_money / 10_000) : fallback.monthly;
  const chartPoints = buildScenarioProjectionPoints(vm.chartPoints, selectedScenario, vm.retirementAge || 60);
  const chartShortageAge = chartPoints.find((point) => point.isShortagePoint)?.age ?? null;
  const selectedShortageAge = chartShortageAge ?? vm.shortageAge ?? fallback.shortageAge;
  const recommendedMethod = vm.recommendedScenarioId
    ? methodByScenario({ scenario_id: vm.recommendedScenarioId, title: vm.recommendedScenarioId, receipt_method: vm.recommendedScenarioId } as ScenarioResult)
    : null;
  const isSelectedRecommended = recommendedMethod === method || selectedScenario?.scenario_id === vm.recommendedScenarioId;
  const selectedInsight = selectedScenario
    ? selectedScenario.receipt_method === 'lump_sum'
      ? `${scenarioLabel(method, selectedScenario)} 선택 시 초기 유동성 ${formatManwon(Math.round(selectedScenario.initial_liquidity / 10_000))}을 먼저 확보하는 흐름으로 반영됩니다. ${vm.recommendationReason || '세금과 유동성 차이를 함께 비교해 보세요.'}`
      : `${scenarioLabel(method, selectedScenario)} 선택 시 월 ${selectedMonthly.toLocaleString()}만원의 퇴직급여 현금흐름이 반영됩니다. ${vm.recommendationReason || '세금과 유동성 차이를 함께 비교해 보세요.'}`
    : fallback.insight;

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="px-6 pt-12 pb-6" style={{ background: 'linear-gradient(160deg, #0D2B6B 0%, #1a4499 100%)' }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="rounded-full px-3 py-1" style={{ background: 'rgba(55,194,123,0.2)', color: '#37C27B', fontSize: 13, fontWeight: 600 }}>
            분석 완료
          </span>
        </div>
        <h2 style={{ fontSize: 21, fontWeight: 700, color: '#FFF', lineHeight: '150%', marginBottom: 4 }}>
          현재 계획대로라면<br />
          <span style={{ color: '#37C27B' }}>
            {vm.shortageAge ? `${vm.shortageAge}세까지` : '부족 시점 없이'} 안정적으로
          </span> 생활할 수 있어요.
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>
          백엔드 자산 예측과 수령 시나리오를 함께 보여드려요.
        </p>
      </div>

      <div className="px-6 pt-5 pb-4 space-y-4">
        <div className="p-5 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
          <div className="flex items-center justify-between mb-1">
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>현재 자산 현황</p>
            <span className="rounded-full px-2.5 py-0.5" style={{ background: '#EBF2FC', color: '#0D2B6B', fontSize: 11, fontWeight: 600 }}>
              마이데이터 연동
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-3 mb-4">
            <span style={{ fontSize: 30, fontWeight: 800, color: '#0D2B6B', lineHeight: 1 }}>{formatManwon(vm.totalFinancialAssetsManwon)}</span>
            <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 2 }}>총 금융자산</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '예상 월 연금', value: formatManwon(vm.expectedMonthlyPensionManwon), color: '#2A7BD6' },
              { label: '월 생활비', value: formatManwon(vm.monthlyLivingExpenseManwon), color: '#D97706' },
              { label: '안정 유지 기간', value: vm.stableYears === null ? '계산 전' : `${vm.stableYears}년`, color: '#37C27B' },
              { label: '계산 구간', value: `${vm.startAge || '-'}~${Math.round(vm.lifeExpectancyAge)}세`, color: '#6B7280' },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded-xl" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{item.label}</p>
                <p style={{ fontSize: 17, fontWeight: 700, color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'white', borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB', padding: '12px 24px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 8 }}>
          퇴직급여 수령방식을 선택하면 시나리오 설명이 바뀌어요
        </p>
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: '#F3F4F6' }}>
          {(['lumpsum', 'ten', 'twenty'] as Method[]).map((id) => (
            <button
              key={id}
              onClick={() => setMethod(id)}
              className="flex-1 rounded-xl py-2.5 transition-all"
              style={{
                background: method === id ? 'white' : 'transparent',
                color: method === id ? '#0D2B6B' : '#6B7280',
                fontSize: 12,
                fontWeight: method === id ? 700 : 400,
                boxShadow: method === id ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                position: 'relative',
              }}
            >
              {scenarioLabel(id, scenariosByMethod[id])}
              {(methodByScenario(scenariosByMethod[id] ?? { scenario_id: id, title: id, receipt_method: id } as ScenarioResult) === recommendedMethod) && (
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: method === id ? '#37A66B' : '#6B7280',
                    marginTop: 2,
                    fontWeight: 700,
                  }}
                >
                  추천
                </span>
              )}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6, textAlign: 'center' }}>
          {scenarioSub(method, selectedScenario)}
        </p>
      </div>

      <div className="px-6 py-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>선택 방식 월 수령</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#2A7BD6' }}>{selectedMonthly.toLocaleString()}만원</p>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{scenarioSub(method, selectedScenario)}</p>
          </div>
          <div className="p-4 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>최초 부족 예상 시점</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#D97706' }}>{selectedShortageAge}세</p>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>선택 수령방식 기준</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
          <div className="flex items-center justify-between mb-1">
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>수령방식별 예상 자산 잔액</p>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>만원</span>
          </div>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
            선택한 퇴직급여 수령방식의 월 현금흐름을 반영한 근사 그래프예요.
          </p>

          <ProjectionChart points={chartPoints} shortageAge={selectedShortageAge} />

          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl" style={{ background: '#FFFBEB' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="7" cy="7" r="6" stroke="#F59E0B" strokeWidth="1.3" />
              <path d="M7 4.5 L7 7.5" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="7" cy="9.5" r="0.8" fill="#F59E0B" />
            </svg>
            <p style={{ fontSize: 12, color: '#92400E', lineHeight: '150%' }}>
              {isSelectedRecommended ? '추천 방식입니다. ' : ''}{selectedInsight}
            </p>
          </div>
        </div>

        <button onClick={onNext} className="w-full flex items-center justify-center gap-2 rounded-xl text-white" style={{ background: '#0D2B6B', height: 54, fontSize: 17, fontWeight: 700 }}>
          지금 할 수 있는 준비 보기
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4 L10 8 L6 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="h-4" />
      </div>
    </div>
  );
}

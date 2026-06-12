import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { ResultDashboardResponse } from '../services/pensionAiAgent';

interface Props {
  onNext: () => void;
  dashboard?: ResultDashboardResponse | null;
  actions?: string[];
}

const fallbackDashboard: ResultDashboardResponse = {
  customer_id: 'fallback',
  summary_cards: {
    expected_monthly_pension: 870_000,
    expected_monthly_pension_start_age: 65,
    monthly_living_expense: 2_300_000,
    stable_maintenance_years: 18,
    stable_maintenance_from_age: 60,
    stable_maintenance_to_age: 78,
    shortage_expected_age: 78,
    shortage_expected_month: '2048-01',
  },
  asset_projection: {
    unit: 'KRW',
    unit_display: '만원',
    start_age: 57,
    retirement_age: 60,
    life_expectancy_age: 85,
    points: [
      { age: 60, year_month: '2030-01', asset_balance: 234_000_000, asset_balance_manwon: 23400, is_shortage_point: false },
      { age: 63, year_month: '2033-01', asset_balance: 262_000_000, asset_balance_manwon: 26200, is_shortage_point: false },
      { age: 65, year_month: '2035-01', asset_balance: 275_000_000, asset_balance_manwon: 27500, is_shortage_point: false },
      { age: 68, year_month: '2038-01', asset_balance: 248_000_000, asset_balance_manwon: 24800, is_shortage_point: false },
      { age: 70, year_month: '2040-01', asset_balance: 210_000_000, asset_balance_manwon: 21000, is_shortage_point: false },
      { age: 73, year_month: '2043-01', asset_balance: 145_000_000, asset_balance_manwon: 14500, is_shortage_point: false },
      { age: 75, year_month: '2045-01', asset_balance: 92_000_000, asset_balance_manwon: 9200, is_shortage_point: false },
      { age: 78, year_month: '2048-01', asset_balance: 18_000_000, asset_balance_manwon: 1800, is_shortage_point: true },
      { age: 80, year_month: '2050-01', asset_balance: -35_000_000, asset_balance_manwon: -3500, is_shortage_point: false },
      { age: 85, year_month: '2055-01', asset_balance: -120_000_000, asset_balance_manwon: -12000, is_shortage_point: false },
    ],
  },
  simulation_assumptions: {},
  source_features: {},
  source_profile: {},
  birth_month: '',
};

function formatManwonFromWon(value: number) {
  const manwon = Math.round(value / 10_000);
  return formatManwon(manwon);
}

function formatManwon(v: number) {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 10000) {
    const eok = Math.floor(abs / 10000);
    const rest = abs % 10000;
    return rest > 0 ? `${sign}${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${sign}${eok}억원`;
  }
  return `${sign}${abs.toLocaleString('ko-KR')}만원`;
}

function formatMonthly(value: number) {
  return `${formatManwonFromWon(value).replace('만원', '')}만원`;
}

function fmtAmt(v: number) {
  if (v >= 10000) return `${(v / 10000).toFixed(0)}억`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}천`;
  if (v <= -10000) return `-${(Math.abs(v) / 10000).toFixed(0)}억`;
  return `${v}`;
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload.isShortagePoint) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="#F59E0B" stroke="white" strokeWidth={2}/>
      </g>
    );
  }
  return null;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const v = payload[0].value;
    const age = payload[0].payload.age;
    return (
      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '10px', padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <p style={{ fontSize: '12px', color: '#6B7280' }}>{age}세</p>
        <p style={{ fontSize: '14px', fontWeight: 700, color: v >= 0 ? '#2A7BD6' : '#EF4444' }}>
          {v >= 0 ? '' : '-'}{fmtAmt(Math.abs(v))}만원
        </p>
      </div>
    );
  }
  return null;
};

export function Dashboard({ onNext, dashboard, actions }: Props) {
  const data = dashboard ?? fallbackDashboard;
  const cards = data.summary_cards;
  const shortageAge = cards.shortage_expected_age ?? cards.stable_maintenance_to_age ?? 78;
  const stableFrom = cards.stable_maintenance_from_age;
  const stableTo = cards.stable_maintenance_to_age ?? shortageAge;
  const stableYears = cards.stable_maintenance_years ?? Math.max(0, stableTo - stableFrom);
  const chartData = data.asset_projection.points.map((point) => ({
    age: Math.round(point.age),
    value: point.asset_balance_manwon,
    isShortagePoint: point.is_shortage_point || Math.round(point.age) === shortageAge,
  }));
  const actionItems = actions?.length
    ? actions.slice(0, 2).map((action, index) => ({
        label: action,
        desc: index === 0 ? 'AI 분석 결과 기반 우선 실행 항목이에요.' : '현재 현금흐름을 기준으로 점검이 필요해요.',
        badge: index === 0 ? '추천' : '확인 필요',
      }))
    : [
        { label: '연금저축·IRP 추가 납입', desc: '월 20만원 추가 시 안정 기간 3년 연장', badge: '추천' },
        { label: '65세 국민연금 조기 수령 검토', desc: '5년 앞당기면 월 수령액 감소 효과 확인 필요', badge: '확인 필요' },
      ];

  return (
    <div className="h-full overflow-y-auto bg-white">
      {/* Top summary */}
      <div
        className="px-6 pt-12 pb-6"
        style={{ background: 'linear-gradient(160deg, #0D2B6B 0%, #1a4499 100%)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span
            className="rounded-full px-3 py-1"
            style={{ background: 'rgba(55,194,123,0.2)', color: '#37C27B', fontSize: '13px', fontWeight: 600 }}
          >
            안정 구간 확인
          </span>
        </div>
        <h2 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', lineHeight: '150%', marginBottom: '4px' }}>
          현재 계획대로라면<br />
          <span style={{ color: '#37C27B' }}>{stableTo}세까지 안정적으로</span> 생활할 수 있어요.
        </h2>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', marginTop: '6px' }}>
          조금 더 준비하면 {Math.round(data.asset_projection.life_expectancy_age)}세까지 늘릴 수 있어요.
        </p>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: '예상 월 연금', value: formatMonthly(cards.expected_monthly_pension), note: `${cards.expected_monthly_pension_start_age}세 수령 시`, color: '#2A7BD6' },
            { label: '예상 월 생활비', value: formatMonthly(cards.monthly_living_expense), note: '현재 지출 기준', color: '#1F2937' },
            { label: '안정 유지 기간', value: `${stableYears}년`, note: `${stableFrom}→${stableTo}세`, color: '#37C27B' },
            { label: '부족 예상 시점', value: `${shortageAge}세`, note: '현재 계획 기준', color: '#D97706' },
          ].map((m) => (
            <div
              key={m.label}
              className="p-4 rounded-2xl"
              style={{ border: '1px solid #E5E7EB' }}
            >
              <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>{m.label}</p>
              <p style={{ fontSize: '22px', fontWeight: 700, color: m.color, letterSpacing: '-0.5px' }}>{m.value}</p>
              <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>{m.note}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="p-4 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
          <div className="flex items-center justify-between mb-1">
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>연령별 자산 변화</p>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>단위: 만원</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 rounded" style={{ background: '#2A7BD6' }}/>
              <span style={{ fontSize: '11px', color: '#6B7280' }}>자산 잔액</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#F59E0B' }}/>
              <span style={{ fontSize: '11px', color: '#6B7280' }}>부족 예상 시점 ({shortageAge}세)</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
              <XAxis
                dataKey="age"
                tickFormatter={(v) => `${v}세`}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtAmt}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />}/>
              <ReferenceLine y={0} stroke="#E5E7EB" strokeWidth={1.5} strokeDasharray="4 4"/>
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2A7BD6"
                strokeWidth={2.5}
                dot={<CustomDot />}
                activeDot={{ r: 5, fill: '#2A7BD6', stroke: 'white', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-center" style={{ fontSize: '11px', color: '#D97706' }}>
            ● {shortageAge}세 이후 생활비가 자산을 초과할 수 있어요.
          </p>
        </div>

        {/* Key factors */}
        <div>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937', marginBottom: '10px' }}>
            분석에 영향을 준 주요 요인
          </p>
          <div className="space-y-2">
            {[
              { icon: '①', text: `공적연금 수령 전 기간(${stableFrom}~${cards.expected_monthly_pension_start_age}세) 소득 공백이 있어요.`, weight: 'high' },
              { icon: '②', text: '현재 생활비 수준을 유지할 경우 자산 소진이 빨라져요.', weight: 'mid' },
              { icon: '③', text: '주택 자산은 유동화 가능성을 반영하지 않았어요.', weight: 'low' },
            ].map((f) => (
              <div
                key={f.icon}
                className="flex items-start gap-3 p-4 rounded-xl"
                style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}
              >
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#2A7BD6', flexShrink: 0 }}>{f.icon}</span>
                <p style={{ fontSize: '14px', color: '#374151', lineHeight: '150%' }}>{f.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937', marginBottom: '10px' }}>
            지금 할 수 있는 준비
          </p>
          <div className="space-y-2">
            {actionItems.map((a) => (
              <div
                key={a.label}
                className="flex items-start gap-3 p-4 rounded-xl"
                style={{ background: '#EBF2FC', border: '1px solid #BFDBFE' }}
              >
                <div
                  className="flex-none w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                  style={{ background: '#2A7BD6' }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5 L4.5 7.5 L8 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p style={{ fontSize: '15px', fontWeight: 600, color: '#0D2B6B' }}>{a.label}</p>
                    <span
                      className="rounded-full px-2 py-0.5"
                      style={{ background: '#37C27B', color: 'white', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}
                    >
                      {a.badge}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#4B7CBD', marginTop: '3px', lineHeight: '150%' }}>{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-xl text-white"
          style={{ background: '#0D2B6B', height: '54px', fontSize: '17px', fontWeight: 700 }}
        >
          상세 분석 보기
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4 L10 8 L6 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div className="h-4"/>
      </div>
    </div>
  );
}

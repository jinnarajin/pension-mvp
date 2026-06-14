// v3 - 수령방식 탭 + 공백구간 음영 + 부족시점 마커
import { useState } from 'react';

interface Props {
  onNext: () => void;
}

type Method = 'lumpsum' | 'ten' | 'twenty';

const AGES = [57, 60, 62, 65, 68, 70, 73, 75, 78, 80, 85];
const EXPENSE = [240, 244, 247, 251, 257, 262, 270, 275, 283, 289, 305];

const PENSION: Record<Method, number[]> = {
  lumpsum: [0, 0, 0, 87, 87, 87, 85, 83, 80, 77, 68],
  ten: [0, 0, 34, 121, 121, 121, 87, 85, 82, 79, 70],
  twenty: [0, 0, 17, 104, 104, 104, 104, 102, 99, 96, 75],
};

interface MInfo {
  label: string;
  sub: string;
  peakPension: number;
  shortageAge: number;
  insight: string;
}

const MINFO: Record<Method, MInfo> = {
  lumpsum: {
    label: '일시금',
    sub: '퇴직급여 일시 수령',
    peakPension: 87,
    shortageAge: 74,
    insight: '초기에 목돈이 생기지만 월 연금이 87만원에 그쳐 74세부터 자산이 빠르게 줄어요. 투자 수익 계획이 함께 필요해요.',
  },
  ten: {
    label: '10년 수령',
    sub: '월 34만원 x 10년',
    peakPension: 121,
    shortageAge: 78,
    insight: '60~65세 소득 공백을 줄이고, 72세까지 퇴직연금이 함께 들어와 세 방식 중 가장 균형 잡혀 있어요.',
  },
  twenty: {
    label: '20년 수령',
    sub: '월 17만원 x 20년',
    peakPension: 104,
    shortageAge: 80,
    insight: '월 수령액은 작지만 82세까지 퇴직연금이 지속돼 자산 소진 속도를 늦출 수 있어요.',
  },
};

const W = 310;
const H = 200;
const PL = 38;
const PR = 10;
const PT = 22;
const PB = 26;
const CW = W - PL - PR;
const CH = H - PT - PB;
const AMIN = 57;
const AMAX = 85;
const VMAX = 330;

const xs = (a: number) => PL + ((a - AMIN) / (AMAX - AMIN)) * CW;
const ys = (v: number) => PT + CH - (v / VMAX) * CH;

const mkPath = (vals: number[]) =>
  AGES.map((a, i) => `${i === 0 ? 'M' : 'L'}${xs(a).toFixed(1)} ${ys(vals[i]).toFixed(1)}`).join(' ');

function Tabs({ sel, onChange }: { sel: Method; onChange: (m: Method) => void }) {
  const items: { id: Method; label: string; sub: string }[] = [
    { id: 'lumpsum', label: '일시금', sub: MINFO.lumpsum.sub },
    { id: 'ten', label: '10년 수령', sub: MINFO.ten.sub },
    { id: 'twenty', label: '20년 수령', sub: MINFO.twenty.sub },
  ];

  return (
    <div>
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: '#F3F4F6' }}>
        {items.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex-1 rounded-xl py-2.5 transition-all"
            style={{
              background: sel === id ? 'white' : 'transparent',
              color: sel === id ? '#0D2B6B' : '#6B7280',
              fontSize: 13,
              fontWeight: sel === id ? 700 : 400,
              boxShadow: sel === id ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6, textAlign: 'center' }}>
        {MINFO[sel].sub}
      </p>
    </div>
  );
}

function Chart({ pension, shortageAge }: { pension: number[]; shortageAge: number }) {
  const [tipIdx, setTipIdx] = useState<number | null>(null);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const approx = AMIN + ((mx - PL) / CW) * (AMAX - AMIN);
    let best = 0;
    let bestD = Infinity;
    AGES.forEach((a, i) => {
      const d = Math.abs(a - approx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setTipIdx(best);
  }

  const pensionPath = mkPath(pension);
  const expensePath = mkPath(EXPENSE);
  const gapFwd = AGES.map((a, i) => `${i === 0 ? 'M' : 'L'}${xs(a).toFixed(1)} ${ys(pension[i]).toFixed(1)}`);
  const gapBwd = [...AGES].reverse().map((a, ri) => `L${xs(a).toFixed(1)} ${ys(EXPENSE[AGES.length - 1 - ri]).toFixed(1)}`);
  const gapPath = [...gapFwd, ...gapBwd, 'Z'].join(' ');

  const sx = xs(shortageAge);
  const yTicks = [0, 60, 120, 180, 240, 300];
  const xTicks = [57, 65, 70, 78, 85];
  const tx = tipIdx !== null ? xs(AGES[tipIdx]) : null;
  const tP = tipIdx !== null ? pension[tipIdx] : null;
  const tE = tipIdx !== null ? EXPENSE[tipIdx] : null;
  const tA = tipIdx !== null ? AGES[tipIdx] : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={onMove}
        onMouseLeave={() => setTipIdx(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={ys(v)} y2={ys(v)} stroke="#F3F4F6" strokeWidth={1} />
            <text x={PL - 4} y={ys(v) + 4} textAnchor="end" fontSize={10} fill="#C4C9D4">{v}</text>
          </g>
        ))}

        <rect x={sx} y={PT} width={Math.max(0, xs(AMAX) - sx)} height={CH} fill="rgba(245,158,11,0.07)" />
        <path d={gapPath} fill="rgba(245,158,11,0.05)" />
        <line x1={sx} x2={sx} y1={PT} y2={PT + CH} stroke="#D97706" strokeWidth={1.5} strokeDasharray="4 3" />

        <path d={expensePath} stroke="#F59E0B" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pensionPath} stroke="#2A7BD6" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        <rect x={sx + 3} y={PT - 2} width={46} height={15} rx={4} fill="rgba(215,119,6,0.12)" />
        <text x={sx + 6} y={PT + 9} fontSize={9} fill="#D97706" fontWeight="600">
          {shortageAge}세 부족↑
        </text>

        {tx !== null && (
          <>
            <line x1={tx} x2={tx} y1={PT} y2={PT + CH} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 2" />
            <circle cx={tx} cy={ys(tP!)} r={5} fill="#2A7BD6" stroke="white" strokeWidth={2} />
            <circle cx={tx} cy={ys(tE!)} r={5} fill="#F59E0B" stroke="white" strokeWidth={2} />
          </>
        )}

        {xTicks.map((a) => (
          <text key={a} x={xs(a)} y={H - 6} textAnchor="middle" fontSize={10} fill="#C4C9D4">{a}세</text>
        ))}
      </svg>

      {tx !== null && tA !== null && (
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: tx > W * 0.55 ? 'auto' : `${(tx / W) * 100 + 2}%`,
            right: tx > W * 0.55 ? `${((W - tx) / W) * 100 + 2}%` : 'auto',
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            padding: '8px 12px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
            pointerEvents: 'none',
            minWidth: 118,
            zIndex: 10,
          }}
        >
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 5, fontWeight: 600 }}>{tA}세</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2A7BD6', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: '#1F2937' }}>연금 <b>{tP}만원</b></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: '#1F2937' }}>지출 <b>{tE}만원</b></span>
          </div>
          <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 5 }}>
            <span style={{ fontSize: 12, color: '#D97706', fontWeight: 700 }}>월 {tE! - tP!}만원 부족</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Dashboard({ onNext }: Props) {
  const [method, setMethod] = useState<Method>('ten');
  const info = MINFO[method];
  const pension = PENSION[method];

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div
        className="px-6 pt-12 pb-6"
        style={{ background: 'linear-gradient(160deg, #0D2B6B 0%, #1a4499 100%)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span
            className="rounded-full px-3 py-1"
            style={{ background: 'rgba(55,194,123,0.2)', color: '#37C27B', fontSize: 13, fontWeight: 600 }}
          >
            분석 완료
          </span>
        </div>
        <h2 style={{ fontSize: 21, fontWeight: 700, color: '#FFF', lineHeight: '150%', marginBottom: 4 }}>
          현재 계획대로라면<br />
          <span style={{ color: '#37C27B' }}>{info.shortageAge}세까지 안정적으로</span> 생활할 수 있어요.
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>
          수령방식을 바꾸면 안정 기간이 달라져요.
        </p>
      </div>

      <div className="px-6 pt-5 pb-4 space-y-4">
        <div className="p-5 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1.5 L14 4.5 L14 7.5 C14 11 11 13.5 8 14.5 C5 13.5 2 11 2 7.5 L2 4.5 Z"
                  stroke="#0D2B6B"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
                <path d="M5.5 8 L7.5 10 L10.5 6" stroke="#37C27B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>현재 자산 현황</p>
            </div>
            <span
              className="rounded-full px-2.5 py-0.5"
              style={{ background: '#EBF2FC', color: '#0D2B6B', fontSize: 11, fontWeight: 600 }}
            >
              마이데이터 연동
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-3 mb-4">
            <span style={{ fontSize: 30, fontWeight: 800, color: '#0D2B6B', letterSpacing: '-1.5px', lineHeight: 1 }}>2억 3,400</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#4B6FAD' }}>만원</span>
            <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 2 }}>총 금융자산</span>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 12, fontWeight: 700, color: '#37C27B' }}>현금성 자산 · 즉시 사용 가능</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>7,000만원</span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: 'CMA·보통예금', amt: 4800, pct: 69, color: '#37C27B' },
                { label: '공모펀드', amt: 2200, pct: 31, color: '#A5B4FC' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#374151' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{item.amt.toLocaleString()}만원</span>
                  </div>
                  <div style={{ height: 4, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>비유동·투자자산 · 처분 시간 필요</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>1억 6,400만원</span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: '주식·ETF', amt: 7200, pct: 44, color: '#2A7BD6' },
                { label: '정기예금', amt: 5800, pct: 35, color: '#D1D5DB' },
                { label: '적금', amt: 3400, pct: 21, color: '#E5E7EB' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#6B7280' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{item.amt.toLocaleString()}만원</span>
                  </div>
                  <div style={{ height: 4, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="7" cy="7" r="6" stroke="#6B7280" strokeWidth="1.2" />
              <path d="M7 4.5 L7 7" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="7" cy="9.5" r="0.8" fill="#6B7280" />
            </svg>
            <p style={{ fontSize: 12, color: '#6B7280', lineHeight: '150%' }}>
              현금성 자산(7,000만원)으로 월 부족분을 충당하면<br />
              <b style={{ color: '#D97706' }}>약 5년(62세 전후)</b>에 소진될 것으로 예상돼요.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'white',
          borderTop: '1px solid #E5E7EB',
          borderBottom: '1px solid #E5E7EB',
          padding: '12px 24px',
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 8 }}>
          퇴직급여 수령방식을 선택하면 아래 분석이 바뀌어요
        </p>
        <Tabs sel={method} onChange={setMethod} />
      </div>

      <div className="px-6 py-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>예상 월 연금 (65세~)</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#2A7BD6', letterSpacing: '-0.5px' }}>
              {info.peakPension}만원
            </p>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{info.sub}</p>
          </div>
          <div className="p-4 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>최초 부족 예상 시점</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#D97706', letterSpacing: '-0.5px' }}>
              {info.shortageAge}세
            </p>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>현재 계획 기준</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl" style={{ border: '1px solid #E5E7EB' }}>
          <div className="flex items-center justify-between mb-1">
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>연금 수령액 vs 월 지출</p>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>만원/월</span>
          </div>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
            주황 음영 구간이 자산 부족이 시작되는 시점이에요.
          </p>

          <Chart pension={pension} shortageAge={info.shortageAge} />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 px-1">
            {[
              { color: '#2A7BD6', label: '월 연금 수령액' },
              { color: '#F59E0B', label: '생활비 + 의료비' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div style={{ width: 16, height: 3, background: l.color, borderRadius: 2 }} />
                <span style={{ fontSize: 11, color: '#6B7280' }}>{l.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div style={{ width: 12, height: 3, background: 'rgba(245,158,11,0.4)', borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: '#D97706' }}>부족 구간</span>
            </div>
          </div>

          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-xl" style={{ background: '#FFFBEB' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="7" cy="7" r="6" stroke="#F59E0B" strokeWidth="1.3" />
              <path d="M7 4.5 L7 7.5" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="7" cy="9.5" r="0.8" fill="#F59E0B" />
            </svg>
            <p style={{ fontSize: 12, color: '#92400E', lineHeight: '150%' }}>{info.insight}</p>
          </div>
        </div>

        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', marginBottom: 10 }}>분석에 영향을 준 주요 요인</p>
          <div className="space-y-2">
            {[
              { icon: '①', text: '60~65세 연금 공백기 동안 자산 소진이 가장 빠르게 일어나요.' },
              { icon: '②', text: '의료비가 70세 이후 연평균 5%씩 늘어날 것으로 추정돼요.' },
              { icon: '③', text: '국민연금(87만원)만으로는 월 지출의 36%만 충당할 수 있어요.' },
            ].map((f) => (
              <div key={f.icon} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#2A7BD6', flexShrink: 0 }}>{f.icon}</span>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: '150%' }}>{f.text}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-xl text-white"
          style={{ background: '#0D2B6B', height: 54, fontSize: 17, fontWeight: 700 }}
        >
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

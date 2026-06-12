import type { StatusCheckResponse } from '../services/pensionAiAgent';

interface Props {
  onNext: () => void;
  status?: StatusCheckResponse | null;
}

function formatManwon(value: number) {
  const manwon = Math.round(value / 10_000);
  if (manwon >= 10_000) {
    const eok = Math.floor(manwon / 10_000);
    const rest = manwon % 10_000;
    return rest > 0 ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`;
  }
  return `${manwon.toLocaleString('ko-KR')}만원`;
}

function formatMonthly(value: number) {
  return `월 ${formatManwon(value)}`;
}

const fallbackStatus: StatusCheckResponse = {
  customer_id: 'fallback',
  expected_monthly_pension: 870_000,
  expected_monthly_pension_start_age: 65,
  financial_asset_total: 234_000_000,
  loan_balance_total: 0,
  current_monthly_living_expense: 2_300_000,
  currency: 'KRW',
};

function buildData(status: StatusCheckResponse) {
  return [
  {
    label: '국민연금 예상 수령액',
    value: formatMonthly(status.expected_monthly_pension),
    note: `${status.expected_monthly_pension_start_age}세 수령 기준`,
    color: '#2A7BD6',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="#2A7BD6" strokeWidth="1.5"/>
        <path d="M6 10 L14 10 M6 13 L10 13" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: '금융 자산 총액',
    value: formatManwon(status.financial_asset_total),
    note: '예금·적금·펀드 합산',
    color: '#0D2B6B',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2 L18 6 L18 10 C18 14 14 17 10 18 C6 17 2 14 2 10 L2 6 Z" stroke="#0D2B6B" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: '예상 월 생활비',
    value: formatMonthly(status.current_monthly_living_expense),
    note: '현재 지출 기준 추정',
    color: '#6B7280',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 7 L17 7 M5 7 L5 16 L15 16 L15 7" stroke="#6B7280" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 7 L8 4 L12 4 L12 7" stroke="#6B7280" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  ];
}

export function Snapshot({ onNext, status }: Props) {
  const snapshot = status ?? fallbackStatus;
  const data = buildData(snapshot);
  const gap = Math.max(0, snapshot.current_monthly_living_expense - snapshot.expected_monthly_pension);

  return (
    <div className="h-full flex flex-col bg-white overflow-y-auto">
      {/* Top status header */}
      <div className="flex-none px-6 pt-14 pb-6">
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i <= 2 ? '#2A7BD6' : '#E5E7EB' }}
            />
          ))}
        </div>

        {/* Success state */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{ background: '#ECFDF5' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 9 L7.5 12.5 L14 5.5" stroke="#37C27B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span
            className="rounded-full px-3 py-1"
            style={{ background: '#ECFDF5', color: '#059669', fontSize: '13px', fontWeight: 600 }}
          >
            연결 완료
          </span>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', lineHeight: '140%' }}>
          현재 상황을<br />파악했어요.
        </h2>
        <p style={{ fontSize: '15px', color: '#6B7280', marginTop: '6px', lineHeight: '150%' }}>
          아래 내용을 확인하고 분석을 시작해요.
        </p>
      </div>

      {/* Data cards */}
      <div className="flex-1 px-6 space-y-3">
        {data.map((item) => (
          <div
            key={item.label}
            className="p-5 rounded-2xl"
            style={{ border: '1px solid #E5E7EB' }}
          >
            <div className="flex items-center gap-2 mb-3">
              {item.icon}
              <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: 500 }}>{item.label}</span>
            </div>
            <p style={{ fontSize: '26px', fontWeight: 700, color: item.color, letterSpacing: '-0.5px' }}>
              {item.value}
            </p>
            <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '4px' }}>{item.note}</p>
          </div>
        ))}

        {/* Gap preview */}
        <div
          className="p-5 rounded-2xl"
          style={{ background: '#EBF2FC' }}
        >
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginTop: '2px', flexShrink: 0 }}>
              <circle cx="10" cy="10" r="8" stroke="#2A7BD6" strokeWidth="1.5"/>
              <path d="M10 6 L10 10" stroke="#2A7BD6" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="10" cy="13.5" r="1" fill="#2A7BD6"/>
            </svg>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#0D2B6B' }}>
                월 {formatManwon(gap)} 차이가 있어요.
              </p>
              <p style={{ fontSize: '13px', color: '#4B7CBD', marginTop: '4px', lineHeight: '150%' }}>
                연금 수령액({formatManwon(snapshot.expected_monthly_pension)})과 생활비({formatManwon(snapshot.current_monthly_living_expense)}) 사이 차이예요. 추가 분석을 통해 준비 방법을 알아볼게요.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex-none px-6 pb-8 pt-6">
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center rounded-xl text-white"
          style={{ background: '#2A7BD6', height: '54px', fontSize: '17px', fontWeight: 700 }}
        >
          분석 정확도 높이기
        </button>
        <p className="text-center mt-3" style={{ fontSize: '13px', color: '#9CA3AF' }}>
          2~3가지 질문에 답하면 더 정확해져요.
        </p>
      </div>
    </div>
  );
}

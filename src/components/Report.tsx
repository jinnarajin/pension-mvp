interface Props {
  onNext: () => void;
  onBack: () => void;
}

export function Report({ onNext, onBack }: Props) {
  return (
    <div className="h-full flex flex-col bg-white overflow-y-auto">
      {/* Header */}
      <div className="flex-none flex items-center gap-3 px-6 pt-14 pb-4">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: '#F3F4F6' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11 5 L7 9 L11 13" stroke="#1F2937" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1F2937' }}>분석 결과</h2>
      </div>

      <div className="flex-1 px-6 pb-8 space-y-5">
        {/* Summary banner */}
        <div
          className="p-5 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, #0D2B6B, #2A7BD6)' }}
        >
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', marginBottom: '6px' }}>종합 진단</p>
          <p style={{ fontSize: '18px', fontWeight: 700, color: 'white', lineHeight: '150%' }}>
            현재 계획대로라면<br />78세에 생활비 부족이 시작될 수 있어요.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <div
              className="rounded-full px-3 py-1"
              style={{ background: 'rgba(245,158,11,0.25)' }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#FCD34D' }}>
                부족 예상 시점: 78세
              </span>
            </div>
            <div
              className="rounded-full px-3 py-1"
              style={{ background: 'rgba(55,194,123,0.25)' }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6EE7B7' }}>
                안정 기간: 18년
              </span>
            </div>
          </div>
        </div>

        {/* Cash flow breakdown */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
          <div className="px-5 py-4" style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937' }}>은퇴 이후 월평균 현금흐름 분석</p>
            <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>65세 기준</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {[
              { label: '국민연금', amount: 870000, direction: 'in', note: '65세 수령 시작' },
              { label: '퇴직연금', amount: 340000, direction: 'in', note: '월 지급 기준' },
              { label: '월 생활비', amount: -2300000, direction: 'out', note: '현재 지출 기준' },
              { label: '의료·건강 지출', amount: -250000, direction: 'out', note: '평균 추정치' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <div>
                  <p style={{ fontSize: '15px', color: '#1F2937', fontWeight: 500 }}>{row.label}</p>
                  <p style={{ fontSize: '12px', color: '#9CA3AF' }}>{row.note}</p>
                </div>
                <p
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: row.direction === 'in' ? '#2A7BD6' : '#374151',
                  }}
                >
                  {row.direction === 'in' ? '+' : '-'}
                  {Math.abs(row.amount).toLocaleString()}원
                </p>
              </div>
            ))}
            <div
              className="pt-4 flex items-center justify-between"
              style={{ borderTop: '1.5px solid #E5E7EB' }}
            >
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937' }}>월평균 순 현금흐름</p>
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#D97706' }}>-1,160,000원</p>
            </div>
            <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '8px', lineHeight: '150%' }}>
              * 투자 수익이나 기타 소득은 반영하지 않았기 때문에 실제와 차이가 있을 수 있어요.
            </p>
          </div>
        </div>

        {/* Shortage causes */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
          <div className="px-5 py-4" style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937' }}>부족 원인 분석</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {[
              { cause: '소득 공백 기간 (60~65세)', impact: '높음', desc: '국민연금 수령 전 5년간 소득이 없어 자산이 빠르게 소진돼요.' },
              { cause: '생활비 수준', impact: '높음', desc: '현재 생활비(230만원)가 연금 수령액보다 143만원 많아요.' },
              { cause: '기대 수명 증가', impact: '보통', desc: '평균 수명 85세 기준으로 계산 시 노후 기간이 25년이에요.' },
            ].map((item, i) => (
              <div key={item.cause}>
                {i > 0 && <div style={{ height: '1px', background: '#F3F4F6', marginBottom: '16px' }}/>}
                <div className="flex items-start justify-between gap-3">
                  <p style={{ fontSize: '15px', fontWeight: 600, color: '#1F2937', flex: 1 }}>{item.cause}</p>
                  <span
                    className="rounded-full px-2 py-0.5 flex-none"
                    style={{
                      background: item.impact === '높음' ? '#FEF3C7' : '#EBF2FC',
                      color: item.impact === '높음' ? '#92400E' : '#1E40AF',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    영향 {item.impact}
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '5px', lineHeight: '150%' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* AI explanation */}
        <div
          className="p-5 rounded-2xl"
          style={{ background: '#EBF2FC' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7" stroke="#2A7BD6" strokeWidth="1.5"/>
              <path d="M9 5 C7 5 6 6.5 7 8 C7.5 8.7 9 9 9 10.5" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="9" cy="13" r="1" fill="#2A7BD6"/>
            </svg>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#0D2B6B' }}>쉬운 설명</p>
          </div>
          <p style={{ fontSize: '15px', color: '#1E3A5F', lineHeight: '160%' }}>
            쉽게 말씀드리면, 지금 매달 230만원을 쓰시는데 나중에 연금으로는 87만원 정도만 들어와요.
            나머지는 모아두신 자산으로 채워야 하는데, 78세쯤에는 그 자산도 다 쓰게 되는 거예요.
            지금부터 매달 조금씩 더 준비해 두시면 안심할 수 있는 기간을 늘릴 수 있어요.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 rounded-xl text-white"
          style={{ background: '#2A7BD6', height: '54px', fontSize: '17px', fontWeight: 700 }}
        >
          상세 분석 보기
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4 L10 8 L6 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div className="h-2"/>
      </div>
    </div>
  );
}

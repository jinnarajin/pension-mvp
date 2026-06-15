interface Props {
  onNext: () => void;
}

export function Onboarding({ onNext }: Props) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Navy hero section */}
      <div
        className="flex-none flex flex-col items-center justify-end pb-10 pt-16 px-8"
        style={{ background: 'linear-gradient(160deg, #0D2B6B 0%, #1a4499 100%)', minHeight: '52%' }}
      >
        <div className="mb-5 flex items-center justify-center rounded-2xl bg-white/15" style={{ width: 82, height: 82 }}>
          <img
            src="/mono-logo.svg"
            alt=""
            aria-hidden="true"
            style={{ width: '64px', height: '64px', objectFit: 'contain', display: 'block', transform: 'translate(-1px, -1px)' }}
          />
        </div>
        <h1
          className="text-white text-center mb-2"
          style={{ fontSize: '28px', fontWeight: 700, lineHeight: '140%', letterSpacing: '-0.3px' }}
        >
          든든내일
        </h1>
        <p className="text-white/70 text-center" style={{ fontSize: '15px', lineHeight: '150%' }}>
          노후 현금흐름 분석 서비스
        </p>
      </div>

      {/* White bottom section */}
      <div className="flex-1 flex flex-col px-6 pt-8 pb-8 overflow-y-auto bg-white">
        <p className="text-center mb-8" style={{ color: '#1F2937', fontSize: '20px', fontWeight: 700, lineHeight: '140%' }}>
          지금 준비 상황을<br />함께 살펴볼게요.
        </p>

        {/* Feature list */}
        <div className="space-y-4 mb-8">
          {[
            {
              icon: (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="3" width="16" height="16" rx="3" stroke="#2A7BD6" strokeWidth="1.5"/>
                  <path d="M7 11 L10 14 L15 8" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              title: '연금·자산 자동 연결',
              desc: '마이데이터로 내 자산을 한번에 확인해요.',
            },
            {
              icon: (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M3 16 L8 10 L12 13 L17 6" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="17" cy="6" r="2" fill="#37C27B"/>
                </svg>
              ),
              title: '노후 현금흐름 예측',
              desc: '월 수입과 지출을 연령별로 시뮬레이션해요.',
            },
            {
              icon: (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="8" stroke="#2A7BD6" strokeWidth="1.5"/>
                  <path d="M11 7 L11 11 L14 13" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
              title: '실행 가능한 준비 방법',
              desc: '부족한 부분은 구체적인 방법으로 안내해요.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-4 p-4 rounded-2xl"
              style={{ background: '#F0F5FF' }}
            >
              <div className="flex-none mt-0.5">{item.icon}</div>
              <div>
                <p style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', lineHeight: '140%' }}>{item.title}</p>
                <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '150%', marginTop: '2px' }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto space-y-3">
          <button
            onClick={onNext}
            className="w-full flex items-center justify-center rounded-xl text-white transition-opacity active:opacity-80"
            style={{
              background: '#0D2B6B',
              height: '54px',
              fontSize: '17px',
              fontWeight: 700,
            }}
          >
            무료로 시작하기
          </button>
          <button
            className="w-full flex items-center justify-center rounded-xl transition-opacity active:opacity-70"
            style={{ height: '48px', fontSize: '15px', color: '#6B7280', fontWeight: 500 }}
          >
            이미 계정이 있어요 · 로그인
          </button>
        </div>
      </div>
    </div>
  );
}

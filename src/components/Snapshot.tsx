import { useState, type ChangeEvent } from 'react';

interface SnapshotValues {
  livingCostManwon: number;
  retireAge: number;
}

interface Props {
  onNext: (values: SnapshotValues) => void;
}

const MIN_AGE = 50;
const MAX_AGE = 80;

export function Snapshot({ onNext }: Props) {
  const [livingCost, setLivingCost] = useState('');
  const [retireAge, setRetireAge] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [isAgeOpen, setIsAgeOpen] = useState(false);

  const parsed = parseInt(livingCost, 10);
  const isValidCost = !isNaN(parsed) && parsed > 0;
  const canContinue = isValidCost && retireAge !== null;

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    setLivingCost(e.target.value.replace(/[^0-9]/g, ''));
  };

  const handleNext = () => {
    if (!canContinue || retireAge === null) return;
    onNext({ livingCostManwon: parsed, retireAge });
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-none px-6 pt-14 pb-6">
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= 2 ? '#2A7BD6' : '#E5E7EB' }} />
          ))}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-full" style={{ background: '#ECFDF5' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8 L6.5 11.5 L13 4.5" stroke="#37C27B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="rounded-full px-3 py-1" style={{ background: '#ECFDF5', color: '#059669', fontSize: '13px', fontWeight: 600 }}>
            연결 완료
          </span>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', lineHeight: '140%' }}>
          목표를 알려주세요.
        </h2>
        <p style={{ fontSize: '15px', color: '#6B7280', marginTop: '6px', lineHeight: '150%' }}>
          연금·자산 데이터는 연결됐어요.<br />이제 계획을 입력해 주세요.
        </p>
      </div>

      {/* Inputs */}
      <div className="flex-1 px-6 space-y-5 overflow-y-auto pb-6">

        {/* 은퇴 후 월 생활비 */}
        <div>
          <label style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '10px', display: 'block' }}>
            은퇴 후 예상 월 생활비
            <span style={{ color: '#EF4444', marginLeft: '3px' }}>*</span>
          </label>
          <div
            className="flex items-center gap-3 px-5 rounded-2xl transition-all"
            style={{
              height: '64px',
              border: `1.5px solid ${focused || isValidCost ? '#2A7BD6' : '#E5E7EB'}`,
              background: isValidCost ? '#EBF2FC' : '#FAFAFA',
              boxShadow: focused ? '0 0 0 3px rgba(42,123,214,0.10)' : 'none',
            }}
          >
            <input
              type="tel"
              inputMode="numeric"
              value={livingCost}
              onChange={handleInput}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="예: 230"
              className="flex-1 bg-transparent outline-none"
              style={{
                fontSize: '24px',
                fontWeight: isValidCost ? 700 : 400,
                color: isValidCost ? '#0D2B6B' : '#9CA3AF',
                width: '100%',
              }}
            />
            <span style={{ fontSize: '16px', fontWeight: 600, color: isValidCost ? '#4B7CBD' : '#D1D5DB', flexShrink: 0 }}>
              만원 / 월
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '8px', paddingLeft: '4px' }}>
            현재 지출이 기준이에요. 대략적으로 입력해도 괜찮아요.
          </p>
        </div>

        {/* 예상 은퇴 시점 */}
        <div>
          <label style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '10px', display: 'block' }}>
            예상 은퇴 시점
            <span style={{ color: '#EF4444', marginLeft: '3px' }}>*</span>
          </label>

          {/* 드롭다운 트리거 */}
          <button
            onClick={() => setIsAgeOpen((open) => !open)}
            className="w-full flex items-center justify-between px-5 rounded-2xl transition-all"
            style={{
              height: '64px',
              border: `1.5px solid ${retireAge || isAgeOpen ? '#2A7BD6' : '#E5E7EB'}`,
              background: retireAge ? '#EBF2FC' : '#FAFAFA',
              boxShadow: isAgeOpen ? '0 0 0 3px rgba(42,123,214,0.10)' : 'none',
            }}
            id="retire-trigger"
            aria-haspopup="listbox"
            aria-expanded={isAgeOpen}
          >
            <span style={{
              fontSize: '20px',
              fontWeight: retireAge ? 700 : 400,
              color: retireAge ? '#0D2B6B' : '#9CA3AF',
            }}>
              {retireAge ? `${retireAge}세 은퇴 예정` : '나이를 선택해 주세요'}
            </span>
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              style={{ flexShrink: 0, transform: isAgeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
            >
              <path d="M5 7 L9 11 L13 7" stroke={retireAge ? '#2A7BD6' : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* 스크롤 가능한 드롭다운 목록 */}
          {isAgeOpen && (
            <div
              className="mt-2 rounded-2xl overflow-y-auto"
              role="listbox"
              aria-labelledby="retire-trigger"
              style={{
                maxHeight: '220px',
                border: '1.5px solid #BFDBFE',
                background: 'white',
                boxShadow: '0 8px 24px rgba(42,123,214,0.12)',
              }}
            >
              {Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => MIN_AGE + i).map((age, i) => (
                <button
                  key={age}
                  onClick={() => {
                    setRetireAge(age);
                    setIsAgeOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-5 transition-colors"
                  role="option"
                  aria-selected={retireAge === age}
                  style={{
                    height: '48px',
                    background: retireAge === age ? '#EBF2FC' : 'white',
                    borderTop: i > 0 ? '1px solid #F3F4F6' : 'none',
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    fontSize: '16px',
                    color: retireAge === age ? '#0D2B6B' : '#374151',
                    fontWeight: retireAge === age ? 700 : 400,
                  }}>
                    {age}세
                  </span>
                  {retireAge === age && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8 L6.5 11.5 L13 4.5" stroke="#2A7BD6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
          <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '8px', paddingLeft: '2px' }}>
            50~80세, 1살 단위로 선택할 수 있어요.
          </p>
        </div>

      </div>

      {/* CTA */}
      <div className="flex-none px-6 pb-8 pt-4">
        <button
          onClick={handleNext}
          disabled={!canContinue}
          className="w-full flex items-center justify-center rounded-xl transition-all"
          style={{
            background: canContinue ? '#2A7BD6' : '#E5E7EB',
            color: canContinue ? '#FFFFFF' : '#9CA3AF',
            height: '56px',
            fontSize: '17px',
            fontWeight: 700,
          }}
        >
          {canContinue ? '분석 정확도 높이기' : '위 항목을 모두 입력해 주세요'}
        </button>
        {canContinue && (
          <p className="text-center mt-3" style={{ fontSize: '13px', color: '#9CA3AF' }}>
            2~3가지 질문에 답하면 더 정확해져요.
          </p>
        )}
      </div>
    </div>
  );
}

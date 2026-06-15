import { useState } from 'react';
import { StepProgress } from './StepProgress';

interface Props {
  onNext: () => void;
}

const items = [
  {
    id: 'pension',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="#2A7BD6" strokeWidth="1.5"/>
        <path d="M6 8 L14 8 M6 12 L11 12" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    label: '국민연금 정보',
    desc: '예상 수령액, 납입 기간',
  },
  {
    id: 'asset',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2 L18 6 L18 10 C18 14 14 17 10 18 C6 17 2 14 2 10 L2 6 Z" stroke="#2A7BD6" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7 10 L9 12 L13 8" stroke="#37C27B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    label: '금융 자산 현황',
    desc: '예금, 적금, 펀드, 주식 잔액',
  },
  {
    id: 'income',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="#2A7BD6" strokeWidth="1.5"/>
        <path d="M10 6 L10 14 M7 9 L10 6 L13 9" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    label: '소득 정보',
    desc: '현재 월 소득 및 근로 유형',
  },
  {
    id: 'spend',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 6 L17 6 L17 16 L3 16 Z" stroke="#2A7BD6" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7 6 L7 4 L13 4 L13 6" stroke="#2A7BD6" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M6 11 L10 11 M6 13.5 L8.5 13.5" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    label: '지출 패턴',
    desc: '카드 소비 및 고정 지출 내역',
  },
];

export function DataConsent({ onNext }: Props) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-white">
      {/* Header */}
      <div className="flex-none px-6 pt-14 pb-6">
        <StepProgress progress={1 / 3} />
        <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>1단계 · 데이터 연동</p>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', lineHeight: '140%' }}>
          데이터 연동에<br />동의해 주세요.
        </h2>
        <p style={{ fontSize: '15px', color: '#6B7280', marginTop: '8px', lineHeight: '150%' }}>
          분석에 필요한 정보만 가져오며,<br />수집 후 즉시 분석에만 활용해요.
        </p>
      </div>

      {/* Data items */}
      <div className="flex-1 px-6 space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-4 p-4 rounded-2xl"
            style={{ border: '1px solid #E5E7EB' }}
          >
            <div
              className="flex-none flex items-center justify-center w-10 h-10 rounded-xl"
              style={{ background: '#EBF2FC' }}
            >
              {item.icon}
            </div>
            <div className="flex-1">
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>{item.label}</p>
              <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>{item.desc}</p>
            </div>
            <div
              className="flex-none w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: '#37C27B' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        ))}

        {/* Agreement */}
        <button
          onClick={() => setAgreed(!agreed)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl transition-colors"
          style={{ background: agreed ? '#F0FDF4' : '#F9FAFB', border: `1.5px solid ${agreed ? '#37C27B' : '#E5E7EB'}` }}
        >
          <div
            className="flex-none w-5 h-5 rounded flex items-center justify-center"
            style={{ background: agreed ? '#37C27B' : '#E5E7EB' }}
          >
            {agreed && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <p style={{ fontSize: '15px', color: '#1F2937', fontWeight: agreed ? 600 : 400, textAlign: 'left' }}>
            개인정보 수집·이용 및 마이데이터 연동에 동의합니다.
          </p>
        </button>
      </div>

      {/* CTA */}
      <div className="flex-none px-6 pb-8 pt-6 space-y-3">
        <button
          onClick={onNext}
          disabled={!agreed}
          className="w-full flex items-center justify-center rounded-xl text-white transition-all"
          style={{
            background: agreed ? '#0D2B6B' : '#E5E7EB',
            color: agreed ? '#FFFFFF' : '#9CA3AF',
            height: '54px',
            fontSize: '17px',
            fontWeight: 700,
          }}
        >
          동의하고 연결하기
        </button>
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center"
          style={{ height: '44px', fontSize: '14px', color: '#6B7280' }}
        >
          직접 입력하기
        </button>
      </div>
    </div>
  );
}

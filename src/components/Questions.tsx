import { useState } from 'react';

interface Props {
  onNext: () => void;
}

const questions = [
  {
    step: 1,
    text: '은퇴 후 생활하고 싶으신 지역은 어디인가요?',
    options: ['수도권', '지방 도시', '귀농·귀촌', '아직 모르겠어요'],
  },
  {
    step: 2,
    text: '자녀에게 금전적 지원을 계획하고 계신가요?',
    options: ['없음', '가끔 (경조사 등)', '정기적 지원', '교육비 지원 중'],
  },
  {
    step: 3,
    text: '건강 관련 큰 지출이 예상되시나요?',
    options: ['없음', '약간 예상됨', '상당히 예상됨', '이미 의료비 지출 중'],
  },
];

export function Questions({ onNext }: Props) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const q = questions[step];

  const handleNext = () => {
    if (!selected) return;
    if (step < questions.length - 1) {
      setStep(step + 1);
      setSelected(null);
    } else {
      onNext();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-none px-6 pt-14 pb-6">
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i <= 3 ? '#2A7BD6' : '#E5E7EB' }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span
            className="rounded-full px-3 py-1"
            style={{ background: '#EBF2FC', color: '#2A7BD6', fontSize: '13px', fontWeight: 600 }}
          >
            질문 {step + 1} / {questions.length}
          </span>
        </div>
        <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>
          3단계 · 맞춤 질문
        </p>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1F2937', lineHeight: '140%' }}>
          {q.text}
        </h2>
        <p style={{ fontSize: '14px', color: '#9CA3AF', marginTop: '6px' }}>
          가장 가까운 상황을 선택해 주세요.
        </p>
      </div>

      {/* Options */}
      <div className="flex-1 px-6 space-y-3">
        {q.options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              onClick={() => setSelected(option)}
              className="w-full flex items-center gap-4 p-5 rounded-2xl transition-all text-left"
              style={{
                border: `1.5px solid ${isSelected ? '#2A7BD6' : '#E5E7EB'}`,
                background: isSelected ? '#EBF2FC' : '#FFFFFF',
              }}
            >
              <div
                className="flex-none w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  border: `2px solid ${isSelected ? '#2A7BD6' : '#D1D5DB'}`,
                  background: isSelected ? '#2A7BD6' : 'transparent',
                }}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
              <span style={{ fontSize: '16px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#0D2B6B' : '#1F2937' }}>
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div className="flex-none px-6 pb-8 pt-6">
        <button
          onClick={handleNext}
          disabled={!selected}
          className="w-full flex items-center justify-center rounded-xl text-white transition-all"
          style={{
            background: selected ? '#2A7BD6' : '#E5E7EB',
            color: selected ? '#FFFFFF' : '#9CA3AF',
            height: '54px',
            fontSize: '17px',
            fontWeight: 700,
          }}
        >
          {step < questions.length - 1 ? '다음 질문' : '분석 시작하기'}
        </button>
      </div>
    </div>
  );
}

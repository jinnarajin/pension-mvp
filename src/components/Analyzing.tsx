import { useEffect } from 'react';

interface Props {
  onNext: () => void;
  isComplete?: boolean;
  error?: string | null;
  progress?: number;
  stageLabel?: string;
}

const steps = [
  { label: '답변 기반 질문 우선순위 재선택', threshold: 20 },
  { label: '최종 AI 분석 실행', threshold: 45 },
  { label: '자산 변화 흐름 예측', threshold: 75 },
  { label: '노후 현금흐름 종합 정리', threshold: 100 },
];

export function Analyzing({ onNext, isComplete = true, error, progress = 0, stageLabel = '분석을 준비하고 있어요.' }: Props) {
  const displayProgress = progress;

  useEffect(() => {
    if (!isComplete) return;
    const finishTimer = window.setTimeout(() => {
      onNext();
    }, 700);
    return () => window.clearTimeout(finishTimer);
  }, [isComplete, onNext]);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-white px-6">
      {/* Animated circle */}
      <div className="relative mb-10 flex items-center justify-center">
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="60" cy="60" r="52" fill="none" stroke="#E5E7EB" strokeWidth="6"/>
          <circle
            cx="60" cy="60" r="52" fill="none"
	            stroke="#2A7BD6" strokeWidth="6"
	            strokeLinecap="round"
	            strokeDasharray={`${2 * Math.PI * 52}`}
	            strokeDashoffset={`${2 * Math.PI * 52 * (1 - displayProgress / 100)}`}
	            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
	          />
	        </svg>
	        <div className="absolute flex flex-col items-center">
	          <span style={{ fontSize: '26px', fontWeight: 700, color: '#0D2B6B' }}>{displayProgress}%</span>
	          <span style={{ fontSize: '12px', color: '#6B7280' }}>분석 중</span>
	        </div>
	      </div>

      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1F2937', textAlign: 'center', marginBottom: '6px' }}>
        분석하고 있어요.
      </h2>
      <p style={{ fontSize: '15px', color: '#6B7280', textAlign: 'center', marginBottom: '36px', lineHeight: '150%' }}>
        {error ? (
          <>일부 분석은 불러오지 못했지만<br />계산 가능한 결과를 정리하고 있어요.</>
        ) : (
	          <>{stageLabel}</>
	        )}
	      </p>

      {/* Steps list */}
      <div className="w-full space-y-3">
	        {steps.map((step, i) => {
	          const done = displayProgress >= step.threshold;
	          const prevThreshold = steps[i - 1]?.threshold ?? 0;
	          const active = !done && displayProgress >= prevThreshold;
          return (
            <div
              key={step.label}
              className="flex items-center gap-3 p-4 rounded-2xl transition-all"
              style={{
                background: done ? '#F0FDF4' : active ? '#EBF2FC' : '#F9FAFB',
                border: `1px solid ${done ? '#BBF7D0' : active ? '#BFDBFE' : '#E5E7EB'}`,
              }}
            >
              <div
                className="flex-none w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: done ? '#37C27B' : active ? '#2A7BD6' : '#E5E7EB' }}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : active ? (
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-white/60" />
                )}
              </div>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: done || active ? 600 : 400,
                  color: done ? '#065F46' : active ? '#1E40AF' : '#9CA3AF',
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

interface Props {
  onNext: () => void;
}

const steps = [
  { label: '국민연금 수령 시나리오 계산 중', delay: 0 },
  { label: '자산 변화 흐름 예측 중', delay: 1200 },
  { label: '생활비 패턴 분석 중', delay: 2400 },
  { label: '노후 현금흐름 종합 분석 중', delay: 3600 },
];

export function Analyzing({ onNext }: Props) {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const stepTimers = steps.map((step, i) =>
      window.setTimeout(() => {
        setCompletedSteps((prev) => [...prev, i]);
        setProgress(Math.round(((i + 1) / steps.length) * 100));
      }, step.delay + 600),
    );

    const finishTimer = window.setTimeout(() => {
      onNext();
    }, 5200);

    const progressTimer = window.setInterval(() => {
      setProgress((p) => Math.min(p + 1, 99));
    }, 50);

    return () => {
      stepTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(finishTimer);
      window.clearInterval(progressTimer);
    };
  }, [onNext]);

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
            strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress / 100)}`}
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span style={{ fontSize: '26px', fontWeight: 700, color: '#0D2B6B' }}>{progress}%</span>
          <span style={{ fontSize: '12px', color: '#6B7280' }}>분석 중</span>
        </div>
      </div>

      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1F2937', textAlign: 'center', marginBottom: '6px' }}>
        분석하고 있어요.
      </h2>
      <p style={{ fontSize: '15px', color: '#6B7280', textAlign: 'center', marginBottom: '36px', lineHeight: '150%' }}>
        연금과 자산을 기반으로<br />노후 현금흐름을 계산하고 있어요.
      </p>

      {/* Steps list */}
      <div className="w-full space-y-3">
        {steps.map((step, i) => {
          const done = completedSteps.includes(i);
          const active = !done && i === completedSteps.length;
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

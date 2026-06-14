import { useState } from 'react';
import type { AnalyzeResponse } from '../services/pensionAiAgent';
import { buildActionViewModel } from '../services/pensionViewModels';

interface Props {
  onBack: () => void;
  analysis?: AnalyzeResponse | null;
}

export function Actions({ onBack, analysis = null }: Props) {
  const [saved, setSaved] = useState(false);
  const actions = buildActionViewModel(analysis);

  return (
    <div className="h-full flex flex-col bg-white overflow-y-auto">
      <div className="flex-none flex items-center gap-3 px-6 pt-14 pb-4">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: '#F3F4F6' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11 5 L7 9 L11 13" stroke="#1F2937" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1F2937' }}>추천 행동</h2>
      </div>

      <div className="flex-1 px-6 pb-8 space-y-5">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1F2937', lineHeight: '140%' }}>
            지금 준비할 수 있는<br />방법을 알려드릴게요.
          </h2>
          <p style={{ fontSize: '15px', color: '#6B7280', marginTop: '6px', lineHeight: '150%' }}>
            분석 결과에서 우선순위가 높은<br />실행 항목부터 정리했어요.
          </p>
        </div>

        <div className="space-y-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className="p-5 rounded-2xl"
              style={{ border: '1px solid #E5E7EB' }}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="rounded-full px-2.5 py-0.5"
                      style={{ background: `${action.badgeColor}20`, color: action.badgeColor, fontSize: '12px', fontWeight: 600 }}
                    >
                      {action.badge}
                    </span>
                  </div>
                  <p style={{ fontSize: '16px', fontWeight: 700, color: '#1F2937' }}>{action.title}</p>
                </div>
                <div
                  className="flex-none flex items-center justify-center w-8 h-8 rounded-full"
                  style={{ background: '#F3F4F6', color: '#6B7280', fontSize: '14px', fontWeight: 700 }}
                >
                  {action.priority}
                </div>
              </div>

              <div
                className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
                style={{ background: '#F0FDF4' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 8 L5 5 L7 7 L11 3" stroke="#37C27B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#065F46' }}>효과: {action.effect}</span>
                <span style={{ fontSize: '13px', color: '#6B7280', marginLeft: 'auto' }}>기준: {action.amount}</span>
              </div>

              <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '155%' }}>{action.desc}</p>
            </div>
          ))}
        </div>

        <div
          className="p-5 rounded-2xl"
          style={{ background: '#EBF2FC' }}
        >
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#0D2B6B', marginBottom: '12px' }}>
            준비 전 vs. 준비 후 비교
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '현재 위험도', year: analysis?.tier ?? '주의', color: '#D97706', bg: '#FEF3C7' },
              { label: '권장 흐름', year: analysis?.downstream_action === 'ui_simple_home' ? '간편관리' : '집중관리', color: '#37C27B', bg: '#D1FAE5' },
            ].map((s) => (
              <div
                key={s.label}
                className="p-3 rounded-xl text-center"
                style={{ background: s.bg }}
              >
                <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>{s.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.year}</p>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>분석 기준</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-3" style={{ fontSize: '13px', color: '#4B7CBD' }}>
            선택한 계획은 상담 또는 다음 방문 때 이어서 점검할 수 있어요.
          </p>
        </div>

        <button
          onClick={() => setSaved(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl transition-all"
          style={{
            border: `1.5px solid ${saved ? '#37C27B' : '#E5E7EB'}`,
            background: saved ? '#F0FDF4' : 'white',
            height: '50px',
            fontSize: '15px',
            fontWeight: 600,
            color: saved ? '#065F46' : '#1F2937',
          }}
        >
          {saved ? (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8 L6.5 11.5 L13 4.5" stroke="#37C27B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              계획이 저장됐어요
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#6B7280" strokeWidth="1.3" />
                <path d="M6 2 L6 7 L8 5.5 L10 7 L10 2" stroke="#6B7280" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              이 계획 저장하기
            </>
          )}
        </button>

        <div
          className="p-5 rounded-2xl"
          style={{ background: '#0D2B6B' }}
        >
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)', marginBottom: '4px' }}>
            더 구체적인 도움이 필요하신가요?
          </p>
          <p style={{ fontSize: '17px', fontWeight: 700, color: 'white', marginBottom: '14px', lineHeight: '140%' }}>
            JB 전문가와<br />1:1 상담을 연결해 드릴게요.
          </p>
          <div className="flex items-center gap-2 mb-5">
            {['무료 상담', '비대면 가능', '전문 FP'].map((tag) => (
              <span
                key={tag}
                className="rounded-full px-2.5 py-1"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 500 }}
              >
                {tag}
              </span>
            ))}
          </div>
          <button
            className="w-full flex items-center justify-center rounded-xl transition-opacity active:opacity-80"
            style={{ background: '#37C27B', height: '52px', fontSize: '16px', fontWeight: 700, color: 'white' }}
          >
            전문가 상담 예약하기
          </button>
          <p className="text-center mt-3" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
            평균 대기 시간 2일 이내
          </p>
        </div>

        <div className="h-2" />
      </div>
    </div>
  );
}

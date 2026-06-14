import type { AnalyzeResponse, ResultDashboardResponse } from '../services/pensionAiAgent';
import { buildReportViewModel } from '../services/pensionViewModels';

interface Props {
  onNext: () => void;
  onBack: () => void;
  analysis?: AnalyzeResponse | null;
  dashboard?: ResultDashboardResponse | null;
  error?: string | null;
}

function formatWon(value: number) {
  return `${Math.abs(value).toLocaleString()}원`;
}

export function Report({ onNext, onBack, analysis = null, dashboard = null, error }: Props) {
  const report = buildReportViewModel(analysis, dashboard);

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
          {report.hasProjection ? (
            <>
              <p style={{ fontSize: '18px', fontWeight: 700, color: 'white', lineHeight: '150%' }}>
                현재 계획대로라면<br />{report.shortageAgeLabel}에 생활비 부족이 시작될 수 있어요.
              </p>
              <div className="flex items-center gap-2 mt-4">
                <div className="rounded-full px-3 py-1" style={{ background: 'rgba(245,158,11,0.25)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#FCD34D' }}>
                    부족 예상 시점: {report.shortageAgeLabel}
                  </span>
                </div>
                <div className="rounded-full px-3 py-1" style={{ background: 'rgba(55,194,123,0.25)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#6EE7B7' }}>
                    안정 기간: {report.stableYearsLabel}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p style={{ fontSize: '18px', fontWeight: 700, color: 'white', lineHeight: '150%' }}>
              아직 분석 결과가 없어요.<br />맞춤 질문을 완료하면 계산 결과가 표시됩니다.
            </p>
          )}
        </div>

        {error && (
          <div className="p-4 rounded-2xl" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p style={{ fontSize: '13px', color: '#92400E', lineHeight: '150%' }}>
              일부 AI 설명은 불러오지 못했습니다. 가능한 계산 결과를 기준으로 보여드립니다.
            </p>
          </div>
        )}

        {/* Cash flow breakdown */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
          <div className="px-5 py-4" style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937' }}>은퇴 이후 월평균 현금흐름 분석</p>
            <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{report.pensionStartAgeLabel} 기준</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {report.cashFlowRows.map((row) => (
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
                  {formatWon(row.amount)}
                </p>
              </div>
            ))}
            <div
              className="pt-4 flex items-center justify-between"
              style={{ borderTop: '1.5px solid #E5E7EB' }}
            >
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937' }}>월평균 순 현금흐름</p>
              <p style={{ fontSize: '18px', fontWeight: 700, color: report.netCashFlow < 0 ? '#D97706' : '#2A7BD6' }}>
                {report.netCashFlow >= 0 ? '+' : '-'}{formatWon(report.netCashFlow)}
              </p>
            </div>
            <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '8px', lineHeight: '150%' }}>
              * 투자 수익이나 기타 소득은 반영하지 않았기 때문에 실제와 차이가 있을 수 있어요.
            </p>
          </div>
        </div>

        {/* AI explanation */}
        {report.showEasyExplanation && (
          <div className="p-5 rounded-2xl" style={{ background: '#EBF2FC' }}>
            <div className="flex items-center gap-2 mb-3">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7" stroke="#2A7BD6" strokeWidth="1.5"/>
                <path d="M9 5 C7 5 6 6.5 7 8 C7.5 8.7 9 9 9 10.5" stroke="#2A7BD6" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="9" cy="13" r="1" fill="#2A7BD6"/>
              </svg>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#0D2B6B' }}>쉬운 설명</p>
            </div>
            <p style={{ fontSize: '15px', color: '#1E3A5F', lineHeight: '160%' }}>
              {report.explanation}
            </p>
          </div>
        )}

	        {/* Shortage causes */}
	        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
          <div className="px-5 py-4" style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937' }}>분석에 영향을 준 주요 요인</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {report.causes.map((item, i) => (
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

		        {report.customDashboardCards.length > 0 && (
		          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
		            <div className="px-5 py-4" style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
		              <p style={{ fontSize: '15px', fontWeight: 700, color: '#1F2937' }}>맞춤 확인 항목</p>
		            </div>
		            <div className="px-5 py-4 space-y-3">
		              {report.customDashboardCards.map((card) => (
		                <div key={card.id} className="p-3 rounded-xl" style={{ background: '#F9FAFB' }}>
		                  <div className="flex items-start justify-between gap-3">
		                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#1F2937', flex: 1 }}>{card.title}</p>
		                    <span
		                      className="rounded-full px-2 py-0.5 flex-none"
		                      style={{ background: '#EBF2FC', color: '#1E40AF', fontSize: '11px', fontWeight: 700 }}
		                    >
		                      {card.badge}
		                    </span>
		                  </div>
		                  <p style={{ fontSize: '12px', color: '#6B7280', marginTop: 5, lineHeight: '150%' }}>{card.reason}</p>
		                  <p style={{ fontSize: '13px', color: '#374151', marginTop: 8, lineHeight: '150%' }}>{card.desc}</p>
		                  <div className="mt-3 space-y-1.5">
		                    {card.checks.map((check) => (
		                      <div key={check} className="flex items-start gap-2">
		                        <span style={{ width: 5, height: 5, borderRadius: 5, background: '#2A7BD6', marginTop: 7, flex: '0 0 auto' }} />
		                        <p style={{ fontSize: '12px', color: '#4B5563', lineHeight: '150%' }}>{check}</p>
		                      </div>
		                    ))}
		                  </div>
		                </div>
		              ))}
		            </div>
		          </div>
		        )}

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

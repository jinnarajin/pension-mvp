import { useState } from 'react';
import type { AdaptiveAnswerPayload, CustomQuestion } from '../services/pensionAiAgent';
import { compactQuestionOptions, type UiOption } from '../services/questionOptions';
import { StepProgress } from './StepProgress';

interface Props {
  onNext: (answers: AdaptiveAnswerPayload[]) => void;
  onAnswerChange?: (answers: AdaptiveAnswerPayload[]) => Promise<void>;
  questions?: CustomQuestion[] | null;
  isLoading?: boolean;
  selectionMode?: string | null;
}

const fallbackQuestions = [
  {
    question_id: 'fallback-1',
    text: '은퇴 후 생활하고 싶으신 지역은 어디인가요?',
    options: ['수도권', '지방 도시', '귀농·귀촌', '아직 모르겠어요'],
  },
  {
    question_id: 'fallback-2',
    text: '자녀에게 금전적 지원을 계획하고 계신가요?',
    options: ['없음', '가끔 (경조사 등)', '정기적 지원', '교육비 지원 중'],
  },
  {
    question_id: 'fallback-3',
    text: '건강 관련 큰 지출이 예상되시나요?',
    options: ['없음', '약간 예상됨', '상당히 예상됨', '이미 의료비 지출 중'],
  },
  {
    question_id: 'fallback-4',
    text: '은퇴 후에도 일을 통한 소득을 어느 정도 기대하시나요?',
    options: ['없음', '월 50만원 미만', '월 50~150만원', '월 150만원 이상'],
  },
  {
    question_id: 'fallback-5',
    text: '퇴직급여를 받을 때 가장 중요하게 보는 기준은 무엇인가요?',
    options: ['당장 쓸 수 있는 돈', '매달 안정적 현금흐름', '세금 부담 완화', '아직 모르겠어요'],
  },
];

interface UiQuestion {
  id: string;
  text: string;
  options: UiOption[];
}

function normalizeQuestions(questions?: CustomQuestion[] | null) {
  if (questions?.length) {
    return questions.slice(0, 5).map<UiQuestion>((question) => ({
      id: question.question_id,
      text: question.text_ko,
      options: question.options?.length ? compactQuestionOptions(question.options) : compactQuestionOptions(['예', '아니오', '잘 모르겠어요']),
    }));
  }

  return fallbackQuestions.map<UiQuestion>((question) => ({
    id: question.question_id,
    text: question.text,
    options: compactQuestionOptions(question.options),
  }));
}

const QUESTION_COUNT = 5;

export function Questions({ onNext, onAnswerChange, questions, isLoading = false, selectionMode = null }: Props) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<{ label: string; value: string } | null>(null);
  const [answers, setAnswers] = useState<AdaptiveAnswerPayload[]>([]);
  const [isRefreshingNextQuestion, setIsRefreshingNextQuestion] = useState(false);

  const answeredIds = new Set(answers.map((answer) => answer.question_id));
  const activeQuestions = normalizeQuestions(questions).filter((question) => !answeredIds.has(question.id));
  const q = activeQuestions[0] ?? normalizeQuestions(null)[0];
  const loadingNextQuestion = isLoading || isRefreshingNextQuestion;
  const visibleQuestionCount = loadingNextQuestion ? answers.length : step + 1;
  const questionProgress = Math.min(QUESTION_COUNT, Math.max(0, visibleQuestionCount)) / QUESTION_COUNT;
  const progress = 2 / 3 + questionProgress / 3;

  if (loadingNextQuestion) {
    return (
      <div className="h-full flex flex-col bg-white px-6">
        <div className="flex-none pt-14 pb-6">
          <StepProgress progress={progress} />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-6" style={{ background: '#EBF2FC' }}>
            <div className="w-7 h-7 rounded-full animate-spin" style={{ border: '3px solid #BFDBFE', borderTopColor: '#2A7BD6' }} />
          </div>
          <p style={{ fontSize: 13, color: '#6B7280', fontWeight: 700, marginBottom: 8 }}>맞춤 질문 생성 중</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1F2937', lineHeight: '140%' }}>
            LLM이 방금 답변을 반영해<br />다음 질문을 고르고 있어요.
          </h2>
          <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 10, lineHeight: '150%' }}>
            답변 이력, 마이데이터, 은퇴 후 생활비 입력값을 함께 반영합니다.
          </p>
        </div>
      </div>
    );
  }

  const handleNext = async () => {
    if (!selected) return;
    const nextAnswers = [
      ...answers.filter((answer) => answer.question_id !== q.id),
      { question_id: q.id, answer: selected.value },
    ];
    setAnswers(nextAnswers);

    if (nextAnswers.length >= QUESTION_COUNT) {
      onNext(nextAnswers);
      return;
    }

    setSelected(null);
    setIsRefreshingNextQuestion(true);
    try {
      await onAnswerChange?.(nextAnswers);
      setStep(step + 1);
    } finally {
      setIsRefreshingNextQuestion(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-none px-6 pt-14 pb-6">
        <StepProgress progress={progress} />
        <div className="flex items-center gap-2 mb-4">
	          <span
            className="rounded-full px-3 py-1"
            style={{ background: '#EBF2FC', color: '#2A7BD6', fontSize: '13px', fontWeight: 600 }}
          >
	            질문 {step + 1} / {QUESTION_COUNT}
	          </span>
        </div>
	        <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>
	          3단계 · 맞춤 질문{selectionMode === 'llm_adaptive_question_selector' ? ' · LLM 선택 완료' : ''}
	        </p>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1F2937', lineHeight: '140%' }}>
          {q.text}
        </h2>
        <p style={{ fontSize: '14px', color: '#9CA3AF', marginTop: '6px' }}>
          가장 가까운 상황을 선택해 주세요.
        </p>
      </div>

      {/* Options */}
      <div className="flex-1 px-6 space-y-2 overflow-y-auto pb-2">
        {q.options.map((option) => {
          const isSelected = selected?.value === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setSelected(option)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all text-left"
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
              <span style={{ fontSize: '15px', lineHeight: '145%', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#0D2B6B' : '#1F2937' }}>
                {option.label}
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
            background: selected ? '#0D2B6B' : '#E5E7EB',
            color: selected ? '#FFFFFF' : '#9CA3AF',
            height: '54px',
            fontSize: '17px',
            fontWeight: 700,
          }}
        >
          {step < activeQuestions.length - 1 ? '다음 질문' : '분석 시작하기'}
        </button>
      </div>
    </div>
  );
}

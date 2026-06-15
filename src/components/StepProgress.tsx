interface Props {
  progress: number;
}

const STEP_COUNT = 3;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function StepProgress({ progress }: Props) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: STEP_COUNT }).map((_, index) => {
        const fillRatio = clamp(progress * STEP_COUNT - index);

        return (
          <div
            key={index}
            className="h-1 flex-1 rounded-full overflow-hidden"
            style={{ background: '#E5E7EB' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${fillRatio * 100}%`,
                background: '#2A7BD6',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

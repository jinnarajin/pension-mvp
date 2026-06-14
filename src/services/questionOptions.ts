export interface UiOption {
  label: string;
  value: string;
}

const optionLabels: Record<string, string> = {
  Completely: "매우 그렇다",
  "Very well": "그렇다",
  Somewhat: "보통이다",
  "Very little": "별로 그렇지 않다",
  "Not at all": "전혀 그렇지 않다",
  Always: "항상 그렇다",
  Often: "자주 그렇다",
  Sometimes: "가끔 그렇다",
  Rarely: "거의 그렇지 않다",
  Never: "전혀 없다",
};

function toUiOption(option: string): UiOption {
  return { label: optionLabels[option] ?? option, value: option };
}

function findUnknownOption(options: string[]): string | undefined {
  return options.find((option) => /잘 모르|해당 없음|없음/.test(option));
}

export function compactQuestionOptions(options: string[], maxOptions = 5): UiOption[] {
  if (options.length <= maxOptions) {
    return options.map(toUiOption);
  }

  const unknown = findUnknownOption(options);
  const middleIndex = Math.floor(options.length / 2);
  const preferred = [
    options[0],
    options[1],
    options[middleIndex],
    options[options.length - 2],
    options[options.length - 1],
  ];

  const compacted = Array.from(new Set(preferred)).slice(0, maxOptions);
  if (unknown && !compacted.includes(unknown)) {
    compacted[compacted.length - 1] = unknown;
  }

  return compacted.map(toUiOption);
}

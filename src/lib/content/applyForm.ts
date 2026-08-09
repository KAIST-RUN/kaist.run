import { fetchContentJson } from "./api";

export type ApplyFormQuestionType = "short_answer" | "paragraph" | "radio" | "checkbox" | "dropdown";

export type ApplyFormChoice = {
  value: string;
  sourceLabel: string;
  labelKo: string;
  labelEn: string;
};

export type ApplyFormQuestion = {
  entryId: string;
  position: number;
  type: ApplyFormQuestionType;
  required: boolean;
  // 빈 문자열이면 검증 없음. 아니면 이 값과 안 맞는 입력은 제출이 막힙니다.
  validationPattern: string;
  sourceTitle: string;
  labelKo: string;
  labelEn: string;
  choices: ApplyFormChoice[];
};

export type ApplyFormConfig = {
  formId: string;
  questions: ApplyFormQuestion[];
};

// notices/archive/contact와 달리 로케일별로 나뉘지 않은 단일 엔드포인트입니다
// (worker/src/routes/content.ts 참고) — 문항 구조/entry ID/선택지 값은 로케일과
// 무관하게 같고, 라벨(labelKo/labelEn)만 한 번에 같이 내려옵니다.
export async function fetchApplyFormConfig(): Promise<ApplyFormConfig | null> {
  return fetchContentJson<ApplyFormConfig>("/apply-form");
}

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
  // 제출 완료 화면에 뜨는 안내문(개강총회 안내). backstage에서 편집하고, 빈
  // 문자열이면 messages/{ko,en}.json의 apply.successNote 기본 문구를 씁니다.
  successNoteKo: string;
  successNoteEn: string;
  // Turnstile 사이트 키(공개값). Worker의 vars에서 이 페이로드로 실려 옵니다 —
  // 그래야 GitHub Actions 빌드에 환경변수를 따로 넘기지 않아도 됩니다.
  // 빈 문자열이면 위젯을 그리지 않고, 서버도 검증을 건너뜁니다.
  turnstileSiteKey: string;
};

// notices/archive/contact와 달리 로케일별로 나뉘지 않은 단일 엔드포인트입니다
// (worker/src/routes/content.ts 참고) — 문항 구조/entry ID/선택지 값은 로케일과
// 무관하게 같고, 라벨(labelKo/labelEn)만 한 번에 같이 내려옵니다.
export async function fetchApplyFormConfig(): Promise<ApplyFormConfig | null> {
  return fetchContentJson<ApplyFormConfig>("/apply-form");
}

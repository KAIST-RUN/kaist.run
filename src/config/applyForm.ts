// =============================================================================
// 가입 신청(/apply) 페이지가 참조하는 구글 폼 설정 파일입니다.
// 구글 폼의 링크, 문항, 또는 문항의 entry ID가 바뀌면 이 파일만 수정하면 되고,
// 나머지 코드(src/app/[locale]/apply/page.tsx)는 손댈 필요가 없습니다.
//
// entry ID를 새로 확인하는 방법: 구글 폼에서 응답을 하나 입력한 뒤 우측 상단
// "⋮" 메뉴 → "미리 채워진 링크 받기"를 누르면, 생성된 URL에 각 문항의
// entry.XXXXXXX 값이 그대로 노출됩니다.
// =============================================================================

// 구글 폼 응답 제출 URL. 폼 링크의 "viewform"을 "formResponse"로 바꾼 값입니다.
export const APPLY_FORM_ACTION_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSetSxfUI39leQMdfgKs37qKI-AG0_Ti-Q9jHRTZjg97ba5HIg/formResponse";

// 사이트 내 제출이 실패했을 때 안내하는 원본 구글 폼 링크입니다.
export const APPLY_FORM_VIEW_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSetSxfUI39leQMdfgKs37qKI-AG0_Ti-Q9jHRTZjg97ba5HIg/viewform";

// 일반 텍스트/장문형 입력 항목의 entry ID입니다.
// 왼쪽 key는 코드에서 참조하는 이름이라 바꾸면 안 되고, 오른쪽 값(entry.XXXXXXX)만
// 구글 폼에 맞게 갱신하면 됩니다.
export const APPLY_FORM_FIELDS = {
  name: "entry.1955851386",
  studentId: "entry.1697910141",
  contact: "entry.2083396902",
  email: "entry.653190702",
  motivation: "entry.1709014813",
  experience: "entry.1449610851",
} as const;

type LocalizedText = { ko: string; en: string };

type ApplyFormQuestion = {
  entryId: string;
  question: LocalizedText;
  options: { value: string; label: LocalizedText }[];
};

// 라디오 버튼(단일 선택) 문항입니다.
// - entryId: 구글 폼의 entry.XXXXXXX 값
// - question: 화면에 표시될 질문 문구 (한/영 모두 입력)
// - options[].value: 구글 시트에 실제로 기록되는 값 — 반드시 구글 폼이 기대하는
//   문자열과 정확히 일치해야 합니다 (예: "Yes", "No").
// - options[].label: 화면에 표시될 선택지 문구 (한/영) — value와 달리 자유롭게
//   바꾸거나 번역해도 구글 시트에 기록되는 값에는 영향이 없습니다.
export const APPLY_FORM_QUESTIONS = {
  commitment: {
    entryId: "entry.511102785",
    question: {
      ko: "동아리 활동에 성실히 참여할 자신이 있으신가요?",
      en: "Are you going to participate in club activities actively?",
    },
    options: [
      { value: "네(Yes)", label: { ko: "네", en: "Yes" } },
    ],
  },
  schedule: {
    entryId: "entry.1776735102",
    question: {
      ko: "동아리 정기 모임은 수요일 오후 9시 30분에 있습니다. 보통은 비대면, 비실시간으로 진행됩니다.",
      en: "Our regular club meetings will be at Wednesday 9:30 pm. Normally however, the meetings are asynchronous remote.",
    },
    options: [
      {
        value: "I read and understood",
        label: { ko: "확인했습니다", en: "I read and understood" },
      },
    ],
  },
  firstMeeting: {
    entryId: "entry.516469068",
    question: {
      ko: "3월 11(저녁 9시 반)일에 N1 102 호에서 첫 개강총회가 이루어질 예정입니다. 정기 모임은 필수참여가 아니지만, 개강총회는 필수로 참가해야 합니다. 개강총회 참석이 불가하면  010-9509-0057로 연락주세요.",
      en: "The first club meeting is scheduled on March 11th(9:30 PM) at N1 room 102. Although club meetings are not mandatory, you have to attend the first club meeting in person. If you want to enroll in the club but cannot take part in the first club meeting, contact me at  010-9509-0057",
    },
    options: [
      { value: "I read and understand", label: { ko: "확인했습니다", en: "I read and understood" } },
    ],
  },
} satisfies Record<string, ApplyFormQuestion>;

import type { CurrentUser, CurrentUserState } from "@/types/account";

// 개발 전용 fixture입니다. 프로덕션 코드에서는 절대 import하지 마세요.
// 사용법: src/lib/account/api.ts의 주석 참고.

const MOCK_MEMBER: CurrentUser = {
  discordId: "111111111111111111",
  discordUsername: "run_member",
  discordDisplayName: "김런",
  avatarUrl: "https://cdn.discordapp.com/embed/avatars/1.png",
  name: "김런",
  email: "run@kaist.ac.kr",
  studentId: "20250123",
  status: "member",
  role: "member",
  semesters: [
    { year: 2026, season: "fall", status: "approved" },
    { year: 2026, season: "spring", status: "approved" },
    { year: 2025, season: "fall", status: "approved" },
  ],
  solvedAc: "run_handle",
  codeforces: null,
  atcoder: "run_ac",
};

const MOCK_ADMIN: CurrentUser = {
  ...MOCK_MEMBER,
  discordId: "222222222222222222",
  discordUsername: "run_admin",
  discordDisplayName: "박운영",
  name: "박운영",
  studentId: "20230456",
  role: "admin",
};

const MOCK_ALUMNI: CurrentUser = {
  ...MOCK_MEMBER,
  discordId: "333333333333333333",
  discordUsername: "run_alumni",
  discordDisplayName: null,
  avatarUrl: null,
  status: "alumni",
  semesters: [{ year: 2022, season: "spring", status: "approved" }],
};

// 필드가 대부분 비어 있는 케이스(가입 신청 직후 등) — 화면이 깨지지 않는지 확인용.
const MOCK_APPLICANT_WITH_NULLS: CurrentUser = {
  discordId: "444444444444444444",
  discordUsername: "new_applicant",
  discordDisplayName: null,
  avatarUrl: null,
  name: null,
  email: null,
  studentId: null,
  status: "applicant",
  role: "member",
  semesters: [{ year: 2026, season: "fall", status: "pending" }],
  solvedAc: null,
  codeforces: null,
  atcoder: null,
};

// loading 상태를 계속 유지하는 fixture 용 — 절대 resolve되지 않는 Promise.
const NEVER_RESOLVES = new Promise<CurrentUserState>(() => {});

export const MOCK_STATES: Record<string, CurrentUserState | Promise<CurrentUserState>> = {
  "signed-in-member": { status: "signed-in", user: MOCK_MEMBER },
  "signed-in-admin": { status: "signed-in", user: MOCK_ADMIN },
  "signed-in-alumni": { status: "signed-in", user: MOCK_ALUMNI },
  "signed-in-applicant-nulls": { status: "signed-in", user: MOCK_APPLICANT_WITH_NULLS },
  "signed-out": { status: "signed-out" },
  forbidden: { status: "forbidden" },
  error: { status: "error" },
  loading: NEVER_RESOLVES,
};

export const DEFAULT_MOCK_STATE_KEY = "signed-in-member";

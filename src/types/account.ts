// 마이페이지(/my)와 헤더 계정 버튼이 함께 참조하는 타입입니다.
// 실제 값은 (이후 구축될) Cloudflare Worker의 GET /api/me 응답에서 옵니다.

export type CurrentUser = {
  discordId: string;
  discordUsername: string;
  discordDisplayName: string | null;
  avatarUrl: string | null;

  name: string | null;
  email: string | null;
  studentId: string | null;

  status: "applicant" | "member" | "alumni";
  // 보안 참고: role은 화면 표시(관리자 메뉴 노출 여부)에만 쓰는 편의 값입니다.
  // 실제 관리자 권한이 필요한 API(예: 추후 메일 아카이브)는 이 값을 신뢰하지 말고
  // 서버(Worker)에서 세션을 기준으로 별도로 재검증해야 합니다.
  role: "member" | "admin";
  // 승인됨/대기중 둘 다 포함, 최신순 — "가입 연도" 대신 이제 이걸로 소속을 보여줍니다.
  semesters: { year: number; season: "spring" | "fall"; status: "pending" | "approved" }[];
};

// /api/me 호출 결과를 나타내는 판별 유니온입니다.
// CurrentUserProvider가 이 상태를 만들어 useCurrentUser()로 공유합니다.
export type CurrentUserState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "forbidden" }
  | { status: "error" }
  | { status: "signed-in"; user: CurrentUser };

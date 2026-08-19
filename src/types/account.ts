// 마이페이지(/my)와 헤더 계정 버튼이 함께 참조하는 타입입니다.
// 실제 값은 (이후 구축될) Cloudflare Worker의 GET /api/me 응답에서 옵니다.

export type CurrentUser = {
  discordId: string;
  discordUsername: string;
  discordDisplayName: string | null;
  avatarUrl: string | null;

  name: string | null;
  // 실명과 별개인 표시용 닉네임 — 마이페이지에서 본인이 언제든 고칠 수 있습니다
  // (POST /api/me/nickname). null(아직 정해진 적 없음)과 ""(명시적으로 비움) 둘 다
  // 화면에는 "닉네임 없음"으로 보입니다. 회원 간 중복 허용.
  nickname: string | null;
  email: string | null;
  studentId: string | null;

  status: "applicant" | "member" | "alumni";
  // 보안 참고: role은 화면 표시(관리자 메뉴 노출 여부)에만 쓰는 편의 값입니다.
  // 실제 관리자 권한이 필요한 API(예: 추후 메일 아카이브)는 이 값을 신뢰하지 말고
  // 서버(Worker)에서 세션을 기준으로 별도로 재검증해야 합니다.
  role: "member" | "admin";
  // 회칙상 정회원과 별개인 자격 — backstage에서만 지정/해제하지만, UserProfileCard의
  // 상태 배지가 참고합니다(명예회원 > 활동회원 > 휴회원 순).
  isHonoraryMember: boolean;
  // 승인됨/대기중 둘 다 포함, 최신순 — "가입 연도" 대신 이제 이걸로 소속을 보여줍니다.
  semesters: { year: number; season: "spring" | "fall"; status: "pending" | "approved" }[];

  // 마이페이지에서 본인이 직접 수정 가능 (UserInfoCard의 연필 아이콘).
  solvedAc: string | null;
  codeforces: string | null;
  atcoder: string | null;
  doj: string | null;

  // RUNFORCE(worker/src/lib/runforce.ts::getMemberRunforce) — semesters처럼 nullable이
  // 아닙니다: 산정 대상 대회가 하나도 없으면 total=0, breakdown=[]로 내려갑니다.
  runforceTotal: number;
  runforceBreakdown: {
    contestId: string;
    platform: "codeforces" | "atcoder";
    contestName: string;
    startTimeMs: number;
    finalRank: number; // 0-indexed — 화면에는 +1해서 보여줌
    participantCount: number;
    score: number;
    // 레이팅 상한이 있는 라운드(Div.2/Div.3/Div.4)에서 상한 초과로 실시간 참가했지만 unrated 처리된 경우 —
    // score가 일반 순위 공식이 아니라 별도 규칙(rated 참가자 없으면 1등 점수, 있으면
    // rated 참가자 점수의 중앙값)으로 계산됐다는 뜻.
    isUnratedParticipant: boolean;
  }[];

  // RUNFORCE 시즌 표시용(집계에는 관여 안 함) — backstage RUNFORCE 탭에서 지정합니다.
  // name이 비어 있으면 마이페이지에서 시즌 줄을 안 그립니다. endDate는 "항상 오늘" 설정이
  // 켜져 있으면 오늘 날짜로 해석된 값입니다.
  runforceSeason: { name: string | null; startDate: string | null; endDate: string | null };
};

// /api/me 호출 결과를 나타내는 판별 유니온입니다.
// CurrentUserProvider가 이 상태를 만들어 useCurrentUser()로 공유합니다.
export type CurrentUserState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "forbidden" }
  | { status: "error" }
  | { status: "signed-in"; user: CurrentUser };

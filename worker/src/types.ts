export type Env = {
  SESSIONS: KVNamespace;
  MEMBERS: KVNamespace;
  // 이메일 목록 페이지(kaist.run/email)용 가벼운 색인 — 제목/보낸사람/받는사람/
  // 수신시각만 담고, 원본은 여전히 EMAILS(R2)에 있습니다.
  EMAIL_INDEX: KVNamespace;

  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;

  // 기존 Discord 봇(역대 회원 스프레드시트를 편집하는)과 같은 서비스 계정을
  // 재사용합니다 — 시트에 새로 공유 권한을 추가할 필요 없음.
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  ROSTER_ALL_TIME_SHEET_ID: string;
  GOOGLE_SHEET_RANGE: string;

  ADMIN_SYNC_SECRET: string;

  // 이메일 뷰어(kaist.run/email/<id>)용.
  EMAILS: R2Bucket;
  EMAIL_FORWARD_TO: string; // 지금까지 Gmail로 포워딩하던 그 주소
};

// 프런트엔드(src/types/account.ts)의 CurrentUser와 반드시 같은 모양을 유지해야 합니다.
export type CurrentUser = {
  discordId: string;
  discordUsername: string;
  discordDisplayName: string | null;
  avatarUrl: string | null;

  name: string | null;
  email: string | null;
  studentId: string | null;
  joinedYear: number | null;

  status: "applicant" | "member" | "alumni";
  role: "member" | "admin";
};

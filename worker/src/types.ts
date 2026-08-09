export type Env = {
  SESSIONS: KVNamespace;
  MEMBERS: KVNamespace;
  // 이메일 목록 페이지(kaist.run/email)용 가벼운 색인 — 제목/보낸사람/받는사람/
  // 수신시각만 담고, 원본은 여전히 EMAILS(R2)에 있습니다.
  EMAIL_INDEX: KVNamespace;

  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  // 로그인 OAuth 앱과는 별개로, 회원 명단 동기화 때 (로그인한 적 없는 사람 포함)
  // 임의의 Discord ID의 프로필 사진을 조회하기 위한 봇 토큰입니다 — /users/{id}는
  // 봇이 공유 서버 없이도 전역으로 쓸 수 있는 엔드포인트라 서버 초대가 필요 없습니다.
  // Discord Developer Portal → 해당 앱 → Bot → Token으로 발급하세요.
  DISCORD_BOT_TOKEN: string;

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

  // 공지/아카이브/연락처 콘텐츠 (backstage가 CRUD, 메인 사이트가 빌드 시점에 읽어감).
  CONTENT_DB: D1Database;

  // backstage에서 공지/아카이브 글에 넣는 파일(포스터 등). kaist.run/upload/*로
  // 공개 서빙됩니다.
  UPLOADS: R2Bucket;

  // backstage가 콘텐츠를 저장한 뒤 GitHub Actions(deploy.yml)를 재실행시켜
  // 정적 사이트를 다시 빌드/배포하기 위한 값들. 토큰은 이 저장소의
  // "Actions: write" 권한만 있으면 되고(코드/설정 쓰기 권한은 없음), fine-grained
  // PAT로 발급하세요.
  GITHUB_REPO: string; // "KAIST-RUN/kaist.run"
  GITHUB_ACTIONS_TOKEN: string;
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

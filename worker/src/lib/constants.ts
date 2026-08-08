// 세션 쿠키 이름. auth.ts와 me.ts가 함께 참조합니다.
export const SESSION_COOKIE = "session_id";

// 이 Worker가 신뢰하는 프런트엔드 origin 목록입니다.
//   - auth.ts: returnTo가 이 목록 안의 origin을 가리키는지 검사 (open redirect 방지)
//   - index.ts: /api/me, /api/auth/logout에 대한 CORS 허용 origin
// 로컬에서 메인 사이트(npm run dev)를 3000번 포트가 아닌 다른 포트로 띄웠다면
// 여기에 그 주소도 추가하세요.
export const ALLOWED_ORIGINS = ["https://kaist.run", "https://backstage.kaist.run", "http://localhost:3000"];

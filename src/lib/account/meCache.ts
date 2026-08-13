import type { CurrentUser } from "@/types/account";

// /api/me 응답의 localStorage 캐시 (stale-while-revalidate).
//
// 정적 익스포트 사이트라 전체 페이지 로드(첫 방문, 새로고침, 로그인 콜백 복귀)마다
// 하이드레이션 → /api/me 응답까지 헤더 계정 버튼과 마이페이지 전체가 스켈레톤이었습니다.
// 지난 응답을 여기 저장해 두고 마운트 즉시 보여준 뒤, 백그라운드 fetch 결과로 교정합니다
// (CurrentUserProvider 참고). 신선도 판정은 항상 서버가 하고, 이 캐시는 첫 페인트용입니다.
//
// - 본인 브라우저(same-origin)에만 남고, 로그아웃·401/403 응답 시 지웁니다.
// - CurrentUser 모양이 바뀌면(src/types/account.ts + worker/src/types.ts 동기 수정 시)
//   아래 KEY의 버전을 반드시 올리세요 — 구버전 캐시가 새 코드에 그대로 렌더되는 것을
//   막는 유일한 장치입니다. 버전이 다르면 readCachedUser의 구조 검증이 걸러냅니다.
const KEY = "kaist-run.me.v1";

// 렌더에 실제로 쓰이는 필드들이 기대한 타입인지 가볍게 확인합니다. api.ts의 응답 검증
// (discordId만 확인)보다 한 단계 강하게 — localStorage는 과거 버전 코드가 쓴 값일 수
// 있어서입니다.
function looksLikeCurrentUser(u: unknown): u is CurrentUser {
  if (!u || typeof u !== "object") return false;
  const c = u as Record<string, unknown>;
  return (
    typeof c.discordId === "string" &&
    typeof c.discordUsername === "string" &&
    typeof c.runforceTotal === "number" &&
    Array.isArray(c.runforceBreakdown) &&
    Array.isArray(c.semesters) &&
    typeof c.runforceSeason === "object" &&
    c.runforceSeason !== null
  );
}

export function readCachedUser(): CurrentUser | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!looksLikeCurrentUser(parsed)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    // 파싱 실패(손상)나 스토리지 접근 불가(프라이빗 모드 등) — 캐시 없이 진행.
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
    return null;
  }
}

export function writeCachedUser(user: CurrentUser): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // 쿼터 초과/프라이빗 모드 — 캐시는 최적화일 뿐이라 조용히 넘어갑니다.
  }
}

export function clearCachedUser(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

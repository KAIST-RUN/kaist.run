import type { Env } from "../types";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30일

// 세션에는 Discord 쪽 표시 정보만 담습니다. 이름/학번/상태/권한 같은 회원 정보는
// members.ts에서 매 요청마다 새로 읽어옵니다 — 그래야 명단이 바뀌었을 때 재로그인
// 없이도 반영됩니다.
export type SessionRecord = {
  discordId: string;
  discordUsername: string;
  discordDisplayName: string | null;
  avatarUrl: string | null;
};

// 저장소는 D1입니다(0027_sessions.sql). 예전엔 KV(SESSIONS)였는데, KV는 리전 간 비동기
// 복제(최대 ~60초)라 "로그인 콜백이 쓰고 리다이렉트 직후 /api/me가 읽는" 세션 패턴에서
// 방금 만든 세션이 안 보이는 경우가 있었습니다 — Smart Placement로 콜백과 /api/me의
// 실행 위치가 갈릴 수 있게 되면서 간헐적 "로그인 직후 마이페이지 안 뜸"으로 표면화.
// D1은 단일 primary라 어디서 실행되든 쓰기 직후 읽기가 보장됩니다.
//
// KV 네임스페이스는 기존 세션(최대 30일 유효)의 fallback 읽기/삭제에만 남아 있습니다.
// 2026-09-14 이후로는 살아있는 KV 세션이 없으므로 fallback 코드와 SESSIONS 바인딩을
// 제거해도 됩니다.

function randomSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(env: Env, record: SessionRecord): Promise<string> {
  const sessionId = randomSessionId();
  await env.CONTENT_DB.prepare(
    `INSERT INTO sessions (id, discord_id, discord_username, discord_display_name, avatar_url, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now', '+' || ?6 || ' seconds'))`,
  )
    .bind(sessionId, record.discordId, record.discordUsername, record.discordDisplayName, record.avatarUrl, SESSION_TTL_SECONDS)
    .run();
  return sessionId;
}

export async function getSession(env: Env, sessionId: string): Promise<SessionRecord | null> {
  const row = await env.CONTENT_DB.prepare(
    "SELECT discord_id, discord_username, discord_display_name, avatar_url FROM sessions WHERE id = ?1 AND expires_at > datetime('now')",
  )
    .bind(sessionId)
    .first<{ discord_id: string; discord_username: string; discord_display_name: string | null; avatar_url: string | null }>();
  if (row) {
    return {
      discordId: row.discord_id,
      discordUsername: row.discord_username,
      discordDisplayName: row.discord_display_name,
      avatarUrl: row.avatar_url,
    };
  }

  // 이전(KV 시절)에 만들어진 세션 fallback — 마이그레이션 배포 전에 로그인한 사람이
  // 재로그인 없이 계속 쓸 수 있게 합니다. 새 세션은 절대 KV에 쓰지 않으므로, 기존
  // 세션이 모두 만료되는 30일 뒤엔 이 블록을 지워도 됩니다(파일 상단 주석).
  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  // 신규(D1)·기존(KV) 어느 쪽 세션이든 로그아웃되도록 둘 다 지웁니다.
  await env.CONTENT_DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId).run();
  await env.SESSIONS.delete(`session:${sessionId}`);
}

// 만료 세션 정리 — 매시 정각 크론(index.ts::scheduled)이 호출합니다. getSession이
// expires_at으로 이미 걸러내므로 정확성 문제는 없고, 테이블이 무한히 크는 것만 막습니다.
export async function purgeExpiredSessions(env: Env): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

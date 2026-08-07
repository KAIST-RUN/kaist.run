import type { Env } from "../types";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30일

// 세션에는 Discord 쪽 표시 정보만 담습니다. 이름/학번/상태/권한 같은 회원 정보는
// members.ts(KV, 시트 동기화본)에서 매 요청마다 새로 읽어옵니다 — 그래야 시트가
// 바뀌었을 때 재로그인 없이도 반영됩니다.
export type SessionRecord = {
  discordId: string;
  discordUsername: string;
  discordDisplayName: string | null;
  avatarUrl: string | null;
};

function randomSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(env: Env, record: SessionRecord): Promise<string> {
  const sessionId = randomSessionId();
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return sessionId;
}

export async function getSession(env: Env, sessionId: string): Promise<SessionRecord | null> {
  const raw = await env.SESSIONS.get(`session:${sessionId}`);
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.SESSIONS.delete(`session:${sessionId}`);
}

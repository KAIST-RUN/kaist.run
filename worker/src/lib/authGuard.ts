import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import { getSession, type SessionRecord } from "./session";
import { getMember, type MemberRecord } from "./members";
import { SESSION_COOKIE } from "./constants";

export type AuthResult =
  | { ok: true; session: SessionRecord; member: MemberRecord }
  | { ok: false; reason: "signed-out" | "forbidden" };

// /api/me와 /email/*가 공통으로 쓰는 "로그인 + 현재 회원 정보" 조회입니다.
// 로그인 이후 시트에서 회원이 빠졌을 수도 있으니 매번 다시 확인합니다.
export async function requireSession(c: Context<{ Bindings: Env }>): Promise<AuthResult> {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return { ok: false, reason: "signed-out" };

  const session = await getSession(c.env, sessionId);
  if (!session) return { ok: false, reason: "signed-out" };

  const member = await getMember(c.env, session.discordId);
  if (!member) return { ok: false, reason: "forbidden" };

  return { ok: true, session, member };
}

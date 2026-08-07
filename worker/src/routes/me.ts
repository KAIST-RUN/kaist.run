import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { CurrentUser, Env } from "../types";
import { getSession } from "../lib/session";
import { getMember } from "../lib/members";
import { SESSION_COOKIE } from "../lib/constants";

export const me = new Hono<{ Bindings: Env }>();

// 프런트의 src/lib/account/api.ts가 credentials:"include"로 호출합니다.
me.get("/", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return c.json({ error: "unauthorized" }, 401);

  const session = await getSession(c.env, sessionId);
  if (!session) return c.json({ error: "unauthorized" }, 401);

  // 로그인 이후 시트에서 회원이 제외됐을 수도 있으니 매번 다시 확인합니다.
  const member = await getMember(c.env, session.discordId);
  if (!member) return c.json({ error: "forbidden" }, 403);

  const user: CurrentUser = {
    discordId: session.discordId,
    discordUsername: session.discordUsername,
    discordDisplayName: session.discordDisplayName,
    avatarUrl: session.avatarUrl,
    name: member.name,
    email: member.email,
    studentId: member.studentId,
    joinedYear: member.joinedYear,
    status: member.status,
    role: member.role,
  };

  return c.json(user);
});

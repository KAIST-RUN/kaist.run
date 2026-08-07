import { Hono } from "hono";
import type { CurrentUser, Env } from "../types";
import { requireSession } from "../lib/authGuard";

export const me = new Hono<{ Bindings: Env }>();

// 프런트의 src/lib/account/api.ts가 credentials:"include"로 호출합니다.
me.get("/", async (c) => {
  const auth = await requireSession(c);
  if (!auth.ok) {
    return c.json(
      { error: auth.reason },
      auth.reason === "forbidden" ? 403 : 401,
    );
  }

  const { session, member } = auth;
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

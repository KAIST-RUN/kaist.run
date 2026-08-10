import { Hono } from "hono";
import type { CurrentUser, Env } from "../types";
import { requireSession } from "../lib/authGuard";
import { getUserSemesters } from "../lib/semesters";
import { updateUserHandles } from "../lib/members";

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
  const semesters = await getUserSemesters(c.env, member.uid);
  const user: CurrentUser = {
    discordId: session.discordId,
    discordUsername: session.discordUsername,
    discordDisplayName: session.discordDisplayName,
    avatarUrl: session.avatarUrl,
    name: member.name,
    email: member.email,
    studentId: member.studentId,
    status: member.status,
    role: member.role,
    isHonoraryMember: member.isHonoraryMember,
    semesters,
    solvedAc: member.solvedAc,
    codeforces: member.codeforces,
    atcoder: member.atcoder,
  };

  return c.json(user);
});

// 마이페이지에서 본인이 solved.ac/Codeforces/AtCoder 핸들을 직접 고칠 때 씁니다
// (UserInfoCard.tsx의 연필 아이콘). 이름/이메일/학번/Discord ID는 여기서 절대
// 못 건드립니다 — uid는 세션에서만 나오고(요청 바디로 안 받음), updateUserHandles
// 자체가 핸들 3개짜리 컬럼만 UPDATE하는 좁은 함수라 다른 필드는 애초에 손댈 방법이
// 없습니다.
me.post("/handles", async (c) => {
  const auth = await requireSession(c);
  if (!auth.ok) {
    return c.json({ error: auth.reason }, auth.reason === "forbidden" ? 403 : 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }
  const b = body as Record<string, unknown>;
  // 빈 문자열/공백만 있는 값은 "지움"으로 취급해 null로 저장합니다(다른 곳의
  // 관례와 동일 — worker/src/routes/backstage.ts의 readUserForm 참고).
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    return trimmed || null;
  };

  await updateUserHandles(c.env, auth.member.uid, {
    solvedAc: str(b.solvedAc),
    codeforces: str(b.codeforces),
    atcoder: str(b.atcoder),
  });

  return c.json({ ok: true });
});

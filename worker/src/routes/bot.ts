import { Hono } from "hono";
import type { Env } from "../types";
import { getUserByDiscordId, upsertUserByDiscordId, UserValidationError } from "../lib/members";
import { requestSemesterMembership, getUserSemesters, SemesterError } from "../lib/semesters";

// 외부 디스코드 봇이 "신규 회원가입"/"학기별 활동회원 등록"을 처리할 때 부르는 API입니다.
// 봇은 지금까지 구글 스프레드시트를 직접 편집해왔는데, 이제 원천이 D1로 옮겨오면서
// 새로 필요해진 경로들입니다 — 이 저장소엔 봇 코드 자체가 없고, 여기는 봇이 소비할
// API 계약만 제공합니다(봇 쪽이 이 API를 실제로 호출하도록 고치는 건 별도 작업).
//
// ADMIN_SYNC_SECRET(사이트 운영자의 CLI/cron용)과는 별개로 DISCORD_BOT_API_SECRET을
// 씁니다 — 봇 자격증명만 독립적으로 회전/폐기할 수 있게.
export const bot = new Hono<{ Bindings: Env }>();

function isSeason(value: unknown): value is "spring" | "fall" {
  return value === "spring" || value === "fall";
}

bot.use("*", async (c, next) => {
  const provided = c.req.header("x-bot-secret");
  if (!provided || provided !== c.env.DISCORD_BOT_API_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

// 신규 회원가입 — discordId 기준 upsert라 봇이 같은 사람을 여러 번 호출해도 안전합니다
// (이름/이메일 등 재전송된 필드만 갱신, 나머지는 기존 값 유지).
bot.post("/users", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).discordId !== "string") {
    return c.json({ error: "discordId가 필요합니다." }, 400);
  }
  const b = body as Record<string, unknown>;
  const str = (v: unknown): string | null | undefined => (v === undefined ? undefined : typeof v === "string" ? v : null);

  try {
    const result = await upsertUserByDiscordId(c.env, b.discordId as string, {
      name: str(b.name),
      email: str(b.email),
      studentId: str(b.studentId),
      phone: str(b.phone),
      solvedAc: str(b.solvedAc),
      codeforces: str(b.codeforces),
      atcoder: str(b.atcoder),
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof UserValidationError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

// 학기별 활동회원 등록 — year/season을 생략하면 현재 학기로 등록됩니다. 실제로
// 명단(semester_membership)에 반영되는 건 관리자가 backstage에서 승인한 뒤입니다
// (여기선 pending만 만듦).
bot.post("/semester-membership", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).discordId !== "string") {
    return c.json({ error: "discordId가 필요합니다." }, 400);
  }
  const b = body as Record<string, unknown>;
  if ((b.year !== undefined && typeof b.year !== "number") || (b.season !== undefined && !isSeason(b.season))) {
    return c.json({ error: "year/season 형식이 올바르지 않습니다." }, 400);
  }

  const user = await getUserByDiscordId(c.env, b.discordId as string);
  if (!user) return c.json({ error: "등록되지 않은 유저입니다. 먼저 /users로 가입해 주세요." }, 404);

  try {
    const result = await requestSemesterMembership(c.env, user.uid, b.year as number | undefined, b.season as "spring" | "fall" | undefined);
    return c.json(result);
  } catch (err) {
    if (err instanceof SemesterError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

// 봇이 "이미 가입/등록했는지" 확인할 때 씁니다.
bot.get("/users/:discordId", async (c) => {
  const user = await getUserByDiscordId(c.env, c.req.param("discordId"));
  if (!user) return c.json({ error: "not_found" }, 404);

  const semesters = await getUserSemesters(c.env, user.uid);
  return c.json({
    uid: user.uid,
    discordId: user.discordId,
    name: user.name,
    status: user.status,
    role: user.role,
    semesters,
  });
});

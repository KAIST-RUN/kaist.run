import { Hono } from "hono";
import type { Env } from "../types";
import {
  getUserByDiscordId,
  getUserByUid,
  upsertUserByDiscordId,
  grantAdmin,
  revokeAdmin,
  UserValidationError,
  listAllTimeHandles,
  listCurrentSemesterHandles,
  listBotMemberRoster,
  type HandleSite,
} from "../lib/members";
import {
  requestSemesterMembership,
  getUserSemesters,
  listAllSemesterDiscordIds,
  listPendingApprovalNotifications,
  ackApprovalNotifications,
  SemesterError,
  type PendingApprovalNotification,
} from "../lib/semesters";
import { completeAtCoderContest, listPendingAtCoderContests, RunforceError, type AtCoderPendingEntry } from "../lib/runforce";

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

// 봇이 준 관리자 권한의 감사기록용 이름 — backstage 관리자 목록에서 "누가 줬는지"를
// 구분할 수 있게, 사람이 준 것(관리자 이름이 찍힘)과 다른 값을 남깁니다.
const BOT_GRANTED_BY_NAME = "디스코드 봇 (서버 관리자 권한)";

// 신규 회원가입 — discordId 기준 upsert라 봇이 같은 사람을 여러 번 호출해도 안전합니다
// (이름/이메일 등 재전송된 필드만 갱신, 나머지는 기존 값 유지).
//
// isAdmin(선택): 디스코드 서버 관리 권한이 있는 사람을 가입과 동시에 사이트 관리자로
// 만들 때 씁니다. 나머지 필드와 같은 규칙을 따릅니다 — 안 보내면(undefined) 기존 권한을
// 그대로 두고, true면 부여, false면 회수합니다.
// ⚠️ 봇이 매번 isAdmin: false를 보내면 backstage에서 수동으로 준 관리자 권한까지 같이
// 회수됩니다(사이트 관리자와 디스코드 서버 관리자가 항상 같은 집합은 아님). 그런
// 동기화를 원하는 게 아니라면, 서버 관리자가 아닌 사람에겐 isAdmin을 아예 빼고 보내세요.
bot.post("/users", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).discordId !== "string") {
    return c.json({ error: "discordId가 필요합니다." }, 400);
  }
  const b = body as Record<string, unknown>;
  if (b.isAdmin !== undefined && typeof b.isAdmin !== "boolean") {
    return c.json({ error: "isAdmin은 boolean이어야 합니다." }, 400);
  }
  const str = (v: unknown): string | null | undefined => (v === undefined ? undefined : typeof v === "string" ? v : null);

  try {
    const result = await upsertUserByDiscordId(c.env, b.discordId as string, {
      // 생략하면 Discord 표시 이름을 기본값으로 씁니다. ''를 명시하면 "닉네임 없음"으로
      // 확정됩니다(members.ts::createUser). str()이 undefined를 그대로 흘려보내므로
      // 이 구분이 유지됩니다.
      nickname: str(b.nickname),
      name: str(b.name),
      email: str(b.email),
      studentId: str(b.studentId),
      phone: str(b.phone),
      solvedAc: str(b.solvedAc),
      codeforces: str(b.codeforces),
      atcoder: str(b.atcoder),
    });

    // grantAdmin/revokeAdmin 둘 다 멱등이라(ON CONFLICT DO NOTHING / DELETE) 봇이 같은
    // 호출을 반복해도 안전합니다. grantedByUid는 사람이 아니므로 null.
    if (b.isAdmin === true) await grantAdmin(c.env, result.uid, null, BOT_GRANTED_BY_NAME);
    else if (b.isAdmin === false) await revokeAdmin(c.env, result.uid);

    // 봇이 "실제로 관리자로 들어갔는지" 바로 확인할 수 있게 최종 상태를 같이 돌려줍니다.
    const saved = await getUserByUid(c.env, result.uid);
    return c.json({ ...result, role: saved?.role ?? "member" });
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

// URL 세그먼트("solved-ac")와 실제 컬럼/타입 키("solvedAc")가 달라서 여기서만
// 매핑합니다 — HANDLE_COLUMN(members.ts)에 쓰는 site 값은 이 매핑을 거친 뒤라
// 항상 셋 중 하나로 검증된 상태입니다.
const SITE_PARAM: Record<string, HandleSite> = { "solved-ac": "solvedAc", codeforces: "codeforces", atcoder: "atcoder" };

function parseSite(c: { req: { param(key: string): string } }): HandleSite | null {
  return SITE_PARAM[c.req.param("site")] ?? null;
}

// 역대 모든 인원(학기 소속과 무관)의 특정 사이트 핸들 — 핸들이 없는 사람은 빠집니다.
bot.get("/handles/:site", async (c) => {
  const site = parseSite(c);
  if (!site) return c.json({ error: "site는 solved-ac|codeforces|atcoder 중 하나여야 합니다." }, 400);
  return c.json(await listAllTimeHandles(c.env, site));
});

// 이번 학기(현재 학기로 지정된 학기)에 승인된 인원만 — 핸들이 없는 사람은 빠집니다.
bot.get("/handles/:site/current-semester", async (c) => {
  const site = parseSite(c);
  if (!site) return c.json({ error: "site는 solved-ac|codeforces|atcoder 중 하나여야 합니다." }, 400);
  return c.json(await listCurrentSemesterHandles(c.env, site));
});

// 봇이 주기적으로 전체 회원을 훑을 때 씁니다 — 디스코드 UID + 학번 + 이름 + 닉네임.
// 닉네임은 아직 정해진 적 없으면(기존 회원) null, 회원이 명시적으로 비웠으면 ""입니다.
bot.get("/members", async (c) => {
  return c.json(await listBotMemberRoster(c.env));
});

// 모든(열린) 학기 각각의 소속(승인된) 디스코드 ID 목록.
bot.get("/semesters", async (c) => {
  return c.json(await listAllSemesterDiscordIds(c.env));
});

// ---------- 학기 승인 알림(DM) 큐 ----------
// /members(전체 스냅샷)로는 "방금 승인됐다"를 정확히 알 수 없어서(리컨실리에이션이라
// 역할이 빠져있으면 다 "새로 승인됨"처럼 보임) 따로 둔 큐입니다. 봇은 이걸 폴링해
// DM을 보내고 처리한 건을 /approvals/ack로 소비 처리합니다 — 역할 동기화와는 완전히
// 독립적이라, 이 큐가 막혀도 역할 부여/회수 자체는 평소대로 돕니다.

bot.get("/approvals/pending", async (c) => {
  return c.json(await listPendingApprovalNotifications(c.env));
});

bot.post("/approvals/ack", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).items)) {
    return c.json({ error: "items 배열이 필요합니다." }, 400);
  }

  const items: PendingApprovalNotification[] = [];
  for (const raw of (body as Record<string, unknown>).items as unknown[]) {
    if (!raw || typeof raw !== "object") return c.json({ error: "items 형식이 올바르지 않습니다." }, 400);
    const r = raw as Record<string, unknown>;
    if (typeof r.discordId !== "string" || typeof r.year !== "number" || !isSeason(r.season)) {
      return c.json({ error: "items의 각 항목은 { discordId, year, season } 형식이어야 합니다." }, 400);
    }
    items.push({ discordId: r.discordId, year: r.year, season: r.season });
  }

  await ackApprovalNotifications(c.env, items);
  return c.json({ acked: items.length });
});

// ---------- RUNFORCE: AtCoder 순위표 중계 ----------
// atcoder.jp/contests/{id}/results/json이 이 Worker 발신 IP에서 403으로 막혀 있어서
// (worker/src/lib/atcoder.ts 참고) RUNFORCE의 AtCoder 대회는 이 두 엔드포인트로 봇이
// 대신 순위표를 가져와 넘겨줍니다. Codeforces는 이 중계가 필요 없습니다(막혀있지 않음).

// 봇이 폴링용으로 부릅니다 — 아직 순위표를 못 받은 AtCoder contestId 목록.
bot.get("/runforce/atcoder-pending", async (c) => {
  const pending: AtCoderPendingEntry[] = await listPendingAtCoderContests(c.env);
  return c.json(pending.map((p) => ({ contestId: p.contestId })));
});

// 봇이 atcoder.jp에서 직접 가져온 순위표를 넘겨서 RUNFORCE 계산을 완료합니다.
// entries가 비어있는 것 자체는 에러가 아닙니다(그 대회에 클럽원이 아무도 없었을 수도
// 있음 — 실제 0명 여부는 addTargetContest 쪽 회원 매칭이 알아서 처리) — contestId가
// 대기열에 없어도(레이스 등) source='auto'로 처리해 계산 자체는 막지 않습니다.
bot.post("/runforce/atcoder-standings", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "잘못된 요청 본문입니다." }, 400);
  const b = body as Record<string, unknown>;

  const contestId = typeof b.contestId === "string" ? b.contestId.trim() : "";
  if (!contestId) return c.json({ error: "contestId가 필요합니다." }, 400);
  if (!Array.isArray(b.entries)) return c.json({ error: "entries 배열이 필요합니다." }, 400);

  const entries: { handle: string; rank: number }[] = [];
  for (const raw of b.entries) {
    if (!raw || typeof raw !== "object") return c.json({ error: "entries 형식이 올바르지 않습니다." }, 400);
    const r = raw as Record<string, unknown>;
    if (typeof r.handle !== "string" || typeof r.rank !== "number") {
      return c.json({ error: "entries의 각 항목은 { handle: string, rank: number } 형식이어야 합니다." }, 400);
    }
    entries.push({ handle: r.handle, rank: r.rank });
  }

  try {
    const contest = await completeAtCoderContest(c.env, contestId, entries);
    return c.json({ id: contest.id, contestId: contest.contestId, participantCount: contest.participantCount });
  } catch (err) {
    if (err instanceof RunforceError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

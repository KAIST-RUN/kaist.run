import { Hono } from "hono";
import type { Env } from "../types";
import { upsertUserByDiscordId, grantAdmin } from "../lib/members";
import { openSemester, addSemesterMember } from "../lib/semesters";
import { fetchMembersFromSheet } from "../lib/googleSheets";
import { getEffectiveSheetId } from "../lib/rosterSheet";
import { backfillEmailIndex } from "../lib/emailIndex";

export const admin = new Hono<{ Bindings: Env }>();

function requireAdminSecret(c: { req: { header(name: string): string | undefined }; env: Env }): boolean {
  const provided = c.req.header("x-admin-secret");
  return Boolean(provided) && provided === c.env.ADMIN_SYNC_SECRET;
}

// 회원 데이터를 구글 스프레드시트 → D1(users/admins/semester_membership)로 옮기는
// 1회성 이관입니다. discordId 기준 upsert라 재실행해도 안전합니다(예: 이관 도중
// 시트가 바뀌어서 다시 돌려야 하는 경우). year/season은 필수 — 이관되는 회원
// 전원을 그 학기에 자동 승인 처리합니다(현재 학기로 지정), 전환 직후 마이페이지가
// 갑자기 비어 보이지 않도록 하기 위함입니다.
//
// 이관을 실제로 완료하고 검증까지 마쳤으면(README/계획 문서 참고), 이 라우트와
// googleSheets.ts/rosterSheet.ts는 정리 단계에서 통째로 지워도 됩니다.
admin.post("/migrate-members", async (c) => {
  if (!requireAdminSecret(c)) return c.json({ error: "unauthorized" }, 401);

  const year = Number.parseInt(c.req.query("year") ?? "", 10);
  const season = c.req.query("season");
  if (!Number.isFinite(year) || (season !== "spring" && season !== "fall")) {
    return c.json({ error: "year(숫자)와 season(spring|fall) 쿼리 파라미터가 필요합니다." }, 400);
  }

  const sheetId = await getEffectiveSheetId(c.env);
  const sheetMembers = await fetchMembersFromSheet(c.env, sheetId);

  await openSemester(c.env, year, season, true);

  let created = 0;
  let updated = 0;
  let admins = 0;

  for (const m of sheetMembers) {
    const result = await upsertUserByDiscordId(c.env, m.discordId, {
      name: m.name,
      email: m.email,
      studentId: m.studentId,
      phone: m.phone,
      solvedAc: m.solvedAc,
      codeforces: m.codeforces,
      atcoder: m.atcoder,
    });
    if (result.created) created += 1;
    else updated += 1;

    await addSemesterMember(c.env, result.uid, year, season, null, "이관 스크립트");

    if (m.role === "admin") {
      await grantAdmin(c.env, result.uid, null, "이관 스크립트");
      admins += 1;
    }
  }

  return c.json({ total: sheetMembers.length, created, updated, admins, semester: { year, season } });
});

// 이메일 목록 페이지(kaist.run/email) 기능을 배포한 뒤, 그 전에 이미 R2에 쌓여
// 있던 메일들을 색인에 채워 넣기 위해 딱 한 번 수동으로 호출합니다
// (`npm run backfill-email-index`). 이미 색인된 메일은 건너뛰므로 재실행해도
// 안전합니다.
admin.post("/backfill-email-index", async (c) => {
  const provided = c.req.header("x-admin-secret");
  if (!provided || provided !== c.env.ADMIN_SYNC_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const result = await backfillEmailIndex(c.env);
  return c.json(result);
});

import { Hono } from "hono";
import type { Env } from "../types";
import { syncMembersFromSheet } from "../lib/members";
import { backfillEmailIndex } from "../lib/emailIndex";

export const admin = new Hono<{ Bindings: Env }>();

// 다음 정기 동기화(cron)를 기다리지 않고 즉시 회원 명단을 다시 불러오고 싶을 때
// 수동으로 호출합니다: `npm run sync-members` (package.json 스크립트 참고).
//
// 보안 참고: 이 경로는 프런트엔드 로그인 세션과 무관하게, ADMIN_SYNC_SECRET
// 헤더만으로 인증합니다. 이 값은 새지 않게 wrangler secret으로만 관리하세요.
admin.post("/sync-members", async (c) => {
  const provided = c.req.header("x-admin-secret");
  if (!provided || provided !== c.env.ADMIN_SYNC_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const result = await syncMembersFromSheet(c.env);
  return c.json(result);
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

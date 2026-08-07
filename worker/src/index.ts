import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { auth } from "./routes/auth";
import { me } from "./routes/me";
import { admin } from "./routes/admin";
import { syncMembersFromSheet } from "./lib/members";
import { ALLOWED_ORIGINS } from "./lib/constants";

const app = new Hono<{ Bindings: Env }>();

// /api/me, /api/auth/logout는 프런트가 credentials:"include"로 직접 fetch합니다.
// 프로덕션은 같은 origin이라 사실 필요 없지만, 로컬 개발 시 메인 사이트(3000번
// 포트)와 이 Worker(8787번 포트)가 서로 다른 origin이라 이게 있어야 브라우저가
// 응답을 허용합니다. (OAuth 리다이렉트 경로들은 페이지 이동이라 CORS 대상이
// 아니라서 영향 없음.)
app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : undefined),
    credentials: true,
  }),
);

app.route("/api/auth", auth);
app.route("/api/me", me);
app.route("/api/admin", admin);

export default {
  fetch: app.fetch,

  // wrangler.jsonc의 triggers.crons에 맞춰 주기적으로 실행됩니다.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(syncMembersFromSheet(env));
  },
};

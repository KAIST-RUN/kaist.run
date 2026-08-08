import { Hono } from "hono";
import type { Env } from "../types";
import { requireAdmin } from "../lib/authGuard";
import { renderBackstageHome } from "../lib/backstageRender";

// backstage.kaist.run 전용 라우트. wrangler.jsonc의 "backstage.kaist.run/*" 라우트만
// 이 핸들러로 오고, kaist.run 쪽 경로에는 영향이 없습니다 (index.ts에서 app.route("/", backstage)로
// 마운트하지만, kaist.run에는 애초에 "/" 패턴의 Worker 라우트 자체가 없어서 겹치지 않음).
export const backstage = new Hono<{ Bindings: Env }>();

backstage.get("/", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  return c.html(renderBackstageHome(gate.member));
});

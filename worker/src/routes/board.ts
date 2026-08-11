import { Hono } from "hono";
import type { Env } from "../types";
import { requireSession } from "../lib/authGuard";
import { listBoardPosts, getBoardPost, type Locale } from "../lib/content";

// "회원 전용 게시판"의 실제 열람 API입니다. worker/src/routes/content.ts(공개
// 콘텐츠 API)와 달리 이 경로는 세션 로그인을 요구합니다 — 그 파일의 API들은
// 전부 next build 시점(GitHub Actions, 로그인 세션이 있을 수 없음)에 미리 fetch돼
// 정적 파일로 구워지는 전제라 애초에 "비공개"를 표현할 수 없습니다(어떤 인증
// 체크를 넣어도, 빌드 시점엔 항상 로그인 안 된 상태로 통과해버려서 결과물인
// 정적 HTML/JSON 자체가 이미 공개돼 버림). 그래서 게시판은 그 패턴을 쓸 수 없고,
// 브라우저가 로그인 후 런타임에 쿠키를 실어 직접 호출하는 이 API가 필요합니다
// (프런트: src/lib/board/api.ts, src/components/board/*).
//
// requireAdmin이 아니라 requireSession만 씁니다 — "로그인한 회원이면 누구나"
// 볼 수 있어야 하고, 관리자일 필요는 없습니다(관리자 전용 작성/수정은 여전히
// backstage.ts가 requireAdmin으로 따로 지킵니다).
export const board = new Hono<{ Bindings: Env }>();

function isLocale(value: string): value is Locale {
  return value === "ko" || value === "en";
}

board.get("/:locale", async (c) => {
  const auth = await requireSession(c);
  if (!auth.ok) return c.json({ error: auth.reason }, auth.reason === "forbidden" ? 403 : 401);

  const locale = c.req.param("locale");
  if (!isLocale(locale)) return c.json({ error: "invalid locale" }, 400);
  return c.json(await listBoardPosts(c.env, locale));
});

board.get("/:locale/:slug", async (c) => {
  const auth = await requireSession(c);
  if (!auth.ok) return c.json({ error: auth.reason }, auth.reason === "forbidden" ? 403 : 401);

  const locale = c.req.param("locale");
  if (!isLocale(locale)) return c.json({ error: "invalid locale" }, 400);
  const post = await getBoardPost(c.env, locale, c.req.param("slug"));
  if (!post) return c.notFound();
  return c.json(post);
});

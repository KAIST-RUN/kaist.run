import { Hono } from "hono";
import type { Env } from "../types";
import { getContentImage } from "../lib/contentImages";

// kaist.run/content-images/<key> — 완전 공개, 인증 없음. 공지/아카이브 본문
// 마크다운에서 <img src="/content-images/...">로 그대로 참조됩니다.
export const contentImages = new Hono<{ Bindings: Env }>();

contentImages.get("/:key", async (c) => {
  const object = await getContentImage(c.env, c.req.param("key"));
  if (!object) return c.notFound();

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

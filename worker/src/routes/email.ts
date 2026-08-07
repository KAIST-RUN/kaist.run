import { Hono, type Context } from "hono";
import PostalMime from "postal-mime";
import type { Env } from "../types";
import { requireSession } from "../lib/authGuard";
import { getRawEmail } from "../lib/emailStore";
import { renderEmailPage, renderErrorPage } from "../lib/emailRender";

export const email = new Hono<{ Bindings: Env }>();

// 로그인 안 됨 → /api/auth/discord로 보내서 로그인 후 이 페이지로 돌아오게 합니다.
// 로그인은 됐지만 관리자가 아님 → 다시 로그인해도 소용없으니 바로 에러 페이지.
async function requireAdmin(c: Context<{ Bindings: Env }>): Promise<Response | null> {
  const auth = await requireSession(c);

  if (!auth.ok) {
    if (auth.reason === "signed-out") {
      const returnTo = encodeURIComponent(c.req.url);
      return c.redirect(`/api/auth/discord?returnTo=${returnTo}`);
    }
    return c.html(renderErrorPage("접근 권한이 없습니다", "회원 정보를 확인할 수 없습니다."), 403);
  }

  if (auth.member.role !== "admin") {
    return c.html(renderErrorPage("접근 권한이 없습니다", "이 페이지는 관리자만 볼 수 있습니다."), 403);
  }

  return null;
}

email.get("/:id", async (c) => {
  const gate = await requireAdmin(c);
  if (gate) return gate;

  const id = c.req.param("id");
  const raw = await getRawEmail(c.env, id);
  if (!raw) {
    return c.html(renderErrorPage("메일을 찾을 수 없습니다", "존재하지 않거나 삭제된 이메일입니다."), 404);
  }

  try {
    const parsed = await PostalMime.parse(raw);
    return c.html(renderEmailPage(id, parsed));
  } catch (err) {
    console.error(`Failed to parse email ${id}`, err);
    return c.html(
      renderErrorPage("메일을 표시할 수 없습니다", "형식을 해석하지 못했습니다 — 원본 파일은 다운로드할 수 있습니다."),
      500,
    );
  }
});

email.get("/:id/raw", async (c) => {
  const gate = await requireAdmin(c);
  if (gate) return gate;

  const id = c.req.param("id");
  const raw = await getRawEmail(c.env, id);
  if (!raw) return c.notFound();

  return new Response(raw, {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename="${id}.eml"`,
    },
  });
});

email.get("/:id/attachments/:index", async (c) => {
  const gate = await requireAdmin(c);
  if (gate) return gate;

  const id = c.req.param("id");
  const index = Number.parseInt(c.req.param("index"), 10);
  const raw = await getRawEmail(c.env, id);
  if (!raw) return c.notFound();

  const parsed = await PostalMime.parse(raw);
  const attachment = parsed.attachments?.[index];
  if (!attachment) return c.notFound();

  const content =
    typeof attachment.content === "string" ? new TextEncoder().encode(attachment.content) : attachment.content;
  const filename = attachment.filename || `attachment-${index}`;

  return new Response(content, {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});

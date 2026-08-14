import { Hono, type Context } from "hono";
import PostalMime from "postal-mime";
import type { Env } from "../types";
import { requireSession } from "../lib/authGuard";
import { getRawEmail } from "../lib/emailStore";
import { listEmailIndex, listEmailNoteStates, getEmailNoteState, setEmailNoteState } from "../lib/emailIndex";
import { renderEmailPage, renderEmailListPage, renderErrorPage, type EmailFilter } from "../lib/emailRender";
import { renderBackstageEmailList, renderBackstageEmailPage, PENDING_APPROVALS_BADGE_MARKER } from "../lib/backstageRender";
import { hasPendingApprovals } from "../lib/semesters";

export const email = new Hono<{ Bindings: Env }>();

const LIST_PAGE_SIZE = 20;

// backstage.ts::backstage.use("*", ...)와 같은 목적/같은 방식입니다 — shell()의
// nav가 심어두는 자리표시자를 실제 승인 대기 여부로 바꿔치기합니다. /email은
// backstage 서브앱(export const backstage)이 아니라 index.ts에 별도로 마운트되는
// 라우트라 그 미들웨어를 안 타므로, 여기서도 한 번 더 걸어야 backstage.kaist.run/email
// 페이지에서도 "회원 명단" 배지가 정확히 뜹니다.
email.use("*", async (c, next) => {
  await next();
  const res = c.res;
  if (res && (res.headers.get("content-type") ?? "").includes("text/html")) {
    const html = await res.text();
    if (html.includes(PENDING_APPROVALS_BADGE_MARKER)) {
      const pending = await hasPendingApprovals(c.env);
      const headers = new Headers(res.headers);
      headers.delete("content-length");
      c.res = new Response(
        html.replace(PENDING_APPROVALS_BADGE_MARKER, pending ? '<span class="bs-nav-badge" title="승인 대기 중">!</span>' : ""),
        { status: res.status, headers },
      );
    }
  }
});

// backstage.kaist.run에서 접근하면 backstage 메뉴(nav)가 있는 셸로, kaist.run에서
// 직접 접근하면(참고: wrangler.jsonc에 kaist.run/email(/*) 라우트도 따로 있음) 기존
// 기본 셸로 보여줍니다 — 같은 Worker/같은 경로 매칭이라 호스트로만 구분할 수 있습니다.
function isBackstageHost(c: Context<{ Bindings: Env }>): boolean {
  return new URL(c.req.url).hostname === "backstage.kaist.run";
}

// 로그인 안 됨 → /api/auth/discord로 보내서 로그인 후 이 페이지로 돌아오게 합니다.
// 로그인은 됐지만 관리자가 아님 → 다시 로그인해도 소용없으니 바로 에러 페이지.
async function requireAdmin(c: Context<{ Bindings: Env }>): Promise<Response | null> {
  const auth = await requireSession(c);

  if (!auth.ok) {
    if (auth.reason === "signed-out") {
      // 방금 Discord 로그인은 성공했지만 회원 명단에 없어서 세션이 안 만들어진 채
      // 돌아온 경우(auth.ts의 authError=not_member) — 여기서 다시 로그인으로
      // 보내면 Discord가 계속 재인증만 하고 회원이 아니라는 사실은 안 바뀌므로
      // 무한 리다이렉트 루프가 됩니다. 이때는 바로 에러 페이지를 보여줍니다.
      if (c.req.query("authError") === "not_member") {
        return c.html(renderErrorPage("접근 권한이 없습니다", "권한이 없습니다."), 403);
      }
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

// 받은메일함 목록. 페이지네이션은 커서가 아니라 단순 ?page=N 쿼리 파라미터입니다 —
// listEmailIndex()가 어차피 KV list() 1회로 전체(최대 1,000건)를 가져오므로, 몇
// 페이지를 요청하든 이 라우트의 백엔드 비용은 항상 KV 호출 1회로 동일합니다.
email.get("/", async (c) => {
  const gate = await requireAdmin(c);
  if (gate) return gate;

  const page = Math.max(0, Number.parseInt(c.req.query("page") ?? "0", 10) || 0);
  const filterParam = c.req.query("filter");
  const filter: EmailFilter = filterParam === "unhandled" || filterParam === "handled" ? filterParam : "all";

  const [all, noteStates] = await Promise.all([listEmailIndex(c.env), listEmailNoteStates(c.env)]);

  // 탭 옆 개수(전체/미처리/처리완료)는 필터링 전 전체 목록 기준이라, 어느 탭에 있든
  // 항상 세 값 모두 정확하게 보입니다.
  const counts = { all: all.length, unhandled: 0, handled: 0 };
  for (const item of all) {
    if (noteStates.get(item.id)?.handled) counts.handled++;
    else counts.unhandled++;
  }

  const filtered =
    filter === "all" ? all : all.filter((item) => (noteStates.get(item.id)?.handled ?? false) === (filter === "handled"));
  const start = page * LIST_PAGE_SIZE;
  const items = filtered.slice(start, start + LIST_PAGE_SIZE);
  const info = { page, hasPrev: page > 0, hasNext: start + LIST_PAGE_SIZE < filtered.length, filter, counts };

  return c.html(
    isBackstageHost(c) ? renderBackstageEmailList(items, info, noteStates) : renderEmailListPage(items, info, noteStates),
  );
});

email.get("/:id", async (c) => {
  const gate = await requireAdmin(c);
  if (gate) return gate;

  const id = c.req.param("id");
  const raw = await getRawEmail(c.env, id);
  if (!raw) {
    return c.html(renderErrorPage("메일을 찾을 수 없습니다", "존재하지 않거나 삭제된 이메일입니다."), 404);
  }

  try {
    const [parsed, state] = await Promise.all([PostalMime.parse(raw), getEmailNoteState(c.env, id)]);
    return c.html(isBackstageHost(c) ? renderBackstageEmailPage(id, parsed, state) : renderEmailPage(id, parsed, state));
  } catch (err) {
    console.error(`Failed to parse email ${id}`, err);
    return c.html(
      renderErrorPage("메일을 표시할 수 없습니다", "형식을 해석하지 못했습니다 — 원본 파일은 다운로드할 수 있습니다."),
      500,
    );
  }
});

// 메모 저장 — 처리 완료로 체크해서 저장한 경우엔 "이 메일은 끝났다"는 뜻이므로
// 목록으로 돌려보내고, 그게 아니면(메모만 남긴 경우) 계속 보던 상세 페이지에 둡니다.
email.post("/:id/note", async (c) => {
  const gate = await requireAdmin(c);
  if (gate) return gate;

  const id = c.req.param("id");
  const raw = await getRawEmail(c.env, id);
  if (!raw) {
    return c.html(renderErrorPage("메일을 찾을 수 없습니다", "존재하지 않거나 삭제된 이메일입니다."), 404);
  }

  const body = await c.req.parseBody();
  const note = typeof body.note === "string" ? body.note : "";
  const handled = body.handled === "1";
  await setEmailNoteState(c.env, id, note, handled);

  return c.redirect(handled ? "/email" : `/email/${id}`);
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

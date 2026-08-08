import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import { getSession, type SessionRecord } from "./session";
import { getMember, type MemberRecord } from "./members";
import { SESSION_COOKIE } from "./constants";
import { renderErrorPage } from "./emailRender";

export type AuthResult =
  | { ok: true; session: SessionRecord; member: MemberRecord }
  | { ok: false; reason: "signed-out" | "forbidden" };

// /api/me와 /email/*가 공통으로 쓰는 "로그인 + 현재 회원 정보" 조회입니다.
// 로그인 이후 시트에서 회원이 빠졌을 수도 있으니 매번 다시 확인합니다.
export async function requireSession(c: Context<{ Bindings: Env }>): Promise<AuthResult> {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return { ok: false, reason: "signed-out" };

  const session = await getSession(c.env, sessionId);
  if (!session) return { ok: false, reason: "signed-out" };

  const member = await getMember(c.env, session.discordId);
  if (!member) return { ok: false, reason: "forbidden" };

  return { ok: true, session, member };
}

export type AdminGateResult = { ok: true; member: MemberRecord } | { ok: false; response: Response };

// email.ts의 requireAdmin과 같은 규칙(로그인 유도 → not_member는 바로 에러 →
// admin 아니면 에러)이지만, 성공 시 member를 그대로 돌려줘서 호출부가 이름 등을
// 바로 쓸 수 있게 합니다. 여러 라우트(email.ts, backstage.ts)가 같은 판정
// 로직을 쓰므로 여기 한 곳에 모아둡니다.
export async function requireAdmin(c: Context<{ Bindings: Env }>): Promise<AdminGateResult> {
  const auth = await requireSession(c);

  if (!auth.ok) {
    if (auth.reason === "signed-out") {
      // 방금 Discord 로그인은 성공했지만 회원 명단에 없어서 세션이 안 만들어진 채
      // 돌아온 경우(auth.ts의 authError=not_member) — 여기서 다시 로그인으로
      // 보내면 Discord가 계속 재인증만 하고 회원이 아니라는 사실은 안 바뀌므로
      // 무한 리다이렉트 루프가 됩니다. 이때는 바로 에러 페이지를 보여줍니다.
      if (c.req.query("authError") === "not_member") {
        return { ok: false, response: c.html(renderErrorPage("접근 권한이 없습니다", "권한이 없습니다."), 403) };
      }
      const returnTo = encodeURIComponent(c.req.url);
      return { ok: false, response: c.redirect(`/api/auth/discord?returnTo=${returnTo}`) };
    }
    return {
      ok: false,
      response: c.html(renderErrorPage("접근 권한이 없습니다", "회원 정보를 확인할 수 없습니다."), 403),
    };
  }

  if (auth.member.role !== "admin") {
    return {
      ok: false,
      response: c.html(renderErrorPage("접근 권한이 없습니다", "이 페이지는 관리자만 볼 수 있습니다."), 403),
    };
  }

  return { ok: true, member: auth.member };
}

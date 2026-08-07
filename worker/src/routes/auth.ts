import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../types";
import { buildDiscordAuthorizeUrl, exchangeDiscordCode, fetchDiscordUser } from "../lib/discord";
import { createSession, deleteSession } from "../lib/session";
import { getMember } from "../lib/members";
import { ALLOWED_ORIGINS, OAUTH_RETURN_TO_COOKIE, OAUTH_STATE_COOKIE, SESSION_COOKIE } from "../lib/constants";

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// returnTo는 프런트가 항상 절대 URL로 보냅니다 (src/lib/account/authLinks.ts).
// ALLOWED_ORIGINS에 있는 origin을 가리킬 때만 허용합니다 (open redirect 방지).
function isSafeReturnTo(returnTo: string): boolean {
  try {
    return ALLOWED_ORIGINS.includes(new URL(returnTo).origin);
  } catch {
    return false;
  }
}

const DEFAULT_RETURN_TO = `${ALLOWED_ORIGINS[0]}/`;

export const auth = new Hono<{ Bindings: Env }>();

// 로그인 시작: 프런트가 이 경로로 <a> 태그를 통해 이동시킵니다.
// (src/lib/account/authLinks.ts의 getDiscordLoginHref 참고)
auth.get("/discord", (c) => {
  const returnToParam = c.req.query("returnTo") ?? DEFAULT_RETURN_TO;
  const returnTo = isSafeReturnTo(returnToParam) ? returnToParam : DEFAULT_RETURN_TO;
  const state = randomState();

  const oauthCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 600, // 10분 — 이 사이에 로그인을 마쳐야 함
  };

  setCookie(c, OAUTH_STATE_COOKIE, state, oauthCookieOptions);
  setCookie(c, OAUTH_RETURN_TO_COOKIE, returnTo, oauthCookieOptions);

  return c.redirect(buildDiscordAuthorizeUrl(c.env, state));
});

// Discord가 로그인 후 돌아오는 콜백.
auth.get("/discord/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const expectedState = getCookie(c, OAUTH_STATE_COOKIE);
  const returnTo = getCookie(c, OAUTH_RETURN_TO_COOKIE) ?? DEFAULT_RETURN_TO;

  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });
  deleteCookie(c, OAUTH_RETURN_TO_COOKIE, { path: "/" });

  if (!code || !stateParam || !expectedState || stateParam !== expectedState) {
    return c.text("Invalid OAuth state", 400);
  }

  const accessToken = await exchangeDiscordCode(c.env, code);
  const discordUser = await fetchDiscordUser(accessToken);

  // 역대 회원 스프레드시트(→ KV로 동기화된 것)에 없는 Discord 계정은 로그인 거부.
  // 프런트(src/components/account/MyPageContent.tsx)가 이 쿼리 파라미터를 읽어
  // 안내 배너를 띄웁니다. returnTo는 /discord에서 이미 origin 검증을 거쳤으므로
  // 여기서는 그대로 절대 URL로 사용합니다 (로컬에서는 Worker와 다른 포트로
  // 돌아가야 하므로 상대경로로 취급하면 안 됩니다).
  const member = await getMember(c.env, discordUser.discordId);
  if (!member) {
    const url = new URL(returnTo);
    url.searchParams.set("authError", "not_member");
    return c.redirect(url.toString());
  }

  const sessionId = await createSession(c.env, {
    discordId: discordUser.discordId,
    discordUsername: discordUser.discordUsername,
    discordDisplayName: discordUser.discordDisplayName,
    avatarUrl: discordUser.avatarUrl,
  });

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30일 — session.ts의 TTL과 맞춰둠
  });

  return c.redirect(returnTo);
});

// 로그아웃: src/components/account/AccountMenu.tsx가 POST로 호출합니다.
auth.post("/logout", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    await deleteSession(c.env, sessionId);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../types";
import { buildDiscordAuthorizeUrl, exchangeDiscordCode, fetchDiscordUser } from "../lib/discord";
import { createSession, deleteSession } from "../lib/session";
import { getMember } from "../lib/members";
import { ALLOWED_ORIGINS, SESSION_COOKIE } from "../lib/constants";

// state를 쿠키에 저장했다가 콜백 때 되읽는 방식은 모바일 Firefox의 ETP(Total
// Cookie Protection) 등 추적 방지 기능이 kaist.run → discord.com → kaist.run
// 리다이렉트 체인 중간에 쿠키를 걸러내는 경우가 있어 간헐적으로
// "Invalid OAuth state"를 냈습니다. 대신 state 자체에 서명을 실어 보내서
// 콜백 때 쿠키 없이 서명만 검증하면 되도록 바꿨습니다 — 브라우저의 쿠키 정책과
// 완전히 무관해집니다.
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.DISCORD_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

type OAuthStatePayload = { returnTo: string; nonce: string; exp: number };

async function signOAuthState(env: Env, payload: OAuthStatePayload): Promise<string> {
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(env);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(sig))}`;
}

// 서명 검증까지 통과한 payload만 돌려주고, 형식이 안 맞거나 위조/만료된 건 null.
async function verifyOAuthState(env: Env, state: string): Promise<OAuthStatePayload | null> {
  const dotIndex = state.lastIndexOf(".");
  if (dotIndex < 0) return null;
  const payloadB64 = state.slice(0, dotIndex);
  const sigB64 = state.slice(dotIndex + 1);

  const key = await hmacKey(env);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(sigB64),
    new TextEncoder().encode(payloadB64),
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as OAuthStatePayload;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// returnTo는 프런트가 항상 절대 URL로 보냅니다 (src/lib/account/authLinks.ts).
// ALLOWED_ORIGINS에 있는 호스트를 가리킬 때만 허용합니다 (open redirect 방지).
// scheme(http/https)까지는 안 따집니다 — 로컬 wrangler dev가 실제 요청을
// http://kaist.run/...로 시뮬레이션하는 경우가 있어서, origin 전체(scheme
// 포함)로 비교하면 로컬에서 정상적인 returnTo까지 거부될 수 있습니다.
const ALLOWED_RETURN_HOSTS = new Set(ALLOWED_ORIGINS.map((origin) => new URL(origin).hostname));

function isSafeReturnTo(returnTo: string): boolean {
  try {
    return ALLOWED_RETURN_HOSTS.has(new URL(returnTo).hostname);
  } catch {
    return false;
  }
}

const DEFAULT_RETURN_TO = `${ALLOWED_ORIGINS[0]}/`;

// 세션 쿠키를 kaist.run과 그 서브도메인(backstage.kaist.run 등)이 같이 쓰게
// 하려면 Domain=.kaist.run이 필요합니다. 다만 쿠키의 Domain은 실제 요청 Host의
// 상위 도메인이어야만 브라우저가 받아들이므로, localhost 등에서는 그냥 생략해야
// (host-only 쿠키) 합니다.
//
// c.req.url의 hostname으로는 이걸 못 가릅니다 — wrangler.jsonc에 routes가
// 설정되어 있으면 로컬 wrangler dev가 실제 접속 주소(localhost)와 무관하게
// c.req.url을 kaist.run으로 시뮬레이션해서, 로컬에서도 항상 "kaist.run"으로
// 잘못 판정됩니다. 대신 로컬/프로덕션에서 실제로 값이 다른 DISCORD_REDIRECT_URI
// (.dev.vars엔 localhost, 프로덕션 vars엔 kaist.run)로 판단합니다.
function sessionCookieDomain(env: Env): string | undefined {
  const hostname = new URL(env.DISCORD_REDIRECT_URI).hostname;
  return hostname === "kaist.run" || hostname.endsWith(".kaist.run") ? ".kaist.run" : undefined;
}

export const auth = new Hono<{ Bindings: Env }>();

// 로그인 시작: 프런트가 이 경로로 <a> 태그를 통해 이동시킵니다.
// (src/lib/account/authLinks.ts의 getDiscordLoginHref 참고)
auth.get("/discord", async (c) => {
  const returnToParam = c.req.query("returnTo") ?? DEFAULT_RETURN_TO;
  const returnTo = isSafeReturnTo(returnToParam) ? returnToParam : DEFAULT_RETURN_TO;

  const state = await signOAuthState(c.env, {
    returnTo,
    nonce: randomNonce(),
    exp: Date.now() + 10 * 60 * 1000, // 10분 — 이 사이에 로그인을 마쳐야 함
  });

  return c.redirect(buildDiscordAuthorizeUrl(c.env, state));
});

// Discord가 로그인 후 돌아오는 콜백.
auth.get("/discord/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const statePayload = stateParam ? await verifyOAuthState(c.env, stateParam) : null;

  if (!code || !statePayload) {
    return c.text("Invalid OAuth state", 400);
  }
  const returnTo = statePayload.returnTo;

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
    // /api/me 등은 프런트가 fetch(credentials:"include")로 부르는데, 로컬
    // 개발에서는 사이트(3000)와 Worker(8787)가 다른 origin이라 이게
    // cross-site 요청 취급됩니다. SameSite=Lax는 cross-site fetch에는 쿠키를
    // 안 실어주므로(주소창 이동 때만 통함) 로그인은 성공해도 /api/me가 계속
    // 401이 나요. None으로 풀어주는 대신, /api/* 쪽 CORS를 ALLOWED_ORIGINS로
    // 좁혀서(index.ts) 신뢰하는 origin에서만 이 쿠키가 쓰이게 막아둡니다.
    sameSite: "None",
    path: "/",
    domain: sessionCookieDomain(c.env),
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
  // 쿠키를 지울 땐 만들 때와 domain이 같아야 브라우저가 실제로 지웁니다.
  deleteCookie(c, SESSION_COOKIE, { path: "/", domain: sessionCookieDomain(c.env) });
  return c.body(null, 204);
});

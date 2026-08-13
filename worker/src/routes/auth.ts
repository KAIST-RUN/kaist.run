import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../types";
import { buildDiscordAuthorizeUrl, exchangeDiscordCode, fetchDiscordUser } from "../lib/discord";
import { createSession, deleteSession } from "../lib/session";
import { getUserByDiscordId, touchUserAvatar } from "../lib/members";
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

const DISCORD_CALLBACK_PATH = "/api/auth/discord/callback";

// 콜백을 항상 kaist.run 하나로 고정해뒀을 때(DISCORD_REDIRECT_URI), backstage.kaist.run에서
// 로그인을 시작한 경우 kaist.run에서 막 심어진 Domain=.kaist.run 세션 쿠키를 곧바로
// backstage.kaist.run으로 다시 리다이렉트해서 쓰게 됩니다. 이 "방금 심은 쿠키를 다른
// 서브도메인으로 넘어가자마자 쓰는" 마지막 한 번의 크로스 서브도메인 이동에서 모바일
// Firefox가 간헐적으로 그 쿠키를 놓쳐서, 로그인을 완료해도 즉시 다시 로그인 화면으로
// 튕기는 문제가 있었습니다(kaist.run 마이페이지 로그인은 콜백도 kaist.run이라 이 문제가
// 없음 — 증상이 backstage에서만 재현되는 이유). 그래서 로그인을 시작한 호스트에서 그대로
// 콜백까지 받도록, redirect_uri를 요청 호스트별로 다르게 씁니다 — 쿠키를 심는 요청과
// 처음 쓰는 요청이 항상 같은 호스트가 되어 이 문제가 생기지 않습니다.
// ⚠️ Discord Developer Portal의 OAuth2 → Redirects에
// https://backstage.kaist.run/api/auth/discord/callback 도 등록해둬야 합니다
// (kaist.run 것만 있으면 Discord가 "Invalid OAuth2 redirect_uri"로 거부합니다).
//
// 로컬 dev에서는 wrangler dev가 routes 설정 때문에 c.req.url의 호스트를 실제 접속
// 주소와 무관하게 항상 프로덕션 값으로 시뮬레이션하므로(sessionCookieDomain 주석
// 참고) 이 방식이 신뢰할 수 없어, 로컬에서는 그냥 DISCORD_REDIRECT_URI를 그대로 씁니다.
function discordRedirectUri(env: Env, requestUrl: string): string {
  if (sessionCookieDomain(env) === undefined) return env.DISCORD_REDIRECT_URI;
  const hostname = new URL(requestUrl).hostname;
  return ALLOWED_RETURN_HOSTS.has(hostname) ? `https://${hostname}${DISCORD_CALLBACK_PATH}` : env.DISCORD_REDIRECT_URI;
}

export const auth = new Hono<{ Bindings: Env }>();

// backstage.ts의 같은 이름 미들웨어와 같은 이유 — /discord, /discord/callback 응답은
// 요청자의 쿠키/세션에 따라 완전히 달라지는데, Cache-Control이 없으면 쿠키 없이 나간
// 주소창 자동완성 프리페치 요청의 응답이 캐시됐다가 진짜 요청에 잘못 재사용될 수 있음.
auth.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

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

  return c.redirect(buildDiscordAuthorizeUrl(c.env, state, discordRedirectUri(c.env, c.req.url)));
});

// Discord가 로그인 후 돌아오는 콜백. (discordRedirectUri 덕분에 kaist.run과
// backstage.kaist.run 둘 다에서 받을 수 있습니다 — wrangler.jsonc 라우트가 이미
// backstage.kaist.run/*를 통째로 이 워커로 보내고 있어서 별도 라우트 추가는 불필요.)
auth.get("/discord/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const statePayload = stateParam ? await verifyOAuthState(c.env, stateParam) : null;

  if (!code || !statePayload) {
    return c.text("Invalid OAuth state", 400);
  }
  const returnTo = statePayload.returnTo;

  // /discord에서 쓴 것과 반드시 같은 값이어야 합니다(Discord가 토큰 교환 때 정확히
  // 일치하는지 검사) — 둘 다 "현재 요청 호스트" 기준으로 계산하므로, Discord가 우리가
  // 넘긴 redirect_uri 그대로 돌아오는 한 자동으로 같은 값이 나옵니다.
  const redirectUri = discordRedirectUri(c.env, c.req.url);
  const accessToken = await exchangeDiscordCode(c.env, code, redirectUri);
  const discordUser = await fetchDiscordUser(accessToken);

  // users 테이블(D1)에 없는 Discord 계정은 로그인 거부. 프런트(src/components/
  // account/MyPageContent.tsx)가 이 쿼리 파라미터를 읽어 안내 배너를 띄웁니다.
  // returnTo는 /discord에서 이미 origin 검증을 거쳤으므로 여기서는 그대로 절대
  // URL로 사용합니다 (로컬에서는 Worker와 다른 포트로 돌아가야 하므로 상대경로로
  // 취급하면 안 됩니다).
  const member = await getUserByDiscordId(c.env, discordUser.discordId);
  if (!member) {
    const url = new URL(returnTo);
    url.searchParams.set("authError", "not_member");
    return c.redirect(url.toString());
  }

  // 로그인마다 아바타를 최신으로 맞춥니다 — OAuth 응답에 이미 들어있는 값이라 추가
  // API 호출 없이 공짜로 갱신됩니다(members.ts::touchUserAvatar 참고). 리다이렉트 응답에는
  // 필요 없는 부수 작업인데 예전엔 await로 응답을 붙잡았습니다 — D1 primary가 먼 리전에
  // 있으면 이 UPDATE 하나가 로그인 리다이렉트를 왕복 하나만큼(수백 ms) 지연시킵니다.
  // waitUntil은 응답을 보낸 뒤에도 작업을 끝까지 실행해 주므로(중간에 죽지 않음) 갱신은
  // 그대로 되고, 실패 로그도 그대로 남습니다.
  c.executionCtx.waitUntil(
    touchUserAvatar(c.env, discordUser.discordId, discordUser.avatarUrl).catch((err) => {
      console.error("Failed to refresh avatar on login", err);
    }),
  );

  const sessionId = await createSession(c.env, {
    discordId: discordUser.discordId,
    discordUsername: discordUser.discordUsername,
    discordDisplayName: discordUser.discordDisplayName,
    avatarUrl: discordUser.avatarUrl,
  });

  const isProd = sessionCookieDomain(c.env) !== undefined;

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    // 로컬 개발에서는 사이트(3000)와 Worker(8787)가 다른 origin이라 fetch가
    // cross-site 취급되어 SameSite=Lax면 쿠키가 안 실립니다(None으로 풀어주는
    // 대신 /api/* 쪽 CORS를 ALLOWED_ORIGINS로 좁혀서 신뢰하는 origin에서만
    // 쓰이게 막음 — index.ts 참고). 반면 프로덕션은 kaist.run과
    // backstage.kaist.run이 같은 site라서 Lax로도 충분하고, SameSite=None
    // 쿠키는 모바일 Firefox의 추적 방지 기능(Total Cookie Protection 등)이
    // 더 적극적으로 걸러내는 경향이 있어 "로그인해도 계속 로그인 화면"으로
    // 튕기는 원인이 됐던 것으로 보입니다. Lax가 더 안전합니다.
    sameSite: isProd ? "Lax" : "None",
    path: "/",
    domain: sessionCookieDomain(c.env),
    maxAge: 60 * 60 * 24 * 30, // 30일 — session.ts의 TTL과 맞춰둠
  });

  return c.redirect(returnTo);
});

// backstage.ts의 POST /logout(폼 제출로 페이지 이동)도 이 로직을 그대로 씁니다 —
// 세션 삭제 + 쿠키 삭제만 하고 응답(204 vs 리다이렉트)은 호출부가 알아서 정합니다.
export async function clearSessionCookie(c: Context<{ Bindings: Env }>): Promise<void> {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    await deleteSession(c.env, sessionId);
  }
  // 쿠키를 지울 땐 만들 때와 domain이 같아야 브라우저가 실제로 지웁니다.
  deleteCookie(c, SESSION_COOKIE, { path: "/", domain: sessionCookieDomain(c.env) });
}

// 로그아웃: src/components/account/AccountMenu.tsx가 POST로 호출합니다.
auth.post("/logout", async (c) => {
  await clearSessionCookie(c);
  return c.body(null, 204);
});

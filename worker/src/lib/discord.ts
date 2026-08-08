import type { Env } from "../types";

export type DiscordUser = {
  discordId: string;
  discordUsername: string;
  discordDisplayName: string | null;
  avatarUrl: string | null;
};

// redirectUri는 호출부(routes/auth.ts의 discordRedirectUri)가 요청 호스트별로
// 계산해서 넘겨줍니다 — kaist.run과 backstage.kaist.run 각각 자기 호스트로 콜백을
// 받기 위함이라, 여기서 env.DISCORD_REDIRECT_URI로 고정하면 안 됩니다.
export function buildDiscordAuthorizeUrl(env: Env, state: string, redirectUri: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  // 최소 권한: 로그인 식별에 identify만 있으면 충분합니다 (KAIST 이메일은
  // Discord가 아니라 회원 스프레드시트에서 옵니다 — src/lib/members.ts 참고).
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeDiscordCode(env: Env, code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      // Discord는 이 값이 authorize 때 쓴 redirect_uri와 정확히 같아야 토큰을 내줍니다.
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Discord token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord user fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };

  const avatarUrl = data.avatar
    ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.${
        data.avatar.startsWith("a_") ? "gif" : "png"
      }`
    : null;

  return {
    discordId: data.id,
    discordUsername: data.username,
    discordDisplayName: data.global_name,
    avatarUrl,
  };
}

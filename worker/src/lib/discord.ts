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

// 봇 토큰으로 임의의 Discord 사용자 아바타를 조회합니다. GET /users/{id}는 봇과
// 같은 서버에 없어도(공유 길드 없이) 전역으로 동작하는 엔드포인트라, 사이트에
// 한 번도 로그인 안 한 역대 회원의 아바타도 이걸로 가져올 수 있습니다.
// members.ts의 회원 명단 동기화에서 회원마다 한 번씩 호출됩니다.
// 반환값 null은 "확인해봤는데 아바타가 없음"(기본 아바타뿐이거나 탈퇴한
// 계정)이라는 확정적인 의미입니다. 일시적 실패(레이트리밋 소진, 5xx 등)는
// 대신 예외를 던져서, 호출부(members.ts)가 이전에 캐싱해둔 아바타를 함부로
// null로 덮어쓰지 않고 그대로 유지할 수 있게 구분해줍니다.
export type DiscordUserProfile = {
  avatarUrl: string | null; // 기본 아바타뿐이면 null
  displayName: string; // global_name(표시 이름) 우선, 없으면 username
};

// 봇 토큰으로 GET /users/{id}를 한 번 호출해서 아바타와 표시 이름을 같이 가져옵니다.
// 신규 가입 시 아바타와 닉네임 기본값이 둘 다 필요한데, 같은 응답에 들어있어서 한 번만
// 부르면 됩니다. 반환값 null은 "탈퇴/존재하지 않는 계정"이라는 확정적인 의미이고,
// 일시적 실패(레이트리밋 소진, 5xx 등)는 예외를 던져서 호출부가 구분할 수 있게 합니다
// (기존에 저장해둔 값을 함부로 지우지 않도록).
export async function fetchDiscordUserProfile(botToken: string, discordId: string): Promise<DiscordUserProfile | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (res.status === 429) {
      // 레이트리밋 — Retry-After만큼 한 번 기다렸다가 딱 한 번만 재시도합니다
      // (수백 명을 동기화하는 도중이라 무한 재시도는 곤란).
      const retryAfterSec = Number(res.headers.get("Retry-After")) || 1;
      await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
      continue;
    }
    if (res.status === 404) return null; // 탈퇴/존재하지 않는 계정
    if (!res.ok) throw new Error(`Discord user fetch failed: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as { id: string; username: string; global_name: string | null; avatar: string | null };
    const ext = data.avatar?.startsWith("a_") ? "gif" : "png";
    return {
      avatarUrl: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.${ext}` : null,
      displayName: data.global_name || data.username,
    };
  }
  throw new Error(`Discord user fetch rate-limited after retry: ${discordId}`);
}

// 아바타만 필요한 호출부(프로필 사진 일괄 갱신)를 위한 얇은 래퍼 — 반환값 규약은
// 위와 같습니다(null = 아바타 없음 확정, 예외 = 일시적 실패).
export async function fetchDiscordAvatarUrl(botToken: string, discordId: string): Promise<string | null> {
  const profile = await fetchDiscordUserProfile(botToken, discordId);
  return profile?.avatarUrl ?? null;
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

import type { Env } from "../types";

// Cloudflare Turnstile 토큰 검증. /apply 제출은 인증이 전혀 없는 공개 엔드포인트라
// (routes/applyForm.ts), 스팸이 그대로 구글 폼 응답 시트에 쌓이는 걸 막기 위한
// 유일한 방어선입니다.
//
// 검증은 반드시 서버에서 해야 합니다 — 브라우저가 위젯을 통과했다는 사실 자체는
// 위조할 수 있고, 토큰이 진짜인지는 이 siteverify 호출만 알 수 있습니다. 그리고
// siteverify는 CORS를 허용하지 않으므로 브라우저에서 직접 부를 수도 없습니다.
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteverifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

// 시크릿 키가 설정돼 있는지. 안 돼 있으면 호출부가 검증을 통째로 건너뜁니다 —
// 로컬 개발이나 키를 아직 등록하지 않은 배포에서 지원 폼이 죽지 않게 하기 위한
// 의도적인 fail-open입니다. 프로덕션에서는 반드시 시크릿을 등록하세요.
export function isTurnstileConfigured(env: Env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

// 토큰은 발급 후 5분간 유효하고 1회만 검증할 수 있습니다 — 같은 토큰을 다시
// 보내면 timeout-or-duplicate로 실패하므로, 프런트는 실패 시 위젯을 reset해서
// 새 토큰을 받아야 합니다.
export async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<boolean> {
  if (!token) return false;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });

    if (!res.ok) {
      console.error(`Turnstile siteverify HTTP ${res.status}`);
      return false;
    }

    const result = (await res.json()) as SiteverifyResponse;
    if (!result.success) {
      console.error(`Turnstile verification failed: ${result["error-codes"]?.join(", ") ?? "unknown"}`);
    }
    return result.success;
  } catch (err) {
    // 네트워크 오류 등으로 검증 자체를 못 한 경우입니다. 여기서 통과시키면
    // 검증을 우회할 길이 생기므로 막는 쪽(fail-closed)을 택합니다 — 시크릿이
    // 아예 없을 때의 fail-open과는 다른 상황입니다.
    console.error("Turnstile verification error", err);
    return false;
  }
}

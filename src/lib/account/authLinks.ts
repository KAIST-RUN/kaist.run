import type { Locale } from "@/i18n/routing";
import { withBasePath } from "@/lib/basePath";

// Cloudflare Worker(worker/ 폴더)가 같은 origin의 kaist.run/api/*로 처리하는
// 경로들입니다. 문자열을 여기서만 관리합니다.
//
// 로컬 개발 중에만: 메인 사이트(npm run dev, 보통 3000번 포트)와 Worker
// (worker && npm run dev, 보통 8787번 포트)가 서로 다른 포트라서, 프로덕션과
// 달리 상대경로 "/api/..."가 Worker에 안 닿습니다. .env.development.local에
// NEXT_PUBLIC_API_BASE_URL=http://localhost:8787 을 넣으면 로컬에서만 Worker로
// 직접 요청을 보냅니다. 반드시 .env.development.local을 쓰세요(.env.local
// 아님) — .env.local은 `next build`(프로덕션 빌드)에도 그대로 반영되지만,
// .env.development.local은 `next dev`에서만 적용되어 배포 빌드에 안 섞입니다.
function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

export function getMeEndpoint(): string {
  return `${getApiBase()}/api/me`;
}

export function getLogoutEndpoint(): string {
  return `${getApiBase()}/api/auth/logout`;
}

export function getUpdateHandlesEndpoint(): string {
  return `${getApiBase()}/api/me/handles`;
}

export function getUpdateNicknameEndpoint(): string {
  return `${getApiBase()}/api/me/nickname`;
}

export function getDiscordLoginHref(locale: Locale): string {
  const returnToPath = withBasePath(`/${locale}/my/`);
  // 절대 URL로 보냅니다 — Worker가 다른 origin(로컬에서는 다른 포트)에 있어도
  // Discord 로그인 후 정확히 이 사이트로 돌아오게 하기 위함입니다. 프로덕션에서도
  // 그냥 현재 origin(kaist.run)이 그대로 들어가니 동작은 동일합니다.
  const returnTo =
    typeof window !== "undefined" ? `${window.location.origin}${returnToPath}` : returnToPath;
  return `${getApiBase()}${withBasePath(`/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`)}`;
}

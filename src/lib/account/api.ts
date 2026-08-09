import type { CurrentUserState } from "@/types/account";
import { getLogoutEndpoint, getMeEndpoint, getUpdateHandlesEndpoint } from "./authLinks";

// -----------------------------------------------------------------------------
// 개발 중 mock 사용법 (프로덕션 빌드에는 영향 없음)
//
// 이 사이트는 output: "export"라 로컬에서 실제 /api/me를 호출할 서버가 없습니다.
// UI를 mock 데이터로 미리 확인하려면 프로젝트 루트에 .env.local(git에 커밋되지
// 않음)을 만들고 아래 두 값을 설정한 뒤 `npm run dev`를 (재)시작하세요.
//
//   NEXT_PUBLIC_USE_MOCK_ME=1
//   NEXT_PUBLIC_MOCK_ME_STATE=signed-in-member   # mockCurrentUser.ts의 MOCK_STATES 키
//
// `next build`는 항상 NODE_ENV=production으로 실행되므로, 아래 mock 분기는
// 프로덕션 번들에서 정적으로 제거됩니다(NODE_ENV==="development" 비교가 빌드
// 시점에 false로 치환되어 dead code가 됨) — 즉 실제 배포본은 항상 진짜
// /api/me를 호출합니다.
// -----------------------------------------------------------------------------

async function fetchCurrentUserMock(): Promise<CurrentUserState> {
  const { MOCK_STATES, DEFAULT_MOCK_STATE_KEY } = await import("./mockCurrentUser");
  const key = process.env.NEXT_PUBLIC_MOCK_ME_STATE ?? DEFAULT_MOCK_STATE_KEY;
  const state = MOCK_STATES[key] ?? MOCK_STATES[DEFAULT_MOCK_STATE_KEY];

  // 스켈레톤 UI를 실제로 눈으로 볼 수 있도록 약간의 지연을 둡니다.
  await new Promise((resolve) => setTimeout(resolve, 500));
  return state;
}

function isUseMockEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_MOCK_ME === "1";
}

export async function fetchCurrentUser(): Promise<CurrentUserState> {
  if (isUseMockEnabled()) {
    return fetchCurrentUserMock();
  }

  try {
    const res = await fetch(getMeEndpoint(), {
      credentials: "include",
      cache: "no-store",
    });

    if (res.status === 401) return { status: "signed-out" };
    if (res.status === 403) return { status: "forbidden" };
    if (!res.ok) return { status: "error" };

    const user = await res.json();
    if (!user || typeof user !== "object" || typeof user.discordId !== "string") {
      return { status: "error" };
    }

    return { status: "signed-in", user };
  } catch {
    return { status: "error" };
  }
}

export type HandlesInput = { solvedAc: string; codeforces: string; atcoder: string };

// 마이페이지 UserInfoCard의 연필 아이콘 → 저장. 성공하면 호출부가
// useCurrentUser().refetch()로 화면을 최신화합니다.
export async function updateHandles(handles: HandlesInput): Promise<boolean> {
  if (isUseMockEnabled()) {
    // mock 모드는 고정 fixture라 실제로 저장되진 않지만, 저장 버튼 자체의
    // 로딩/성공 흐름은 그대로 눈으로 확인할 수 있게 성공으로 처리합니다.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return true;
  }

  try {
    const res = await fetch(getUpdateHandlesEndpoint(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(handles),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function logout(): Promise<boolean> {
  if (isUseMockEnabled()) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return true;
  }

  try {
    const res = await fetch(getLogoutEndpoint(), {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

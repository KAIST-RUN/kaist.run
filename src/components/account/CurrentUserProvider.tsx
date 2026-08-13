"use client";

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import type { CurrentUserState } from "@/types/account";
import { fetchCurrentUser, isUseMockEnabled, logout } from "@/lib/account/api";
import { clearCachedUser, readCachedUser, writeCachedUser } from "@/lib/account/meCache";

export type CurrentUserContextValue = {
  state: CurrentUserState;
  refetch: () => void;
  signOut: () => Promise<boolean>;
};

export const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

// 헤더의 계정 버튼과 /my 페이지 본문이 같은 페이지 로드에서 동시에 로그인 상태를
// 필요로 하기 때문에, /api/me 요청을 여기서 한 번만 실행하고 Context로 공유합니다.
// (src/app/layout.tsx의 next-themes ThemeProvider와 같은 방식의 Context 사용입니다.)
//
// stale-while-revalidate: 지난 /api/me 응답이 localStorage에 있으면(meCache.ts) 마운트
// 즉시 그걸로 signed-in을 렌더하고, 백그라운드 fetch가 도착하면 교정합니다. 전체 페이지
// 로드마다 스켈레톤으로 몇 초씩 기다리던 것이 재방문에선 즉시 표시로 바뀝니다. 권한이
// 바뀌었으면 잠깐 이전 상태가 보일 수 있지만, 실제 권한 판정은 항상 서버가 세션 기준으로
// 하므로(worker의 requireSession/requireAdmin) 표시 이상의 의미는 없습니다.
export default function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CurrentUserState>({ status: "loading" });
  const requestId = useRef(0);

  const runFetch = useCallback(() => {
    const id = ++requestId.current;
    fetchCurrentUser().then((result) => {
      if (requestId.current !== id) return;

      if (!isUseMockEnabled()) {
        if (result.status === "signed-in") writeCachedUser(result.user);
        else if (result.status === "signed-out" || result.status === "forbidden") clearCachedUser();
        // "error"(네트워크 문제 등)는 로그아웃 증거가 아니므로 캐시를 지우지 않습니다.
      }

      // 캐시로 이미 signed-in을 보여주고 있는데 재검증이 일시 오류라면, 멀쩡히 보이던
      // 화면을 에러 화면으로 갈아치우지 않고 그대로 둡니다.
      setState((prev) => (result.status === "error" && prev.status === "signed-in" ? prev : result));
    });
  }, []);

  useEffect(() => {
    // mock 경로(NEXT_PUBLIC_USE_MOCK_ME)는 픽스처 전환 확인용이라 캐시와 완전히 분리합니다.
    // 캐시 읽기를 effect 안에서만 하는 이유: 정적 HTML(서버 렌더 시점엔 localStorage가
    // 없음)과 첫 클라이언트 렌더가 달라지면 하이드레이션 불일치가 나기 때문입니다.
    if (!isUseMockEnabled()) {
      const cached = readCachedUser();
      if (cached) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 하이드레이션 직후 1회, 캐시 즉시 표시용
        setState({ status: "signed-in", user: cached });
      }
    }
    runFetch();
  }, [runFetch]);

  // 재시도(retry) 버튼 클릭 등 이벤트 핸들러에서 호출됩니다 — effect 본문이 아니므로
  // 여기서 setState를 동기 호출해도 안전합니다.
  const refetch = useCallback(() => {
    setState({ status: "loading" });
    runFetch();
  }, [runFetch]);

  const signOut = useCallback(async () => {
    const ok = await logout();
    if (ok) {
      clearCachedUser();
      setState({ status: "signed-out" });
    }
    return ok;
  }, []);

  return (
    <CurrentUserContext.Provider value={{ state, refetch, signOut }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

"use client";

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import type { CurrentUserState } from "@/types/account";
import { fetchCurrentUser, logout } from "@/lib/account/api";

export type CurrentUserContextValue = {
  state: CurrentUserState;
  refetch: () => void;
  signOut: () => Promise<boolean>;
};

export const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

// 헤더의 계정 버튼과 /my 페이지 본문이 같은 페이지 로드에서 동시에 로그인 상태를
// 필요로 하기 때문에, /api/me 요청을 여기서 한 번만 실행하고 Context로 공유합니다.
// (src/app/layout.tsx의 next-themes ThemeProvider와 같은 방식의 Context 사용입니다.)
export default function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CurrentUserState>({ status: "loading" });
  const requestId = useRef(0);

  // 실제 요청(fetch)만 시작할 뿐, 여기서는 setState를 동기적으로 호출하지 않습니다
  // (마운트 effect에서 바로 호출되므로, 로딩 상태를 다시 세팅할 필요도 없습니다 —
  // useState의 초기값이 이미 "loading"입니다).
  const runFetch = useCallback(() => {
    const id = ++requestId.current;
    fetchCurrentUser().then((result) => {
      if (requestId.current === id) setState(result);
    });
  }, []);

  useEffect(() => {
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
    if (ok) setState({ status: "signed-out" });
    return ok;
  }, []);

  return (
    <CurrentUserContext.Provider value={{ state, refetch, signOut }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

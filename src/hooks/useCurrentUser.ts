"use client";

import { useContext } from "react";
import { CurrentUserContext, type CurrentUserContextValue } from "@/components/account/CurrentUserProvider";

// 로그인 상태(및 refetch/signOut)를 읽는 유일한 진입점입니다.
// 내부적으로는 CurrentUserProvider가 페이지당 한 번만 /api/me를 호출하고
// 그 결과를 이 훅으로 공유합니다.
export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error("useCurrentUser() must be used within a <CurrentUserProvider>.");
  }
  return ctx;
}

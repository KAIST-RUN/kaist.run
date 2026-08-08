"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

// backstage.kaist.run(별도 오리진, worker/src/lib/emailRender.ts가 서버에서 그려주는
// 순수 HTML)과 라이트/다크 설정을 맞추기 위한 다리입니다. next-themes 자체는
// localStorage만 쓰기 때문에 서브도메인끼리 공유가 안 되므로, Domain=.kaist.run
// 쿠키에 명시적 선택을 같이 적어둡니다. 쿠키 이름/형식은 emailRender.ts의
// THEME_INIT_SCRIPT · THEME_TOGGLE_SCRIPT와 반드시 맞춰야 합니다.
const COOKIE_NAME = "kr-theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function cookieDomainAndSecure(): string {
  const host = window.location.hostname;
  const onKaistRun = host === "kaist.run" || host.endsWith(".kaist.run");
  return onKaistRun ? "; domain=.kaist.run; secure" : "";
}

function readCookie(name: string): string | null {
  const parts = `; ${document.cookie}`.split(`; ${name}=`);
  if (parts.length !== 2) return null;
  return parts.pop()?.split(";").shift() ?? null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${cookieDomainAndSecure()}`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0${cookieDomainAndSecure()}`;
}

export default function ThemeCookieSync() {
  const { theme, setTheme } = useTheme();

  // 마운트 시 한 번, backstage 등 다른 서브도메인에서 명시적으로 바꿔둔 값이 있으면
  // 이 사이트의 로컬 설정(localStorage)보다 그 값을 우선합니다.
  useEffect(() => {
    const cookie = readCookie(COOKIE_NAME);
    if ((cookie === "light" || cookie === "dark") && cookie !== theme) {
      setTheme(cookie);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 이 사이트에서 테마가 바뀔 때마다 쿠키에도 반영해서 backstage.kaist.run이 같은
  // 값을 읽게 합니다. "system"은 명시적 선택이 없다는 뜻이라 쿠키를 지워서,
  // backstage도 다시 시스템 설정을 따르게 합니다.
  useEffect(() => {
    if (theme === "light" || theme === "dark") {
      writeCookie(COOKIE_NAME, theme);
    } else if (theme === "system") {
      clearCookie(COOKIE_NAME);
    }
  }, [theme]);

  return null;
}

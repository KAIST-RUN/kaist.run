"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile 위젯. /apply 제출은 인증 없는 공개 엔드포인트라 봇 검증이
// 유일한 방어선입니다(실제 검증은 서버에서 — worker/src/lib/turnstile.ts).
//
// implicit 렌더링(class="cf-turnstile" + data-callback="전역함수명")을 쓰지 않고
// explicit 렌더링을 쓰는 이유: 콜백을 전역 함수 이름으로 넘겨야 해서 React 상태와
// 엮기가 지저분하고, 위젯 제거 시점을 우리가 통제할 수 없기 때문입니다.
//
// 위젯은 기본적으로 폼 안에 hidden input(name="cf-turnstile-response")을 심어
// 주므로, 제출할 때 new FormData(form)이 토큰을 자동으로 실어 갑니다 — 그래서
// onToken으로 받는 토큰은 "제출 버튼을 열어줄지" 판단에만 씁니다.

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileOptions = {
  sitekey: string;
  language?: string;
  theme?: "auto" | "light" | "dark";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
};

type TurnstileApi = {
  render: (el: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// 스크립트는 페이지당 한 번만 넣습니다. 이미 있으면 그 태그의 load를 기다리고,
// 벌써 로드가 끝났으면 즉시 resolve합니다.
function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile script failed")));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("turnstile script failed")));
    document.head.appendChild(script);
  });
}

export type TurnstileHandle = { reset: () => void };

export default function TurnstileWidget({
  siteKey,
  locale,
  onToken,
  handleRef,
}: {
  siteKey: string;
  locale: string;
  onToken: (token: string | null) => void;
  // 제출이 실패했을 때 부모가 위젯을 리셋할 수 있게 넘겨받는 핸들입니다 —
  // 토큰은 1회용이라, 리셋하지 않으면 재시도가 항상 실패합니다.
  handleRef?: React.RefObject<TurnstileHandle | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // 콜백이 바뀔 때마다 위젯을 새로 그리지 않도록 ref에 담아 둡니다(effect는
  // siteKey/locale이 바뀔 때만 다시 돌아야 합니다).
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          language: locale,
          theme: "auto",
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onTokenRef.current(null),
          "expired-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        // 스크립트를 못 받아온 경우(네트워크 차단 등). 토큰이 영영 안 생기므로
        // 제출 버튼은 잠긴 채로 남습니다 — 조용히 통과시키면 검증이 무의미해집니다.
        if (!cancelled) onTokenRef.current(null);
      });

    // StrictMode의 이중 마운트에서 위젯이 두 개 남지 않도록 반드시 제거합니다.
    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, locale]);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      reset: () => {
        const id = widgetIdRef.current;
        if (id && window.turnstile) {
          window.turnstile.reset(id);
          onTokenRef.current(null);
        }
      },
    };
  }, [handleRef]);

  return <div ref={containerRef} />;
}

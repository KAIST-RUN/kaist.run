"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getDiscordLoginHref } from "@/lib/account/authLinks";

const PILL_CLASS =
  "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-black/10 px-3 text-xs font-semibold transition-opacity hover:opacity-70 dark:border-white/10";

export default function AccountButton() {
  const t = useTranslations("account.header");
  const locale = useLocale() as Locale;
  const { state } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 포털(document.body)로 모달을 렌더링하려면 클라이언트에 마운트된 뒤여야
    // 합니다(SSR에는 document가 없음) — 이 딱 한 번의 마운트 신호는 effect
    // 바깥에서 만들 방법이 없습니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (state.status === "loading") {
    // 높이는 로그인/로그아웃 상태와 동일하게 고정해 헤더가 세로로 흔들리지 않게 합니다.
    // 폭은 실제 라벨이 정해지면 바뀝니다.
    return (
      <span
        aria-hidden="true"
        className="inline-block h-9 w-9 shrink-0 rounded-full border border-black/10 opacity-40 dark:border-white/10"
      />
    );
  }

  if (state.status === "signed-in") {
    return (
      <Link href="/my" className={`${PILL_CLASS} animate-fade-in`}>
        {t("myPage")}
      </Link>
    );
  }

  // signed-out | forbidden | error 모두 "지원/로그인" 버튼으로 처리합니다.
  // 가입 신청(내부 페이지)과 Discord 로그인(Worker로 나가는 실제 이동)을
  // 한 버튼 뒤 모달에 모아서, 헤더에 버튼이 따로따로 늘어서지 않게 합니다.
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${PILL_CLASS} animate-fade-in`}
      >
        {t("joinOrSignIn")}
      </button>

      {mounted &&
        createPortal(
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-300 ease-in-out ${
              open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={() => setOpen(false)}
            aria-hidden={!open}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("modal.heading")}
              inert={!open}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-sm rounded-2xl border border-black/10 bg-[var(--background)] p-6 shadow-xl transition-transform duration-300 ease-in-out dark:border-white/15 ${
                open ? "scale-100" : "scale-95"
              }`}
            >
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-sm opacity-80">{t("modal.joinQuestion")}</p>
                  <Link
                    href="/apply"
                    onClick={() => setOpen(false)}
                    className="mt-3 flex w-full items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-80"
                  >
                    {t("modal.joinCta")}
                  </Link>
                </div>

                <div>
                  <p className="text-sm opacity-80">{t("modal.loginQuestion")}</p>
                  <a
                    href={getDiscordLoginHref(locale)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#5865F2] px-4 py-2 font-semibold text-white transition-opacity hover:opacity-80"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/Discord-Symbol-White.svg" alt="" className="h-4 w-auto" />
                    {t("modal.loginCta")}
                  </a>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

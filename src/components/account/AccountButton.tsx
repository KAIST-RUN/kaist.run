"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getDiscordLoginHref } from "@/lib/account/authLinks";
import { avatarInitial } from "@/lib/account/display";
import DoorIcon from "./DoorIcon";

// 헤더의 계정 자리는 로그인 여부와 상관없이 항상 같은 원입니다 — 로그인 상태면 프로필
// 사진(없으면 이니셜), 비로그인 상태면 들어가기 아이콘. 로딩 스켈레톤까지 셋 다 지름이 같아서
// /api/me 응답이 도착하는 순간에도 헤더가 가로로 밀리지 않습니다.
const CIRCLE_CLASS =
  "inline-flex h-9 w-9 shrink-0 animate-fade-in items-center justify-center overflow-hidden rounded-full border border-black/10 bg-black/[.03] transition-opacity hover:opacity-70 dark:border-white/10 dark:bg-white/[.05]";

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
    // 로그인/비로그인 어느 쪽으로 확정되든 같은 크기의 원(CIRCLE_CLASS)이 되므로,
    // 이 스켈레톤과 지름을 맞춰두면 /api/me 응답이 도착해도 헤더가 전혀 흔들리지 않습니다.
    return (
      <span
        aria-hidden="true"
        className="inline-block h-9 w-9 shrink-0 rounded-full border border-black/10 opacity-40 dark:border-white/10"
      />
    );
  }

  if (state.status === "signed-in") {
    // 로그인 상태에서는 "마이페이지" 글자 대신 프로필 사진만 띄웁니다. 글자가 사라지므로
    // 접근성 이름은 aria-label로 남겨야 합니다(스크린리더가 읽을 게 없어짐) — img의
    // alt는 빈 문자열로 둬서 링크 이름이 두 번 읽히지 않게 합니다.
    // 사진이 없는 회원은 마이페이지 프로필 카드와 똑같은 이니셜 원으로 대체합니다.
    const { user } = state;
    return (
      <Link href="/my" aria-label={t("myPage")} title={t("myPage")} className={CIRCLE_CLASS}>
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true" className="text-xs font-bold opacity-60">
            {avatarInitial(user)}
          </span>
        )}
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
        aria-label={t("joinOrSignIn")}
        title={t("joinOrSignIn")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={CIRCLE_CLASS}
      >
        <DoorIcon />
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

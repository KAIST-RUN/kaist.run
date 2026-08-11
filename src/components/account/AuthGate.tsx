"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getDiscordLoginHref } from "@/lib/account/authLinks";
import type { CurrentUser } from "@/types/account";

const PRIMARY_BUTTON_CLASS =
  "mt-2 rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-80 sm:text-base";

const DISCORD_BUTTON_CLASS =
  "mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-[#5865F2] px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-80 sm:text-base";

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`rounded-2xl bg-black/[.04] dark:bg-white/[.05] ${className}`} />;
}

// 관리자 권한까지는 필요 없고 "로그인한 회원이면 누구나" 볼 수 있어야 하는
// 페이지(게시판 등)를 위한 공통 게이트입니다. MyPageContent.tsx의 loading/
// signed-out/forbidden/error 화면을 그대로 뽑아온 것 — 로그인 확인된 사람에게만
// children을 렌더링합니다. (마이페이지 자체는 페이지 제목 등 자기만의 레이아웃이
// 있어서 그대로 두고 여기로 옮기지 않았습니다 — 동작은 100% 동일합니다.)
export default function AuthGate({ children }: { children: (user: CurrentUser) => ReactNode }) {
  const t = useTranslations("account");
  const locale = useLocale() as Locale;
  const { state, refetch } = useCurrentUser();

  if (state.status === "loading") {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">{t("loading")}</span>
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-16" />
      </div>
    );
  }

  if (state.status === "signed-out") {
    return (
      <div className="animate-fade-in flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-lg font-bold sm:text-xl">{t("signInRequired.title")}</p>
          <p className="text-sm opacity-70 sm:text-base">{t("signInRequired.body")}</p>
        </div>
        <a href={getDiscordLoginHref(locale)} className={DISCORD_BUTTON_CLASS}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Discord-Symbol-White.svg" alt="" className="h-4 w-auto" />
          {t("signInRequired.cta")}
        </a>
      </div>
    );
  }

  if (state.status === "forbidden") {
    return (
      <div className="animate-fade-in flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-lg font-bold sm:text-xl">{t("forbidden.title")}</p>
          <p className="text-sm opacity-70 sm:text-base">{t("forbidden.body")}</p>
        </div>
        <Link
          href="/"
          className="w-fit rounded-full border border-black/10 px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-70 dark:border-white/15"
        >
          {t("backHome")}
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="animate-fade-in flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-lg font-bold sm:text-xl">{t("error.title")}</p>
          <p className="text-sm opacity-70 sm:text-base">{t("error.body")}</p>
        </div>
        <button type="button" onClick={refetch} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
          {t("error.retry")}
        </button>
      </div>
    );
  }

  return <>{children(state.user)}</>;
}

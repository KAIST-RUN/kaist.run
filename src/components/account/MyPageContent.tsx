"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getDiscordLoginHref } from "@/lib/account/authLinks";
import UserProfileCard from "./UserProfileCard";
import UserInfoCard from "./UserInfoCard";
import RunforceCard from "./RunforceCard";
import AccountMenu from "./AccountMenu";

const PRIMARY_BUTTON_CLASS =
  "mt-2 rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-80 sm:text-base";

const DISCORD_BUTTON_CLASS =
  "mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-[#5865F2] px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-80 sm:text-base";

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`rounded-2xl bg-black/[.04] dark:bg-white/[.05] ${className}`} />;
}

export default function MyPageContent() {
  const t = useTranslations("account");
  const locale = useLocale() as Locale;
  const { state, refetch } = useCurrentUser();
  const [notMember, setNotMember] = useState(false);

  // OAuth 리다이렉트가 남긴 ?authError=not_member를 한 번만 확인하고 URL에서 지웁니다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("authError") === "not_member") {
      // 정적 export라 이 값은 서버에서 미리 알 수 없어, 마운트 후 브라우저에서
      // URL을 한 번 읽어 반영하는 것 외에 다른 방법이 없습니다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotMember(true);
      params.delete("authError");
      const query = params.toString();
      const cleanUrl = window.location.pathname + (query ? `?${query}` : "");
      window.history.replaceState(null, "", cleanUrl);
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-6 py-12 sm:px-10 sm:py-16">
      <h1 className="animate-fade-in-up text-3xl font-bold sm:text-4xl">{t("pageTitle")}</h1>

      {state.status === "loading" && (
        <div role="status" aria-busy="true" className="flex flex-col gap-5">
          <span className="sr-only">{t("loading")}</span>
          <SkeletonBlock className="h-28 sm:h-24" />
          <SkeletonBlock className="h-40" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      )}

      {state.status === "signed-out" && (
        <div className="animate-fade-in flex flex-col gap-4">
          {notMember && (
            <div
              role="alert"
              className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400"
            >
              <p className="font-bold">{t("notMember.title")}</p>
              <p className="mt-1 opacity-90">{t("notMember.body")}</p>
            </div>
          )}
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
      )}

      {state.status === "forbidden" && (
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
      )}

      {state.status === "error" && (
        <div className="animate-fade-in flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-lg font-bold sm:text-xl">{t("error.title")}</p>
            <p className="text-sm opacity-70 sm:text-base">{t("error.body")}</p>
          </div>
          <button type="button" onClick={refetch} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
            {t("error.retry")}
          </button>
        </div>
      )}

      {state.status === "signed-in" && (
        <div className="flex flex-col gap-6">
          <div className="animate-fade-in-up" style={{ animationDelay: "60ms" }}>
            <UserProfileCard user={state.user} />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: "120ms" }}>
            <UserInfoCard user={state.user} />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: "180ms" }}>
            <RunforceCard user={state.user} />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: "240ms" }}>
            <AccountMenu user={state.user} />
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

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

  // signed-out | forbidden | error 모두 "로그인" 버튼으로 처리합니다.
  // Discord OAuth는 이 사이트 밖(Worker)으로 나가는 실제 이동이라 next-intl의
  // Link가 아니라 일반 <a>를 씁니다.
  return (
    <a href={getDiscordLoginHref(locale)} className={`${PILL_CLASS} animate-fade-in`}>
      {t("signIn")}
    </a>
  );
}

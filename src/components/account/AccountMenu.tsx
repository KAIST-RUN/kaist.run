"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { CurrentUser } from "@/types/account";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import ScrollTopLink from "@/components/layout/ScrollTopLink";
import LocaleSwitcher from "@/components/layout/LocaleSwitcher";

export default function AccountMenu({ user }: { user: CurrentUser }) {
  const t = useTranslations("account.menu");
  const router = useRouter();
  const { signOut } = useCurrentUser();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  async function handleLogout() {
    setIsSigningOut(true);
    setLogoutError(false);
    const ok = await signOut();
    setIsSigningOut(false);
    if (ok) {
      router.push("/");
    } else {
      setLogoutError(true);
    }
  }

  // 관리자 전용 메뉴 항목을 추가하는 자리입니다. 지금은 backstage(관리자 패널) 링크
  // 하나뿐이고, 나중에 필요하면 이 배열에 더 채워서 아래 메뉴 뒤에 렌더링하면 됩니다.
  // 주의: role에 따른 프런트엔드 노출 여부는 편의 기능일 뿐입니다.
  // 실제 관리자 API는 반드시 서버(Worker)에서 세션 기준으로 admin 권한을 다시 검사해야 합니다
  // (backstage.kaist.run도 마찬가지로 접속 시 서버에서 다시 확인합니다).
  const adminMenuItems: React.ReactNode[] =
    user.role === "admin"
      ? [
          <a
            key="admin-panel"
            href="https://backstage.kaist.run"
            className="text-sm font-semibold opacity-70 transition-opacity hover:opacity-100"
          >
            {t("adminPanel")}
          </a>,
        ]
      : [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold opacity-70">{t("language")}</span>
        <LocaleSwitcher />
      </div>

      <div className="h-px bg-black/10 dark:bg-white/10" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScrollTopLink
          href="/"
          className="text-sm font-semibold opacity-70 transition-opacity hover:opacity-100"
        >
          {t("home")}
        </ScrollTopLink>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isSigningOut}
          className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-70 disabled:opacity-50 dark:border-white/15"
        >
          {t("logout")}
        </button>
      </div>

      {logoutError && (
        <p className="text-sm font-medium text-red-500" role="alert">
          {t("logoutError")}
        </p>
      )}

      {adminMenuItems}
    </div>
  );
}

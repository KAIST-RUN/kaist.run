import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import Nav from "./Nav";
import MobileNav from "./MobileNav";
import LocaleSwitcher from "./LocaleSwitcher";
import ThemeToggle from "./ThemeToggle";
import Logo from "@/components/Logo";

export default async function Header({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "site" });

  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-black/10 px-8 pt-2 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-20 sm:pt-3 sm:pb-5 lg:px-32 dark:border-white/10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MobileNav />
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Logo className="h-8 w-auto sm:h-10" />
            <span className="sr-only">{t("name")}</span>
          </Link>
        </div>
        <div className="flex translate-y-1 items-center gap-2 sm:hidden">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
      <div className="hidden items-center gap-4 sm:flex sm:translate-y-1 sm:gap-6">
        <Nav />
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import Nav from "./Nav";
import LocaleSwitcher from "./LocaleSwitcher";
import ThemeToggle from "./ThemeToggle";
import Logo from "@/components/Logo";

export default async function Header({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "site" });

  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-black/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8 sm:py-4 lg:px-12 dark:border-white/10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Logo className="h-5 w-auto sm:h-6" />
          <span className="sr-only">{t("name")}</span>
          <span className="hidden text-xs font-normal opacity-60 sm:inline sm:text-sm">
            {t("tagline")}
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:hidden">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
      <div className="flex items-center gap-4 sm:gap-6">
        <Nav />
        <div className="hidden items-center gap-2 sm:flex">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

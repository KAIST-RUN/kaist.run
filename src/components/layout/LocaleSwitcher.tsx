"use client";

import { useLocale } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 text-xs font-medium">
      {routing.locales.map((loc, i) => (
        <span key={loc} className="flex items-center gap-1">
          {i > 0 && <span className="opacity-30">/</span>}
          <Link
            href={pathname}
            locale={loc}
            onClick={() => window.localStorage.setItem("NEXT_LOCALE", loc)}
            aria-current={loc === locale}
            className={
              loc === locale
                ? "opacity-100"
                : "opacity-50 transition-opacity hover:opacity-80"
            }
          >
            {loc.toUpperCase()}
          </Link>
        </span>
      ))}
    </div>
  );
}

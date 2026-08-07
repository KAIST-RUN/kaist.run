import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NAV_ITEMS } from "./nav-items";
import ScrollTopLink from "./ScrollTopLink";

export default async function Nav() {
  const t = await getTranslations("nav");

  return (
    <nav className="flex items-center gap-3 text-sm sm:gap-5 sm:text-base">
      {NAV_ITEMS.map((item) => {
        const ItemLink = item.href === "/" ? ScrollTopLink : Link;
        return (
          <ItemLink
            key={item.href}
            href={item.href}
            className="whitespace-nowrap px-1 py-2 opacity-80 transition-opacity hover:opacity-100"
          >
            {t(item.key)}
          </ItemLink>
        );
      })}
    </nav>
  );
}

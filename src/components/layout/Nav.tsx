import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const ITEMS = [
  { href: "/about", key: "about" },
  { href: "/notices", key: "notices" },
  { href: "/archive", key: "archive" },
  { href: "/contact", key: "contact" },
] as const;

export default async function Nav() {
  const t = await getTranslations("nav");

  return (
    <nav className="flex items-center justify-center gap-3 text-sm sm:justify-end sm:gap-5 sm:text-base">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="whitespace-nowrap px-1 py-2 opacity-80 transition-opacity hover:opacity-100"
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAllNotices } from "@/lib/content/notices";

export default async function NoticesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("notices");
  const notices = getAllNotices(locale as Locale);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <h1 className="text-3xl font-bold">{t("title")}</h1>

      {notices.length === 0 ? (
        <p className="mt-8 opacity-60">{t("empty")}</p>
      ) : (
        <ul className="mt-8 flex flex-col divide-y divide-black/10 dark:divide-white/10">
          {notices.map((notice) => (
            <li key={notice.slug}>
              <Link
                href={`/notices/${notice.slug}`}
                className={`-mx-4 flex flex-col gap-1 rounded-lg px-4 py-4 transition-colors duration-200 hover:bg-black/[.05] sm:flex-row sm:items-baseline sm:justify-between dark:hover:bg-white/[.07] ${
                  notice.pinned ? "bg-black/[.03] dark:bg-white/[.05]" : ""
                }`}
              >
                <span className={notice.pinned ? "font-bold" : "font-medium"}>
                  {notice.pinned && "📌 "}
                  {notice.title}
                </span>
                <span className="text-xs opacity-60">{notice.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

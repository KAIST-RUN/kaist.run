import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPinnedNotice, getRecentNotices } from "@/lib/content/notices";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("home");
  const tSite = await getTranslations("site");
  const tNotices = await getTranslations("notices");
  const pinnedNotice = getPinnedNotice(locale as Locale);
  const recentNotices = getRecentNotices(locale as Locale, 3);

  return (
    <div className="flex h-full flex-col">
      {pinnedNotice && (
        <Link
          href={`/notices/${pinnedNotice.slug}`}
          className="flex shrink-0 items-center justify-center gap-2 border-b border-black/10 bg-black/[.03] px-4 py-2 text-center text-sm transition-colors hover:bg-black/[.05] sm:px-8 dark:border-white/10 dark:bg-white/[.04] dark:hover:bg-white/[.07]"
        >
          <span className="shrink-0 font-semibold">📢 {t("bannerLabel")}</span>
          <span className="truncate">{pinnedNotice.title}</span>
        </Link>
      )}

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-6 py-6 sm:gap-10 sm:px-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <span className="text-xs font-bold tracking-[0.2em] opacity-50">{t("since")}</span>
          <h1 className="flex flex-col items-center gap-1">
            <span className="text-5xl font-black tracking-tight sm:text-7xl">
              {tSite("name")}
            </span>
            <span className="text-lg font-semibold tracking-tight opacity-70 sm:text-2xl">
              {tSite("tagline")}
            </span>
          </h1>
          <p className="text-base opacity-70 sm:text-lg">{t("heroSubtitle")}</p>
          <p className="text-sm leading-relaxed opacity-60">{t("description")}</p>
        </div>

        <div className="w-full max-w-4xl">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold">{t("recentNews")}</span>
            <Link href="/notices" className="text-xs opacity-60 transition-opacity hover:opacity-100">
              {t("viewAll")} →
            </Link>
          </div>

          {recentNotices.length === 0 ? (
            <p className="mt-3 text-sm opacity-50">{tNotices("empty")}</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {recentNotices.map((notice) => (
                <Link
                  key={notice.slug}
                  href={`/notices/${notice.slug}`}
                  className="flex min-w-0 flex-col gap-1 rounded-xl border border-black/10 p-4 transition-colors hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/[.04]"
                >
                  <span className="text-xs opacity-50">{notice.date}</span>
                  <span className="truncate text-sm font-medium">{notice.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

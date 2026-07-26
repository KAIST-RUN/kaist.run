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
          className="animate-fade-in-up flex shrink-0 items-center justify-center gap-2 border-b border-black/10 bg-black/[.03] px-4 py-2 text-center text-sm transition-colors hover:bg-black/[.05] sm:px-8 dark:border-white/10 dark:bg-white/[.04] dark:hover:bg-white/[.07]"
        >
          <span className="shrink-0 font-semibold">📢 {t("bannerLabel")}</span>
          <span className="truncate">{pinnedNotice.title}</span>
        </Link>
      )}

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-6 py-6 sm:gap-10 sm:px-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <span className="animate-fade-in-up text-xs font-bold tracking-[0.2em] opacity-50 sm:text-sm">
            {t("since")}
          </span>
          <h1 className="flex flex-col items-center gap-1">
            <span
              className="animate-fade-in-up text-5xl font-black tracking-tight sm:text-7xl"
              style={{ animationDelay: "80ms" }}
            >
              {tSite("name")}
            </span>
            <span
              className="animate-fade-in-up text-lg font-semibold tracking-tight opacity-70 sm:text-2xl"
              style={{ animationDelay: "160ms" }}
            >
              {tSite("tagline")}
            </span>
          </h1>
          <p
            className="animate-fade-in-up text-base opacity-70 sm:text-lg"
            style={{ animationDelay: "240ms" }}
          >
            {t("heroSubtitle")}
          </p>
          <p
            className="animate-fade-in-up text-sm leading-relaxed opacity-60 sm:text-base"
            style={{ animationDelay: "320ms" }}
          >
            {t("description")}
          </p>
        </div>

        <div className="w-full max-w-4xl animate-fade-in-up" style={{ animationDelay: "400ms" }}>
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold sm:text-base">{t("recentNews")}</span>
            <Link
              href="/notices"
              className="text-xs opacity-60 transition-opacity hover:opacity-100 sm:text-sm"
            >
              {t("viewAll")} →
            </Link>
          </div>

          {recentNotices.length === 0 ? (
            <p className="mt-3 text-sm opacity-50">{tNotices("empty")}</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {recentNotices.map((notice, i) => (
                <Link
                  key={notice.slug}
                  href={`/notices/${notice.slug}`}
                  className="animate-fade-in-up flex min-w-0 flex-col gap-1 rounded-xl border border-black/10 p-4 transition-colors hover:-translate-y-0.5 hover:bg-black/[.03] hover:shadow-md dark:border-white/10 dark:hover:bg-white/[.04]"
                  style={{ animationDelay: `${440 + i * 80}ms` }}
                >
                  <span className="text-xs opacity-50 sm:text-sm">{notice.date}</span>
                  <span className="truncate text-sm font-medium sm:text-base">{notice.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

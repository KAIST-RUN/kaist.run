import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SEASONS, getAllArchiveEntries } from "@/lib/content/archive";

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("archive");

  const seasonCounts = await Promise.all(
    SEASONS.map(async (season) => ({
      season,
      count: (await getAllArchiveEntries(locale as Locale, season)).length,
    })),
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      <h1 className="animate-fade-in-up text-3xl font-bold sm:text-4xl">{t("title")}</h1>
      <p
        className="animate-fade-in-up mt-3 text-base opacity-70 sm:text-lg"
        style={{ animationDelay: "80ms" }}
      >
        {t("description")}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {seasonCounts.map(({ season, count }, i) => (
          <Link
            key={season}
            href={`/archive/${season}`}
            className="animate-fade-in-up flex flex-col gap-1 rounded-xl border border-black/10 p-5 transition-colors duration-200 hover:-translate-y-0.5 hover:bg-black/[.05] hover:shadow-md sm:p-6 dark:border-white/10 dark:hover:bg-white/[.07]"
            style={{ animationDelay: `${160 + i * 80}ms` }}
          >
            <span className="text-lg font-semibold sm:text-xl">{t(season)}</span>
            <span className="text-xs opacity-60 sm:text-sm">{count}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

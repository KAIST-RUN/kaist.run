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

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-3 opacity-70">{t("description")}</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SEASONS.map((season) => {
          const count = getAllArchiveEntries(locale as Locale, season).length;
          return (
            <Link
              key={season}
              href={`/archive/${season}`}
              className="flex flex-col gap-1 rounded-xl border border-black/10 p-5 transition-colors duration-200 hover:bg-black/[.05] dark:border-white/10 dark:hover:bg-white/[.07]"
            >
              <span className="text-lg font-semibold">{t(season)}</span>
              <span className="text-xs opacity-60">{count}</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SEASONS, isSeason, getAllArchiveEntries } from "@/lib/content/archive";

export async function generateStaticParams() {
  return SEASONS.map((season) => ({ season }));
}

export default async function ArchiveSeasonPage({
  params,
}: {
  params: Promise<{ locale: string; season: string }>;
}) {
  const { locale, season } = await params;
  setRequestLocale(locale as Locale);
  if (!isSeason(season)) notFound();

  const t = await getTranslations("archive");
  const entries = await getAllArchiveEntries(locale as Locale, season);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      <Link href="/archive" className="inline-block py-1 text-sm opacity-60 hover:opacity-100">
        ← {t("back")}
      </Link>
      <h1 className="animate-fade-in-up mt-4 text-3xl font-bold sm:text-4xl">{t(season)}</h1>

      {entries.length === 0 ? (
        <p className="mt-8 opacity-60">{t("empty")}</p>
      ) : (
        <ul className="mt-8 flex flex-col divide-y divide-black/10 dark:divide-white/10">
          {entries.map((entry, i) => (
            <li
              key={entry.slug}
              className="animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <Link
                href={`/archive/${season}/${entry.slug}`}
                className="-mx-4 flex flex-col gap-1 rounded-lg px-4 py-4 transition-colors duration-200 hover:bg-black/[.05] sm:flex-row sm:items-baseline sm:justify-between sm:py-5 dark:hover:bg-white/[.07]"
              >
                <span className="text-base font-medium sm:text-lg">{entry.title}</span>
                <span className="text-xs opacity-60 sm:text-sm">{entry.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

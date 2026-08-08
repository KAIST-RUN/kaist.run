import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  SEASONS,
  getAllArchiveSlugs,
  getArchiveEntry,
  isSeason,
} from "@/lib/content/archive";
import { markdownToHtml } from "@/lib/markdown";
import { withBasePath } from "@/lib/basePath";

export async function generateStaticParams() {
  const bySeason = await Promise.all(
    SEASONS.map(async (season) => {
      const slugs = await getAllArchiveSlugs(season);
      return slugs.map((slug) => ({ season, slug }));
    }),
  );
  return bySeason.flat();
}

export default async function ArchiveEntryPage({
  params,
}: {
  params: Promise<{ locale: string; season: string; slug: string }>;
}) {
  const { locale, season, slug } = await params;
  setRequestLocale(locale as Locale);
  if (!isSeason(season)) notFound();

  const t = await getTranslations("archive");
  const entry = await getArchiveEntry(locale as Locale, season, slug);
  if (!entry) notFound();

  const html = await markdownToHtml(entry.content);

  return (
    <main className="animate-fade-in-up mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      <Link
        href={`/archive/${season}`}
        className="inline-block py-1 text-sm opacity-60 hover:opacity-100"
      >
        ← {t("back")}
      </Link>
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{entry.title}</h1>
      <p className="mt-1 text-xs opacity-60 sm:text-sm">{entry.date}</p>

      {entry.resources && entry.resources.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <span className="text-sm font-medium opacity-70">{t("resources")}</span>
          <div className="flex flex-wrap gap-2">
            {entry.resources.map((resource) => {
              const isExternal = /^https?:\/\//.test(resource.file);
              return (
                <a
                  key={resource.file}
                  href={
                    isExternal
                      ? resource.file
                      : withBasePath(`/archive/${season}/${slug}/${resource.file}`)
                  }
                  className="rounded-full border border-black/10 px-4 py-2 text-sm transition-colors hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/[.04]"
                  {...(isExternal
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : { download: true })}
                >
                  {resource.label}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {entry.judges && entry.judges.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium opacity-70">{t("judges")}</span>
          <div className="flex flex-wrap gap-2">
            {entry.judges.map((judge) => (
              <a
                key={judge.url}
                href={judge.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-black/10 px-4 py-1.5 text-sm transition-colors hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/[.04]"
              >
                {judge.name}
              </a>
            ))}
          </div>
        </div>
      )}

      <div
        className="prose prose-neutral mt-8 max-w-none sm:prose-lg dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}

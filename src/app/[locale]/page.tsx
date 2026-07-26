import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPinnedNotice, getRecentNotices } from "@/lib/content/notices";
import HomeStory from "@/components/home/HomeStory";

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
    <div className="flex flex-col">
      {pinnedNotice && (
        <Link
          href={`/notices/${pinnedNotice.slug}`}
          className="animate-fade-in-up flex shrink-0 items-center justify-center gap-2 border-b border-black/10 bg-black/[.03] px-4 py-2 text-center text-sm transition-colors hover:bg-black/[.05] sm:px-8 dark:border-white/10 dark:bg-white/[.04] dark:hover:bg-white/[.07]"
        >
          <span className="shrink-0 font-semibold">📢 {t("bannerLabel")}</span>
          <span className="truncate">{pinnedNotice.title}</span>
        </Link>
      )}

      <section className="relative flex min-h-[85dvh] flex-col items-center justify-center px-6 py-16 sm:min-h-[90dvh] sm:px-10">
        <div className="mx-auto flex max-w-3xl -translate-y-6 flex-col items-center gap-5 text-center sm:-translate-y-10 sm:gap-4">
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

        <div
          className="animate-fade-in-up absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-xs opacity-50 sm:text-sm"
          style={{ animationDelay: "600ms" }}
        >
          <span>{t("scrollHint")}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-bounce-hint h-5 w-5"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </section>

      <HomeStory
        intro={{
          paragraphs: t.raw("sections.intro.paragraphs"),
        }}
        study={{
          title: t("sections.study.title"),
          body: t("sections.study.body"),
          imageAlt: t("sections.study.imageAlt"),
          levels: t.raw("sections.study.levels"),
        }}
        contests={{
          title: t("sections.contests.title"),
          body: t("sections.contests.body"),
          imageAlt: t("sections.contests.imageAlt"),
          icpcName: t("sections.contests.icpcName"),
          icpcUrl: t("sections.contests.icpcUrl"),
          icpcFullName: t("sections.contests.icpcFullName"),
          icpcDescription: t("sections.contests.icpcDescription"),
          icpcRounds: t.raw("sections.contests.icpcRounds"),
          others: t.raw("sections.contests.others"),
        }}
        hosting={{
          title: t("sections.hosting.title"),
          body: t("sections.hosting.body"),
          photoAlt: t("sections.hosting.photoAlt"),
          events: t.raw("sections.hosting.events"),
        }}
        recruit={{
          line1: t("sections.recruit.line1"),
          line2: t("sections.recruit.line2"),
          buttonLabel: t("sections.recruit.buttonLabel"),
        }}
        news={{
          title: t("recentNews"),
          viewAllLabel: t("viewAll"),
          emptyLabel: tNotices("empty"),
          notices: recentNotices,
        }}
      />
    </div>
  );
}

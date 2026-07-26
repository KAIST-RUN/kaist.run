import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAllNoticeSlugs, getNoticeBySlug } from "@/lib/content/notices";
import { markdownToHtml } from "@/lib/markdown";

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return getAllNoticeSlugs(params.locale as Locale).map((slug) => ({ slug }));
}

export default async function NoticeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("notices");

  const notice = getNoticeBySlug(locale as Locale, slug);
  if (!notice) notFound();

  const html = await markdownToHtml(notice.content);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
      <Link href="/notices" className="text-sm opacity-60 hover:opacity-100">
        ← {t("back")}
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{notice.title}</h1>
      <p className="mt-1 text-xs opacity-60">{notice.date}</p>
      <div
        className="prose prose-neutral mt-8 max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}

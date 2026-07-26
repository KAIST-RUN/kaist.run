import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getAbout } from "@/lib/content/about";
import { markdownToHtml } from "@/lib/markdown";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const about = getAbout(locale as Locale);
  if (!about) notFound();

  const html = await markdownToHtml(about.content);

  return (
    <main className="animate-fade-in-up mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      <h1 className="text-3xl font-bold sm:text-4xl">{about.title}</h1>
      <div
        className="prose prose-neutral mt-6 max-w-none sm:prose-lg dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}

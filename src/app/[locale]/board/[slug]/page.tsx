import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAllBoardPostSlugs, getBoardPostBySlug } from "@/lib/content/board";
import { markdownToHtml } from "@/lib/markdown";

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  return (await getAllBoardPostSlugs(params.locale as Locale)).map((slug) => ({ slug }));
}

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("board");

  const post = await getBoardPostBySlug(locale as Locale, slug);
  if (!post) notFound();

  const html = await markdownToHtml(post.content);

  return (
    <main className="animate-fade-in-up mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      <Link href="/board" className="inline-block py-1 text-sm opacity-60 hover:opacity-100">
        ← {t("back")}
      </Link>
      <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{post.title}</h1>
      <p className="mt-1 text-xs opacity-60 sm:text-sm">{post.date}</p>
      <div
        className="prose prose-neutral mt-8 max-w-none sm:prose-lg dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}

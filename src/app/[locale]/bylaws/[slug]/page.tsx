import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getBylawsVersion, listBylawsVersions } from "@/lib/content/bylaws";
import { renderBylawsDocument } from "@/lib/bylaws";
import "../bylaws.css";

export async function generateStaticParams() {
  const versions = await listBylawsVersions();
  return versions.map((v) => ({ slug: v.slug }));
}

export default async function BylawsVersionPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations({ locale: locale as Locale, namespace: "bylaws" });

  const version = await getBylawsVersion(slug);
  if (!version) notFound();

  const html = renderBylawsDocument(version);

  return (
    <main className="animate-fade-in-up mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      <Link href="/bylaws" className="text-sm opacity-60 transition-opacity hover:opacity-100">
        {t("backToCurrent")}
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold opacity-60">
          {version.versionLabel} · {version.effectiveDate}
        </p>
        <a
          href={`/bylaws/${slug}.pdf`}
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm opacity-70 transition-opacity hover:opacity-100 dark:border-white/15"
        >
          {t("pdfDownload")}
        </a>
      </div>
      {locale !== "ko" && (
        <p className="mt-6 rounded-xl border border-black/10 p-4 text-sm opacity-70 dark:border-white/15">
          {t("koreanOnlyNotice")}
        </p>
      )}
      <div className="mt-6" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}

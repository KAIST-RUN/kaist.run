import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getCurrentBylaws, listBylawsVersions } from "@/lib/content/bylaws";
import { renderBylawsDocument } from "@/lib/bylaws";
import "./bylaws.css";

export default async function BylawsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations({ locale: locale as Locale, namespace: "bylaws" });

  // current가 null이면 "backstage에서 아직 회칙 버전을 한 번도 저장 안 한 상태" —
  // apply 폼 페이지와 같은 원칙으로 404 대신 안내 문구를 보여줍니다.
  const [current, versions] = await Promise.all([getCurrentBylaws(), listBylawsVersions()]);

  if (!current) {
    return (
      <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("notReady.title")}</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-70 sm:text-base">{t("notReady.body")}</p>
      </main>
    );
  }

  const html = renderBylawsDocument(current);
  const pastVersions = versions.filter((v) => v.slug !== current.slug);

  return (
    <main className="animate-fade-in-up mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      {locale !== "ko" && (
        <p className="mb-8 rounded-xl border border-black/10 p-4 text-sm opacity-70 dark:border-white/15">
          {t("koreanOnlyNotice")}
        </p>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />

      <div className="mt-10 flex justify-end">
        <a
          href={`/bylaws/${current.slug}.pdf`}
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm opacity-70 transition-opacity hover:opacity-100 dark:border-white/15"
        >
          {t("pdfDownload")}
        </a>
      </div>

      {pastVersions.length > 0 && (
        <div className="mt-16 border-t border-black/10 pt-8 dark:border-white/10">
          <h2 className="text-base font-bold opacity-80">{t("pastVersions")}</h2>
          <ul className="mt-3 flex flex-col divide-y divide-black/10 dark:divide-white/10">
            {pastVersions.map((v) => (
              <li key={v.slug}>
                <Link
                  href={`/bylaws/${v.slug}`}
                  className="-mx-3 flex items-baseline justify-between gap-3 rounded-lg px-3 py-3 text-sm transition-colors duration-200 hover:bg-black/[.05] dark:hover:bg-white/[.07]"
                >
                  <span>{v.versionLabel}</span>
                  <span className="shrink-0 text-xs opacity-60">{v.effectiveDate}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getBylaws } from "@/lib/content/bylaws";
import { renderBylaws } from "@/lib/bylaws";
import "./bylaws.css";

export default async function BylawsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations({ locale: locale as Locale, namespace: "bylaws" });

  // null이면 "backstage에서 아직 회칙을 한 번도 저장 안 한 상태" — apply 폼 페이지와
  // 같은 원칙으로 404 대신 안내 문구를 보여줍니다. 네트워크 오류 등 진짜 fetch 실패는
  // fetchContentJson이 그대로 throw해서 빌드 자체가 실패합니다.
  const bylaws = await getBylaws();

  if (!bylaws) {
    return (
      <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("notReady.title")}</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-70 sm:text-base">{t("notReady.body")}</p>
      </main>
    );
  }

  const html = renderBylaws(bylaws.content);

  return (
    <main className="animate-fade-in-up mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      {locale !== "ko" && (
        <p className="mb-8 rounded-xl border border-black/10 p-4 text-sm opacity-70 dark:border-white/15">
          {t("koreanOnlyNotice")}
        </p>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}

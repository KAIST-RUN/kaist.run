import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { fetchApplyFormConfig } from "@/lib/content/applyForm";
import ApplyFormClient from "@/components/apply/ApplyFormClient";

export default async function ApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations({ locale: locale as Locale, namespace: "apply" });

  // config가 null이거나 문항이 0개인 건 "아직 backstage에서 구글 폼을 한 번도
  // 연결 안 한 상태"를 뜻합니다 — 네트워크 오류 등 진짜 fetch 실패는
  // fetchContentJson이 그대로 throw해서(다른 페이지들과 동일 원칙) 빌드 자체가
  // 실패합니다.
  const config = await fetchApplyFormConfig();

  if (!config || config.questions.length === 0) {
    return (
      <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("notReady.title")}</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-70 sm:text-base">{t("notReady.body")}</p>
      </main>
    );
  }

  return <ApplyFormClient config={config} locale={locale as Locale} />;
}

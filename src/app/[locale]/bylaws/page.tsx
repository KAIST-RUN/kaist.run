import fs from "node:fs/promises";
import path from "node:path";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { renderBylaws } from "@/lib/bylaws";
import "./bylaws.css";

// 지금은 회칙 원문을 리포에 커밋된 텍스트 파일로 관리합니다(공지/연락처처럼
// D1 + backstage 편집 UI로 옮기는 건 다음 단계 — 우선 사이트에 보이는 탭부터).
// .claude/preview.py로 미리보기하며 편집한 뒤 이 파일에 반영하면 됩니다.
async function readBylawsSource(): Promise<string> {
  const filePath = path.join(process.cwd(), "content", "bylaws", "ko.txt");
  return fs.readFile(filePath, "utf-8");
}

export default async function BylawsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const raw = await readBylawsSource();
  const html = renderBylaws(raw);

  return (
    <main className="animate-fade-in-up mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      {locale !== "ko" && (
        <p className="mb-8 rounded-xl border border-black/10 p-4 text-sm opacity-70 dark:border-white/15">
          The club bylaws are currently only available in Korean.
        </p>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}

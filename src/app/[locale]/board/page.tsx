import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import BoardListContent from "@/components/board/BoardListContent";

// 회원 전용이라 목록 자체를 빌드 시점(next build)에 구울 수 없습니다 — 실제 fetch는
// BoardListContent(클라이언트 컴포넌트)가 로그인 확인 후 런타임에 합니다.
export default async function BoardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <BoardListContent />;
}

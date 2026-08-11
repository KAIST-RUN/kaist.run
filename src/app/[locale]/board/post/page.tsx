import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import BoardPostContent from "@/components/board/BoardPostContent";

// 예전엔 /board/[slug]/(동적 라우트 세그먼트) + generateStaticParams로 slug별
// 정적 페이지를 구웠지만, 회원 전용으로 바뀌면서 빌드 시점엔 어떤 slug를 구울지
// (즉 애초에 누가 볼 자격이 있는지) 알 수 없어졌습니다. 그래서 고정 경로 +
// ?slug= 쿼리로 바꿨습니다 — 이 페이지 자체는 항상 같은 정적 셸이고, 실제 글은
// BoardPostContent가 브라우저에서 로그인 확인 후 그 쿼리값으로 가져옵니다.
// useSearchParams()를 쓰는 클라이언트 컴포넌트라 Suspense로 감싸야 합니다(정적
// export에서도 지원되는 패턴 — 빌드 시점엔 빈 값으로, 브라우저에서 실제 값으로).
export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <Suspense fallback={null}>
      <BoardPostContent />
    </Suspense>
  );
}

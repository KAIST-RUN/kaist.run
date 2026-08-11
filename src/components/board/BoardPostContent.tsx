"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import AuthGate from "@/components/account/AuthGate";
import { fetchBoardPost, type BoardPost } from "@/lib/board/api";
import { markdownToHtml } from "@/lib/markdown";

type FetchState = { status: "loading" } | { status: "not-found" } | { status: "error" } | { status: "loaded"; post: BoardPost; html: string };

// 정적 export에는 slug별 경로를 미리 구울 수 없어서(로그인 전엔 그게 뭔지 알
// 방법이 없음) 동적 라우트 세그먼트(/board/[slug]) 대신 고정 경로 + 쿼리
// 스트링(/board/post/?slug=...)을 씁니다 — searchParams는 빌드 시점엔 비어있고
// 브라우저에서 읽히므로, 정적 셸 자체는 그대로 구워지면서도 실제 글 내용은
// 로그인 이후 런타임에만 가져오게 됩니다.
//
// "다시 시도"는 effect 안에서 setState({status:"loading"})를 직접 부르는 대신
// (react-hooks/set-state-in-effect가 막음), 부모가 key를 바꿔 이 컴포넌트를
// 통째로 새로 마운트시키는 방식으로 구현합니다.
function BoardPostBody({ locale, slug, onRetry }: { locale: Locale; slug: string | null; onRetry: () => void }) {
  const t = useTranslations("board");
  const accountT = useTranslations("account");
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    if (!slug) return; // slug 없음은 아래에서 렌더 시점에 바로 처리 — fetch할 게 없음.
    let cancelled = false;
    fetchBoardPost(locale, slug)
      .then(async (post) => {
        if (cancelled) return;
        if (!post) {
          setState({ status: "not-found" });
          return;
        }
        const html = await markdownToHtml(post.content);
        if (!cancelled) setState({ status: "loaded", post, html });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [locale, slug]);

  if (!slug) {
    return <p className="opacity-60">{t("notFound")}</p>;
  }

  if (state.status === "loading") {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <div className="h-8 w-2/3 rounded-2xl bg-black/[.04] dark:bg-white/[.05]" />
        <div className="h-40 rounded-2xl bg-black/[.04] dark:bg-white/[.05]" />
      </div>
    );
  }

  if (state.status === "not-found") {
    return <p className="opacity-60">{t("notFound")}</p>;
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm opacity-70">{t("loadError")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="w-fit rounded-full border border-black/10 px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-70 dark:border-white/15"
        >
          {accountT("error.retry")}
        </button>
      </div>
    );
  }

  const { post, html } = state;

  return (
    <>
      <h1 className="text-2xl font-bold sm:text-3xl">{post.title}</h1>
      <p className="mt-1 text-xs opacity-60 sm:text-sm">{post.date}</p>
      <div
        className="prose prose-neutral mt-8 max-w-none sm:prose-lg dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

export default function BoardPostContent() {
  const t = useTranslations("board");
  const locale = useLocale() as Locale;
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const [retryKey, setRetryKey] = useState(0);

  return (
    <main className="animate-fade-in-up mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      <Link href="/board" className="inline-block py-1 text-sm opacity-60 hover:opacity-100">
        ← {t("back")}
      </Link>
      <div className="mt-4">
        <AuthGate>
          {() => (
            <BoardPostBody
              key={`${locale}-${slug}-${retryKey}`}
              locale={locale}
              slug={slug}
              onRetry={() => setRetryKey((k) => k + 1)}
            />
          )}
        </AuthGate>
      </div>
    </main>
  );
}

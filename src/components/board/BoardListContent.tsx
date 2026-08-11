"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import AuthGate from "@/components/account/AuthGate";
import { fetchBoardPosts, type BoardPost } from "@/lib/board/api";

type FetchState = { status: "loading" } | { status: "error" } | { status: "loaded"; posts: BoardPost[] };

// AuthGate가 로그인 확인까지 마친 뒤에만 마운트됩니다 — 그래서 fetch를 여기(별도
// 자식 컴포넌트)에서 하지, BoardListContent 최상단에서 하지 않습니다. 세션이
// 없는 사람은 이 컴포넌트 자체가 렌더링되지 않으니 게시글 API를 부를 일도 없음.
//
// "다시 시도"는 effect 안에서 setState({status:"loading"})를 직접 부르는 대신
// (react-hooks/set-state-in-effect가 막음 — 렌더 도중 추가 렌더를 유발), 부모가
// key를 바꿔 이 컴포넌트를 통째로 새로 마운트시키는 방식으로 구현합니다 — 그러면
// useState 초기값(loading)으로 자연스럽게 되돌아갑니다.
function BoardListBody({ locale, onRetry }: { locale: Locale; onRetry: () => void }) {
  const t = useTranslations("board");
  const accountT = useTranslations("account");
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchBoardPosts(locale)
      .then((posts) => {
        if (!cancelled) setState({ status: "loaded", posts });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (state.status === "loading") {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{t("loading")}</span>
        <div className="h-14 rounded-2xl bg-black/[.04] dark:bg-white/[.05]" />
        <div className="h-14 rounded-2xl bg-black/[.04] dark:bg-white/[.05]" />
        <div className="h-14 rounded-2xl bg-black/[.04] dark:bg-white/[.05]" />
      </div>
    );
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

  const { posts } = state;

  return posts.length === 0 ? (
    <p className="opacity-60">{t("empty")}</p>
  ) : (
    <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
      {posts.map((post, i) => (
        <li key={post.slug} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
          <Link
            href={`/board/post/?slug=${encodeURIComponent(post.slug)}`}
            className={`-mx-4 flex flex-col gap-1 rounded-lg px-4 py-4 transition-colors duration-200 hover:bg-black/[.05] sm:flex-row sm:items-baseline sm:justify-between sm:py-5 dark:hover:bg-white/[.07] ${
              post.pinned ? "bg-black/[.03] dark:bg-white/[.05]" : ""
            }`}
          >
            <span className={`text-base sm:text-lg ${post.pinned ? "font-bold" : "font-medium"}`}>
              {post.pinned && "📌 "}
              {post.title}
            </span>
            <span className="text-xs opacity-60 sm:text-sm">{post.date}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function BoardListContent() {
  const t = useTranslations("board");
  const locale = useLocale() as Locale;
  const [retryKey, setRetryKey] = useState(0);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-3xl lg:px-12">
      <h1 className="animate-fade-in-up text-3xl font-bold sm:text-4xl">{t("title")}</h1>
      <div className="mt-8">
        <AuthGate>
          {() => <BoardListBody key={`${locale}-${retryKey}`} locale={locale} onRetry={() => setRetryKey((k) => k + 1)} />}
        </AuthGate>
      </div>
    </main>
  );
}

import type { Locale } from "@/i18n/routing";
import { getBoardListEndpoint, getBoardPostEndpoint } from "@/lib/account/authLinks";

// src/lib/content/*의 fetchContentJson과 달리 이건 "next build" 시점(GitHub Actions)이
// 아니라 브라우저에서, 로그인 후에 호출됩니다 — 그래서 credentials:"include"가
// 필요하고, 그래서 이 파일이 src/lib/content/가 아니라 별도 위치에 있습니다.
// 게시판이 회원 전용이 되려면 콘텐츠가 정적 export에 미리 구워지면 안 되고
// (구우면 그 시점에 로그인 여부를 알 수 없어 항상 공개로 나가버림), 로그인 이후
// 런타임에만 가져와야 합니다 — worker/src/routes/board.ts 참고.

export type BoardPost = {
  slug: string;
  title: string;
  date: string;
  pinned: boolean;
  content: string;
};

async function fetchBoardJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Board API request failed: ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

// D1의 listBoardPosts()가 이미 pinned DESC, date DESC로 정렬해서 내려줍니다.
export async function fetchBoardPosts(locale: Locale): Promise<BoardPost[]> {
  return (await fetchBoardJson<BoardPost[]>(getBoardListEndpoint(locale))) ?? [];
}

export async function fetchBoardPost(locale: Locale, slug: string): Promise<BoardPost | null> {
  return fetchBoardJson<BoardPost>(getBoardPostEndpoint(locale, slug));
}

import type { Locale } from "@/i18n/routing";
import { fetchContentJson } from "./api";

export type BoardPostFrontmatter = {
  title: string;
  date: string;
  pinned?: boolean;
};

export type BoardPostSummary = BoardPostFrontmatter & { slug: string };
export type BoardPost = BoardPostSummary & { content: string };

type ApiBoardPost = {
  slug: string;
  title: string;
  date: string;
  pinned: boolean;
  content: string;
};

// D1의 listBoardPosts()가 이미 pinned DESC, date DESC로 정렬해서 내려줍니다.
async function fetchAllBoardPosts(locale: Locale): Promise<ApiBoardPost[]> {
  return (await fetchContentJson<ApiBoardPost[]>(`/board/${locale}`)) ?? [];
}

export async function getAllBoardPostSlugs(locale: Locale): Promise<string[]> {
  return (await fetchAllBoardPosts(locale)).map((p) => p.slug);
}

export async function getAllBoardPosts(locale: Locale): Promise<BoardPostSummary[]> {
  return fetchAllBoardPosts(locale);
}

export async function getBoardPostBySlug(locale: Locale, slug: string): Promise<BoardPost | null> {
  return fetchContentJson<ApiBoardPost>(`/board/${locale}/${slug}`);
}

import type { Locale } from "@/i18n/routing";
import { fetchContentJson } from "./api";

export type NoticeFrontmatter = {
  title: string;
  date: string;
  pinned?: boolean;
};

export type NoticeSummary = NoticeFrontmatter & { slug: string };
export type Notice = NoticeSummary & { content: string };

type ApiNotice = {
  slug: string;
  title: string;
  date: string;
  pinned: boolean;
  content: string;
};

// D1의 listNotices()가 이미 pinned DESC, date DESC로 정렬해서 내려줍니다.
async function fetchAllNotices(locale: Locale): Promise<ApiNotice[]> {
  return (await fetchContentJson<ApiNotice[]>(`/notices/${locale}`)) ?? [];
}

export async function getAllNoticeSlugs(locale: Locale): Promise<string[]> {
  return (await fetchAllNotices(locale)).map((n) => n.slug);
}

export async function getAllNotices(locale: Locale): Promise<NoticeSummary[]> {
  return fetchAllNotices(locale);
}

export async function getPinnedNotice(locale: Locale): Promise<NoticeSummary | null> {
  const [first] = await fetchAllNotices(locale);
  return first?.pinned ? first : null;
}

export async function getRecentNotices(locale: Locale, limit: number): Promise<NoticeSummary[]> {
  const all = await fetchAllNotices(locale);
  return all.filter((notice) => !notice.pinned).slice(0, limit);
}

export async function getNoticeBySlug(locale: Locale, slug: string): Promise<Notice | null> {
  return fetchContentJson<ApiNotice>(`/notices/${locale}/${slug}`);
}

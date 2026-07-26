import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Locale } from "@/i18n/routing";

const NOTICES_DIR = path.join(process.cwd(), "content", "notices");

export type NoticeFrontmatter = {
  title: string;
  date: string;
  pinned?: boolean;
};

export type NoticeSummary = NoticeFrontmatter & { slug: string };
export type Notice = NoticeSummary & { content: string };

function noticesDirFor(locale: Locale) {
  return path.join(NOTICES_DIR, locale);
}

export function getAllNoticeSlugs(locale: Locale): string[] {
  const dir = noticesDirFor(locale);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""));
}

function readAllNoticeSummaries(locale: Locale): NoticeSummary[] {
  return getAllNoticeSlugs(locale).map((slug) => {
    const raw = fs.readFileSync(path.join(noticesDirFor(locale), `${slug}.md`), "utf8");
    const { data } = matter(raw);
    return { slug, ...(data as NoticeFrontmatter) };
  });
}

export function getAllNotices(locale: Locale): NoticeSummary[] {
  return readAllNoticeSummaries(locale).sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.date.localeCompare(a.date);
  });
}

export function getPinnedNotice(locale: Locale): NoticeSummary | null {
  const [first] = getAllNotices(locale);
  return first?.pinned ? first : null;
}

export function getRecentNotices(locale: Locale, limit: number): NoticeSummary[] {
  return readAllNoticeSummaries(locale)
    .filter((notice) => !notice.pinned)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function getNoticeBySlug(locale: Locale, slug: string): Notice | null {
  const filePath = path.join(noticesDirFor(locale), `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return { slug, content, ...(data as NoticeFrontmatter) };
}

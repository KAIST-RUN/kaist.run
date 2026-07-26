import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Locale } from "@/i18n/routing";

export type Season = "spring" | "fall";
export const SEASONS: Season[] = ["spring", "fall"];

const ARCHIVE_DIR = path.join(process.cwd(), "content", "archive");

export type ArchiveResource = {
  /** Either a filename under this entry's public/archive folder, or an absolute http(s) URL. */
  file: string;
  label: string;
};

export type ArchiveJudge = {
  name: string;
  url: string;
};

export type ArchiveFrontmatter = {
  title: string;
  season: Season;
  year: number;
  date: string;
  resources?: ArchiveResource[];
  judges?: ArchiveJudge[];
};

export type ArchiveSummary = ArchiveFrontmatter & { slug: string };
export type ArchiveEntry = ArchiveSummary & { content: string };

function seasonDir(season: Season) {
  return path.join(ARCHIVE_DIR, season);
}

export function isSeason(value: string): value is Season {
  return (SEASONS as string[]).includes(value);
}

export function getAllArchiveSlugs(season: Season): string[] {
  const dir = seasonDir(season);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((entry) => fs.statSync(path.join(dir, entry)).isDirectory());
}

export function getAllArchiveEntries(locale: Locale, season: Season): ArchiveSummary[] {
  return getAllArchiveSlugs(season)
    .map((slug) => getArchiveEntry(locale, season, slug))
    .filter((entry): entry is ArchiveEntry => entry !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getArchiveEntry(
  locale: Locale,
  season: Season,
  slug: string,
): ArchiveEntry | null {
  const filePath = path.join(seasonDir(season), slug, `${locale}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return { slug, content, ...(data as ArchiveFrontmatter) };
}

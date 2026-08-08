import type { Locale } from "@/i18n/routing";
import { fetchContentJson } from "./api";

export type Season = "spring" | "fall";
export const SEASONS: Season[] = ["spring", "fall"];

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

type ApiArchiveEntry = {
  slug: string;
  season: Season;
  title: string;
  year: number;
  date: string;
  resources: ArchiveResource[];
  judges: ArchiveJudge[];
  content: string;
};

export function isSeason(value: string): value is Season {
  return (SEASONS as string[]).includes(value);
}

async function fetchSeasonEntries(season: Season, locale: Locale): Promise<ApiArchiveEntry[]> {
  return (await fetchContentJson<ApiArchiveEntry[]>(`/archive/${season}/${locale}`)) ?? [];
}

export async function getAllArchiveSlugs(season: Season): Promise<string[]> {
  // 슬러그 목록은 로케일에 안 묶여야 하지만(generateStaticParams용), API는 로케일별로
  // 조회하므로 ko 기준으로 가져옵니다 — 아카이브는 항상 ko/en이 함께 등록됩니다.
  return (await fetchSeasonEntries(season, "ko")).map((e) => e.slug);
}

export async function getAllArchiveEntries(locale: Locale, season: Season): Promise<ArchiveSummary[]> {
  return fetchSeasonEntries(season, locale);
}

export async function getArchiveEntry(
  locale: Locale,
  season: Season,
  slug: string,
): Promise<ArchiveEntry | null> {
  return fetchContentJson<ApiArchiveEntry>(`/archive/${season}/${locale}/${slug}`);
}

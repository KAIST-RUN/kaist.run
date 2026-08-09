import type { Env } from "../types";

export type Locale = "ko" | "en";

export type NoticeRow = {
  slug: string;
  locale: Locale;
  title: string;
  date: string;
  pinned: boolean;
  content: string;
  updated_at: string;
};

export type ArchiveResource = { file: string; label: string };
export type ArchiveJudge = { name: string; url: string };
export type Season = "spring" | "fall";

export type ArchiveRow = {
  slug: string;
  season: Season;
  locale: Locale;
  title: string;
  year: number;
  date: string;
  resources: ArchiveResource[];
  judges: ArchiveJudge[];
  content: string;
  updated_at: string;
};

export type ContactInfoLine = { text: string; href?: string };
export type ContactInfoRow = { label: string; lines: ContactInfoLine[] };
export type ContactSocial = { platform: string; label: string; url: string };

export type ContactRow = {
  locale: Locale;
  title: string;
  info: ContactInfoRow[];
  socials: ContactSocial[];
  content: string;
  updated_at: string;
};

// 번역이 없는 한국어 단일 문서라 apply_form처럼 locale 구분 없이 한 행(id=1)만
// 씁니다. content 문법은 src/lib/bylaws.ts(메인 사이트)가 파싱합니다.
export type BylawsRow = {
  content: string;
  updated_at: string;
};

// D1에서 그대로 나온 row(불리언/JSON이 문자열)를 앱에서 쓰는 타입으로 바꿉니다.
type RawNoticeRow = Omit<NoticeRow, "pinned"> & { pinned: number };
type RawArchiveRow = Omit<ArchiveRow, "resources" | "judges"> & { resources: string; judges: string };
type RawContactRow = Omit<ContactRow, "info" | "socials"> & { info: string; socials: string };

function fromRawNotice(row: RawNoticeRow): NoticeRow {
  return { ...row, pinned: row.pinned !== 0 };
}

function fromRawArchive(row: RawArchiveRow): ArchiveRow {
  return { ...row, resources: JSON.parse(row.resources), judges: JSON.parse(row.judges) };
}

function fromRawContact(row: RawContactRow): ContactRow {
  return { ...row, info: JSON.parse(row.info), socials: JSON.parse(row.socials) };
}

// ---------- notices ----------

export async function listNotices(env: Env, locale: Locale): Promise<NoticeRow[]> {
  const { results } = await env.CONTENT_DB.prepare(
    "SELECT * FROM notices WHERE locale = ?1 ORDER BY pinned DESC, date DESC",
  )
    .bind(locale)
    .all<RawNoticeRow>();
  return results.map(fromRawNotice);
}

export async function getNotice(env: Env, locale: Locale, slug: string): Promise<NoticeRow | null> {
  const row = await env.CONTENT_DB.prepare("SELECT * FROM notices WHERE locale = ?1 AND slug = ?2")
    .bind(locale, slug)
    .first<RawNoticeRow>();
  return row ? fromRawNotice(row) : null;
}

export type NoticeInput = { title: string; date: string; pinned: boolean; content: string };

export async function upsertNotice(env: Env, slug: string, locale: Locale, input: NoticeInput): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO notices (slug, locale, title, date, pinned, content, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
     ON CONFLICT (slug, locale) DO UPDATE SET
       title = excluded.title, date = excluded.date, pinned = excluded.pinned,
       content = excluded.content, updated_at = datetime('now')`,
  )
    .bind(slug, locale, input.title, input.date, input.pinned ? 1 : 0, input.content)
    .run();
}

export async function deleteNotice(env: Env, slug: string): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM notices WHERE slug = ?1").bind(slug).run();
}

// ---------- archive ----------

export async function listArchiveEntries(env: Env, season: Season, locale: Locale): Promise<ArchiveRow[]> {
  const { results } = await env.CONTENT_DB.prepare(
    "SELECT * FROM archive_entries WHERE season = ?1 AND locale = ?2 ORDER BY date DESC",
  )
    .bind(season, locale)
    .all<RawArchiveRow>();
  return results.map(fromRawArchive);
}

export async function getArchiveEntry(
  env: Env,
  season: Season,
  locale: Locale,
  slug: string,
): Promise<ArchiveRow | null> {
  const row = await env.CONTENT_DB.prepare(
    "SELECT * FROM archive_entries WHERE season = ?1 AND locale = ?2 AND slug = ?3",
  )
    .bind(season, locale, slug)
    .first<RawArchiveRow>();
  return row ? fromRawArchive(row) : null;
}

export type ArchiveInput = {
  title: string;
  year: number;
  date: string;
  resources: ArchiveResource[];
  judges: ArchiveJudge[];
  content: string;
};

export async function upsertArchiveEntry(
  env: Env,
  slug: string,
  season: Season,
  locale: Locale,
  input: ArchiveInput,
): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO archive_entries (slug, season, locale, title, year, date, resources, judges, content, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
     ON CONFLICT (slug, season, locale) DO UPDATE SET
       title = excluded.title, year = excluded.year, date = excluded.date,
       resources = excluded.resources, judges = excluded.judges,
       content = excluded.content, updated_at = datetime('now')`,
  )
    .bind(
      slug,
      season,
      locale,
      input.title,
      input.year,
      input.date,
      JSON.stringify(input.resources),
      JSON.stringify(input.judges),
      input.content,
    )
    .run();
}

export async function deleteArchiveEntry(env: Env, slug: string, season: Season): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM archive_entries WHERE slug = ?1 AND season = ?2")
    .bind(slug, season)
    .run();
}

// ---------- contact ----------

export async function getContact(env: Env, locale: Locale): Promise<ContactRow | null> {
  const row = await env.CONTENT_DB.prepare("SELECT * FROM contact_page WHERE locale = ?1")
    .bind(locale)
    .first<RawContactRow>();
  return row ? fromRawContact(row) : null;
}

export type ContactInput = {
  title: string;
  info: ContactInfoRow[];
  socials: ContactSocial[];
  content: string;
};

export async function upsertContact(env: Env, locale: Locale, input: ContactInput): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO contact_page (locale, title, info, socials, content, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
     ON CONFLICT (locale) DO UPDATE SET
       title = excluded.title, info = excluded.info, socials = excluded.socials,
       content = excluded.content, updated_at = datetime('now')`,
  )
    .bind(locale, input.title, JSON.stringify(input.info), JSON.stringify(input.socials), input.content)
    .run();
}

// ---------- bylaws ----------

export async function getBylaws(env: Env): Promise<BylawsRow | null> {
  const row = await env.CONTENT_DB.prepare("SELECT content, updated_at FROM bylaws_page WHERE id = 1").first<BylawsRow>();
  return row ?? null;
}

export async function upsertBylaws(env: Env, content: string): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO bylaws_page (id, content, updated_at) VALUES (1, ?1, datetime('now'))
     ON CONFLICT (id) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
  )
    .bind(content)
    .run();
}

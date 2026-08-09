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

// backstage의 트리 에디터(어디에 추가하는지가 곧 위계)에서 만드는, 문서 순서대로
// 평평하게 펼친 문단 목록입니다. 번호는 저장 안 하고 src/lib/bylaws.ts가 렌더링할 때
// 순서를 보고 매번 새로 계산합니다. body는 장/부칙/조/항 자신에게 선택적으로 붙는
// 번호 없는 문단이고, 독립된 타입이 아닙니다. "절"/"강조문구"는 실제로 쓰인 적이
// 없어서 뺐습니다.
export type BylawsBlockType = "chapter" | "article" | "buchik" | "clause" | "item" | "subitem";
// 개정/신설/본조신설 표시는 본문 텍스트 안에 <개정 2>처럼 글자로 박아넣는 대신,
// 그 조/항 자신에게 딸린 메타데이터입니다 — num은 revisionHistory의 1-based
// 인덱스(어느 개정을 가리키는지)입니다.
export type BylawsTagKind = "개정" | "신설" | "본조신설";
export type BylawsTag = { kind: BylawsTagKind; num: number };
export type BylawsBlock = { type: BylawsBlockType; text: string; body?: string; tags?: BylawsTag[] };
// 개정이력은 날짜만 저장합니다 — 첫 번째 항목은 항상 "제정", 그 뒤로는 항상
// "일부개정"이라 라벨을 따로 입력받을 필요가 없고, 표시할 때 순서로 계산합니다.
export type BylawsRevisionHistory = string[];

// 번역이 없는 한국어 문서라 locale 구분이 없습니다. "역대 회칙"이라 slug로 여러
// 버전(2017년 제정, 2026년 개정 ...)을 두고, effective_date가 가장 최신인 게
// "현재 버전"입니다(별도 플래그 없음 — 새 버전을 추가하기만 하면 자동으로 넘어감).
export type BylawsVersionRow = {
  slug: string;
  title: string;
  versionLabel: string;
  effectiveDate: string;
  revisionHistory: BylawsRevisionHistory;
  blocks: BylawsBlock[];
  updated_at: string;
};

export type BylawsVersionSummary = Omit<BylawsVersionRow, "revisionHistory" | "blocks">;

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

type RawBylawsVersionRow = {
  slug: string;
  title: string;
  version_label: string;
  effective_date: string;
  revision_history: string;
  blocks: string;
  updated_at: string;
};
type RawBylawsVersionSummaryRow = Omit<RawBylawsVersionRow, "revision_history" | "blocks">;

function fromRawBylawsVersion(row: RawBylawsVersionRow): BylawsVersionRow {
  return {
    slug: row.slug,
    title: row.title,
    versionLabel: row.version_label,
    effectiveDate: row.effective_date,
    revisionHistory: JSON.parse(row.revision_history),
    blocks: JSON.parse(row.blocks),
    updated_at: row.updated_at,
  };
}

function fromRawBylawsVersionSummary(row: RawBylawsVersionSummaryRow): BylawsVersionSummary {
  return {
    slug: row.slug,
    title: row.title,
    versionLabel: row.version_label,
    effectiveDate: row.effective_date,
    updated_at: row.updated_at,
  };
}

// 최신순(effective_date DESC) — 목록 화면과 "현재 버전 = 첫 번째" 판단 둘 다 이 순서를 씁니다.
export async function listBylawsVersions(env: Env): Promise<BylawsVersionSummary[]> {
  const { results } = await env.CONTENT_DB.prepare(
    "SELECT slug, title, version_label, effective_date, updated_at FROM bylaws_version ORDER BY effective_date DESC",
  ).all<RawBylawsVersionSummaryRow>();
  return results.map(fromRawBylawsVersionSummary);
}

export async function getBylawsVersion(env: Env, slug: string): Promise<BylawsVersionRow | null> {
  const row = await env.CONTENT_DB.prepare("SELECT * FROM bylaws_version WHERE slug = ?1").bind(slug).first<RawBylawsVersionRow>();
  return row ? fromRawBylawsVersion(row) : null;
}

// 별도 "현재 버전" 플래그가 없으므로, effective_date가 가장 최신인 행을 그대로 씁니다.
export async function getCurrentBylawsVersion(env: Env): Promise<BylawsVersionRow | null> {
  const row = await env.CONTENT_DB.prepare("SELECT * FROM bylaws_version ORDER BY effective_date DESC LIMIT 1").first<RawBylawsVersionRow>();
  return row ? fromRawBylawsVersion(row) : null;
}

export type BylawsVersionInput = {
  title: string;
  versionLabel: string;
  effectiveDate: string;
  revisionHistory: BylawsRevisionHistory;
  blocks: BylawsBlock[];
};

export async function upsertBylawsVersion(env: Env, slug: string, input: BylawsVersionInput): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO bylaws_version (slug, title, version_label, effective_date, revision_history, blocks, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
     ON CONFLICT (slug) DO UPDATE SET
       title = excluded.title, version_label = excluded.version_label, effective_date = excluded.effective_date,
       revision_history = excluded.revision_history, blocks = excluded.blocks, updated_at = datetime('now')`,
  )
    .bind(slug, input.title, input.versionLabel, input.effectiveDate, JSON.stringify(input.revisionHistory), JSON.stringify(input.blocks))
    .run();
}

export async function deleteBylawsVersion(env: Env, slug: string): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM bylaws_version WHERE slug = ?1").bind(slug).run();
}

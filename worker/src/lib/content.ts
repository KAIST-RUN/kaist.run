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
// 버전(2017년 제정, 2026년 개정 ...)을 두고, 게시된(isPublished) 것들 중
// effective_date가 가장 최신인 게 "현재 버전"입니다. 편집 중인 버전은 게시 전까지
// 공개 API에 안 나갑니다(backstage에서는 초안도 계속 보이고 편집 가능).
export type BylawsVersionRow = {
  slug: string;
  title: string;
  versionLabel: string;
  effectiveDate: string;
  isPublished: boolean;
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
  // 짧은 URL 코드도 함께 지웁니다 — 남겨두면 죽은 공지로 가는 코드가 계속 발급 공간을
  // 차지하고, 그 코드로 접속한 사람은 존재하지 않는 slug로 리다이렉트됩니다.
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare("DELETE FROM notices WHERE slug = ?1").bind(slug),
    env.CONTENT_DB.prepare("DELETE FROM notice_short_links WHERE slug = ?1").bind(slug),
  ]);
}

// ---------- notice short links ----------
// kaist.run/<code>(2글자) → 공지 리다이렉트용 매핑. 발급/삭제는 backstage(관리자),
// 해석은 공개 API(routes/content.ts::/short-links/:code)가 담당합니다. 왜 이 구조인지는
// migrations/0033_notice_short_links.sql 주석 참고.

const SHORT_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
// 실제 사이트 루트 경로와 겹치는 2글자들 — 대소문자 무시하고 발급에서 제외합니다.
// (GitHub Pages 경로는 대소문자를 구분해서 "KO" 같은 코드도 기술적으로는 동작하지만,
// 사람이 말로 전할 때 혼동을 부르므로 아예 피합니다.)
const RESERVED_SHORT_CODES = new Set(["ko", "en", "my"]);

export function isValidShortCode(code: string): boolean {
  return /^[A-Za-z0-9]{2}$/.test(code) && !RESERVED_SHORT_CODES.has(code.toLowerCase());
}

function randomShortCode(): string {
  // rejection sampling — 256 % 62 ≠ 0이라 나머지 연산만 쓰면 앞쪽 글자가 미세하게 더
  // 자주 나옵니다. 248(=62*4) 미만인 바이트만 채택해 균등하게 뽑습니다.
  const chars: string[] = [];
  while (chars.length < 2) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (chars.length < 2 && b < 62 * 4) chars.push(SHORT_CODE_ALPHABET[b % 62]);
    }
  }
  return chars.join("");
}

export class ShortLinkError extends Error {}

// backstage 공지 목록에서 각 행 옆에 코드를 보여주기 위한 전체 매핑(slug → code).
export async function listShortLinks(env: Env): Promise<Map<string, string>> {
  const { results } = await env.CONTENT_DB.prepare("SELECT code, slug FROM notice_short_links").all<{ code: string; slug: string }>();
  return new Map(results.map((r) => [r.slug, r.code]));
}

export async function getShortLinkBySlug(env: Env, slug: string): Promise<string | null> {
  const row = await env.CONTENT_DB.prepare("SELECT code FROM notice_short_links WHERE slug = ?1")
    .bind(slug)
    .first<{ code: string }>();
  return row?.code ?? null;
}

export async function getShortLinkByCode(env: Env, code: string): Promise<string | null> {
  const row = await env.CONTENT_DB.prepare("SELECT slug FROM notice_short_links WHERE code = ?1")
    .bind(code)
    .first<{ slug: string }>();
  return row?.slug ?? null;
}

// 발급 — 이미 코드가 있으면 그 코드를 그대로 돌려줍니다(멱등). 무작위 코드가 기존 코드와
// 충돌하면 ON CONFLICT DO NOTHING이 0행 삽입으로 알려주므로 새 코드로 재시도합니다
// (members.ts::createUser의 race 처리와 같은 패턴 — 확인-후-삽입 사이의 동시 발급도
// 안전합니다). 3,844개 공간에 수십 개 수준이라 충돌 자체가 드뭅니다.
export async function createShortLink(env: Env, slug: string): Promise<string> {
  const existing = await getShortLinkBySlug(env, slug);
  if (existing) return existing;

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomShortCode();
    if (!isValidShortCode(code)) continue; // 예약어(ko/en/my)에 걸린 경우 — 새로 뽑기
    // ON CONFLICT DO NOTHING은 code 충돌(다른 공지가 선점)과 slug 충돌(같은 공지에 동시
    // 발급이 방금 이김 — idx_notice_short_links_slug) 둘 다 0행 삽입으로 알려줍니다.
    const result = await env.CONTENT_DB.prepare(
      "INSERT INTO notice_short_links (code, slug) VALUES (?1, ?2) ON CONFLICT DO NOTHING",
    )
      .bind(code, slug)
      .run();
    if (result.meta.changes === 1) return code;
    // slug 충돌이었다면 이미 이 공지의 코드가 생긴 것이므로 그걸 돌려줍니다(멱등).
    const raced = await getShortLinkBySlug(env, slug);
    if (raced) return raced;
    // code 충돌이었다면 새 코드로 재시도.
  }
  throw new ShortLinkError("짧은 URL 코드를 발급하지 못했습니다. 다시 시도해 주세요.");
}

export async function deleteShortLink(env: Env, slug: string): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM notice_short_links WHERE slug = ?1").bind(slug).run();
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
  is_published: number;
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
    isPublished: row.is_published === 1,
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
    isPublished: row.is_published === 1,
    updated_at: row.updated_at,
  };
}

// 최신순(effective_date DESC) — backstage 목록용입니다. 게시 여부와 상관없이 초안도
// 다 보여줘야 admin이 찾아서 편집할 수 있으므로 여기서는 필터링 안 합니다
// (공개 API 쪽 필터링은 routes/content.ts에서 isPublished로 따로 합니다).
export async function listBylawsVersions(env: Env): Promise<BylawsVersionSummary[]> {
  const { results } = await env.CONTENT_DB.prepare(
    "SELECT slug, title, version_label, effective_date, is_published, updated_at FROM bylaws_version ORDER BY effective_date DESC",
  ).all<RawBylawsVersionSummaryRow>();
  return results.map(fromRawBylawsVersionSummary);
}

export async function getBylawsVersion(env: Env, slug: string): Promise<BylawsVersionRow | null> {
  const row = await env.CONTENT_DB.prepare("SELECT * FROM bylaws_version WHERE slug = ?1").bind(slug).first<RawBylawsVersionRow>();
  return row ? fromRawBylawsVersion(row) : null;
}

// 게시된(is_published = 1) 것들 중 effective_date가 가장 최신인 행 — 아직 편집 중인
// (게시 안 한) 버전은 아무리 effective_date가 최신이어도 "현재 버전"으로 안 뜹니다.
export async function getCurrentBylawsVersion(env: Env): Promise<BylawsVersionRow | null> {
  const row = await env.CONTENT_DB.prepare(
    "SELECT * FROM bylaws_version WHERE is_published = 1 ORDER BY effective_date DESC LIMIT 1",
  ).first<RawBylawsVersionRow>();
  return row ? fromRawBylawsVersion(row) : null;
}

export type BylawsVersionInput = {
  title: string;
  versionLabel: string;
  effectiveDate: string;
  isPublished: boolean;
  revisionHistory: BylawsRevisionHistory;
  blocks: BylawsBlock[];
};

export async function upsertBylawsVersion(env: Env, slug: string, input: BylawsVersionInput): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO bylaws_version (slug, title, version_label, effective_date, is_published, revision_history, blocks, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
     ON CONFLICT (slug) DO UPDATE SET
       title = excluded.title, version_label = excluded.version_label, effective_date = excluded.effective_date,
       is_published = excluded.is_published, revision_history = excluded.revision_history, blocks = excluded.blocks,
       updated_at = datetime('now')`,
  )
    .bind(
      slug,
      input.title,
      input.versionLabel,
      input.effectiveDate,
      input.isPublished ? 1 : 0,
      JSON.stringify(input.revisionHistory),
      JSON.stringify(input.blocks),
    )
    .run();
}

export async function deleteBylawsVersion(env: Env, slug: string): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM bylaws_version WHERE slug = ?1").bind(slug).run();
}

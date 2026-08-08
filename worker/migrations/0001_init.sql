-- 공지/아카이브/연락처 콘텐츠. content/ 마크다운 파일 1개 = row 1개(로케일별로 분리)와 대응됩니다.
-- backstage가 이 테이블들을 직접 CRUD하고, Worker의 공개 읽기 API(/api/content/*)를
-- 메인 사이트가 빌드 시점에 fetch해서 정적 페이지로 굳힙니다.

CREATE TABLE IF NOT EXISTS notices (
  slug TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('ko', 'en')),
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, locale)
);

CREATE TABLE IF NOT EXISTS archive_entries (
  slug TEXT NOT NULL,
  season TEXT NOT NULL CHECK (season IN ('spring', 'fall')),
  locale TEXT NOT NULL CHECK (locale IN ('ko', 'en')),
  title TEXT NOT NULL,
  year INTEGER NOT NULL,
  date TEXT NOT NULL,
  resources TEXT NOT NULL DEFAULT '[]', -- JSON: { file, label }[]
  judges TEXT NOT NULL DEFAULT '[]', -- JSON: { name, url }[]
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, season, locale)
);

CREATE TABLE IF NOT EXISTS contact_page (
  locale TEXT PRIMARY KEY CHECK (locale IN ('ko', 'en')),
  title TEXT NOT NULL,
  info TEXT NOT NULL DEFAULT '[]', -- JSON: { label, lines: { text, href? }[] }[]
  socials TEXT NOT NULL DEFAULT '[]', -- JSON: { platform, label, url }[]
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notices_locale_date ON notices (locale, date DESC);
CREATE INDEX IF NOT EXISTS idx_archive_season_locale ON archive_entries (season, locale, date DESC);

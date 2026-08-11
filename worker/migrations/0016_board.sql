-- 회원 전용 게시판. notices와 완전히 같은 구조입니다.
CREATE TABLE IF NOT EXISTS board_posts (
  slug TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('ko', 'en')),
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, locale)
);

CREATE INDEX IF NOT EXISTS idx_board_locale_date ON board_posts (locale, date DESC);

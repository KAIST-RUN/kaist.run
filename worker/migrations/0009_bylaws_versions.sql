-- 회칙을 "현재 버전 하나"에서 "역대 버전 목록"으로 바꿉니다. 0007에서 만든
-- bylaws_page(단일 원문 텍스트)는 이 구조로 대체되어 더 이상 안 씁니다 — content는
-- 이제 자유 텍스트가 아니라 backstage의 +버튼 에디터가 만드는 구조화된 JSON입니다
-- (blocks: { type, text }[], src/lib/bylaws.ts가 type 순서를 보고 번호를 매김).
--
-- locale 구분이 없는 건 기존 bylaws_page와 같은 이유(번역 없는 한국어 문서)입니다.
-- "현재 버전"은 별도 플래그 없이 effective_date가 가장 최신인 행으로 정합니다 —
-- 새 개정본을 추가하기만 하면 자동으로 그게 현재 버전이 됩니다.

DROP TABLE IF EXISTS bylaws_page;

CREATE TABLE IF NOT EXISTS bylaws_version (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  version_label TEXT NOT NULL, -- 예: "현행 (2026년 개정)", "2017년 제정"
  effective_date TEXT NOT NULL, -- YYYY-MM-DD, 정렬/현재 버전 판단 기준
  revision_history TEXT NOT NULL DEFAULT '[]', -- JSON: { date, label }[]
  blocks TEXT NOT NULL DEFAULT '[]', -- JSON: { type, text }[]
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bylaws_version_effective_date ON bylaws_version (effective_date DESC);

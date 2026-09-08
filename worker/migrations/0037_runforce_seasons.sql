-- RUNFORCE 시즌 아카이빙. season_id가 NULL이면 "현재 시즌" 대회이고, 값이 채워지면
-- 그 시즌으로 마감되어 목록/집계에서는 빠지지만 대회 상세/CSV는 그대로 조회 가능합니다
-- (worker/src/lib/runforce.ts::archiveCurrentRunforceSeason 참고). 최종 순위표는
-- 아카이빙 시점의 멤버십 기준으로 한 번 계산해 runforce_season_leaderboard에 얼려서
-- 저장합니다 — 나중에 다시 계산하면 그새 멤버십이 바뀌어 값이 달라질 수 있어서입니다.

ALTER TABLE runforce_contests ADD COLUMN season_id TEXT;

CREATE TABLE IF NOT EXISTS runforce_seasons (
  id TEXT PRIMARY KEY,
  name TEXT,
  range_start_date TEXT,
  range_end_date TEXT,
  archived_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_by_name TEXT
);

CREATE TABLE IF NOT EXISTS runforce_season_leaderboard (
  season_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  name_snapshot TEXT,
  total_score REAL NOT NULL,
  contests_counted INTEGER NOT NULL,
  PRIMARY KEY (season_id, uid)
);

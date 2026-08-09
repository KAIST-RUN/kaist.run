-- 역대 회원 명단 구글 시트 설정. 비어 있으면(연결 안 한 초기 상태) 기존 방식대로
-- ROSTER_ALL_TIME_SHEET_ID 시크릿을 그대로 씁니다 — 배포 직후에도 동작이 안 끊깁니다.
-- backstage에서 새 시트를 연결하면 이 테이블의 값이 우선합니다.

CREATE TABLE IF NOT EXISTS roster_sheet (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sheet_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

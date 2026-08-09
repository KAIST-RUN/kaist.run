-- 회칙 원문. 번역이 없는 한국어 단일 문서라 notices/archive/contact_page와 달리
-- locale 컬럼 없이 한 행(id=1)만 둡니다 — apply_form과 같은 싱글턴 패턴입니다.
-- content는 .claude/preview.py / src/lib/bylaws.ts가 파싱하는 원문 문법 그대로입니다
-- (첫 줄 제목, 둘째 줄 [개정이력], '-' 개수로 장/조/항/호/목 자동 채번).

CREATE TABLE IF NOT EXISTS bylaws_page (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

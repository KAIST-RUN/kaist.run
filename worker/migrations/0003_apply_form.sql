-- 지원 폼(/apply) 설정. 구글 폼 자체의 구조(문항 순서/유형/entry ID/선택지 값)는
-- backstage의 "구글 폼 연결" 기능이 공개 viewform 페이지를 파싱해서 채우고,
-- 화면에 보여줄 한국어/영어 문구만 관리자가 이 테이블에서 편집합니다.

CREATE TABLE IF NOT EXISTS apply_form (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- 설정 한 벌만 존재(싱글턴)
  form_id TEXT NOT NULL DEFAULT '', -- 구글 폼 게시 ID (viewform/formResponse URL 재구성용)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS apply_form_question (
  entry_id TEXT PRIMARY KEY, -- 구글 폼의 entry.XXXXXXX 중 숫자 부분
  position INTEGER NOT NULL, -- 폼에 나타나는 순서
  type TEXT NOT NULL CHECK (type IN ('short_answer','paragraph','radio','checkbox','dropdown')),
  required INTEGER NOT NULL DEFAULT 1,
  -- 이 문항이 지원자의 카이스트 이메일 문항인지. 전체 문항 중 최대 1개만 1이어야
  -- 하고(backstage에서 라디오 선택으로 강제, 저장 시 서버에서도 재검증), short_answer
  -- 유형에만 의미가 있습니다.
  validate_kaist_email INTEGER NOT NULL DEFAULT 0,
  source_title TEXT NOT NULL DEFAULT '', -- 구글 폼 원문 질문(편집 화면의 힌트용, 재연결 시 갱신)
  label_ko TEXT NOT NULL DEFAULT '',
  label_en TEXT NOT NULL DEFAULT '',
  -- JSON: { value, sourceLabel, labelKo, labelEn }[]
  -- value = 구글 폼에 실제로 제출되는 값(원문 그대로, 재연결 때만 갱신). short_answer/
  -- paragraph 문항은 항상 '[]'.
  choices TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apply_form_question_position ON apply_form_question (position);

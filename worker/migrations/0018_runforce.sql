-- RUNFORCE: ~4주 "집중훈련" 기간 동안 활동회원의 Codeforces/AtCoder 대회 성적을 다른
-- 활동회원과 상대평가해 포인트(RUNFORCE)로 환산하는 기능입니다. 세 테이블로 나눕니다:
--   runforce_config   — "날짜범위 자동탐색" on/off + 범위(싱글턴 1행)
--   runforce_contests — 산정 대상으로 등록된 대회 카탈로그(수동/자동)
--   runforce_results  — 대회별로 "확정되고 그 뒤로 절대 안 바뀌는" 회원별 순위/점수 스냅샷
--
-- 핵심 불변식(요구사항): runforce_contests에 한 번 들어간 대회는, 그걸 지우고
-- 다시 추가하기 전까진 runforce_results가 재계산되지 않습니다(무작위 동점 처리
-- 결과 포함). 이 저장소의 다른 마이그레이션처럼 FK는 안 씁니다 — cascade 삭제는
-- 애플리케이션 코드(worker/src/lib/members.ts::deleteUser, worker/src/lib/
-- runforce.ts::removeTargetContest)가 명시적으로 처리합니다.

CREATE TABLE IF NOT EXISTS runforce_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- 싱글턴 행 하나만 허용(항상 id=1)
  auto_discovery_enabled INTEGER NOT NULL DEFAULT 0,
  range_start_date TEXT, -- 'YYYY-MM-DD' (KST 기준 날짜). auto_discovery_enabled=1일 때만 의미 있음
  range_end_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO runforce_config (id, auto_discovery_enabled, range_start_date, range_end_date)
  VALUES (1, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

-- RUNFORCE 산정 대상으로 등록된 대회 목록입니다. 여기 한 행이 존재한다는 것
-- 자체가 "이미 계산 완료"라는 뜻입니다 — add 시점에 곧바로 순위/점수까지
-- 계산해서 runforce_results에 같이 써넣습니다(worker/src/lib/runforce.ts::
-- addTargetContest가 두 테이블에 원자적으로 씀).
CREATE TABLE IF NOT EXISTS runforce_contests (
  id TEXT PRIMARY KEY, -- crypto.randomUUID() — users.uid와 같은 관례
  platform TEXT NOT NULL CHECK (platform IN ('codeforces', 'atcoder')),
  contest_id TEXT NOT NULL, -- 플랫폼 원본 ID. 코드포스는 숫자, 앳코더는 'abc300' 같은 문자열이라 항상 TEXT로 통일
  contest_name TEXT NOT NULL,
  start_time_ms INTEGER NOT NULL, -- 대회 시작 시각(epoch ms) — 목록 정렬/표시용
  source TEXT NOT NULL CHECK (source IN ('manual', 'auto')),
  added_by_uid TEXT, -- source='manual'일 때만 값이 있음(등록한 관리자)
  added_by_name TEXT, -- 감사기록이라 그 시점 이름 스냅샷(admins/honorary_members와 같은 관례)
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  participant_count_snapshot INTEGER NOT NULL -- 계산 시점 활동회원 총원(랭킹 분모) — runforce_results 행 수와 항상 같음
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runforce_contests_platform_id ON runforce_contests (platform, contest_id);

-- 대회별 · 회원별로 "확정되고 절대 안 바뀌는" 결과 스냅샷입니다. final_rank/x/score는
-- 계산 시점에 한 번 정해지면 그 뒤로 재계산되지 않습니다(동점 무작위 처리 결과
-- 포함) — 다시 계산하려면 이 대회를 runforce_contests에서 지웠다가 다시 추가해야
-- 합니다. handle_snapshot도 마찬가지로 계산 시점 값을 고정합니다(그 뒤 본인이
-- 핸들을 바꿔도 이 행은 안 바뀜).
CREATE TABLE IF NOT EXISTS runforce_results (
  contest_id TEXT NOT NULL, -- runforce_contests.id
  uid TEXT NOT NULL, -- users.uid
  handle_snapshot TEXT, -- 계산 시점 이 유저의 그 사이트 핸들. NULL이면 핸들 미등록(=미참가자로 취급됨)
  platform_rank INTEGER, -- 대회 원본 순위(1-indexed). 미참가자(핸들 없음/참가 안 함)는 NULL
  final_rank INTEGER NOT NULL, -- 동점 무작위 처리 후 확정된 0-indexed 순위
  x REAL NOT NULL, -- 1 - final_rank/participant_count_snapshot
  score REAL NOT NULL, -- 점수 공식 결과값(0~300000)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (contest_id, uid)
);
-- 유저 탈퇴 cascade(그 유저 행만 지움), /api/me의 "내 전체 이력" 조회, 리더보드의
-- uid별 SUM(score) 집계가 전부 이 인덱스를 씁니다.
CREATE INDEX IF NOT EXISTS idx_runforce_results_uid ON runforce_results (uid);

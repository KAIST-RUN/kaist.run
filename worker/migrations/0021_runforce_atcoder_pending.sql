-- AtCoder 순위표(handle→rank)는 atcoder.jp/contests/{id}/results/json에서만 얻을 수 있는데,
-- 이 Worker(Cloudflare)의 발신 IP 대역이 atcoder.jp에서 통째로 403 차단됩니다
-- (worker/src/lib/atcoder.ts 상단 주석 참고). Cloudflare 밖에서 도는 runBot(Discord 봇)이
-- 대신 fetch해서 bot API로 넘겨주는 중계 구조를 쓰기 위한 대기열입니다.
--
-- 대회 메타(이름/시작시각/rated 여부)는 kenkoooo.com에서 이미 문제없이 가져오므로 여기
-- 저장하지 않습니다 — 여기 있는 건 순수하게 "이 contest_id의 순위표를 아직 못 구했다"는
-- 표시뿐입니다. 봇이 순위표를 넘기면(POST /api/bot/runforce/atcoder-standings) 이 행은
-- 지워지고 runforce_contests/runforce_results에 정상 계산되어 들어갑니다
-- (worker/src/lib/runforce.ts::completeAtCoderContest).
CREATE TABLE IF NOT EXISTS runforce_atcoder_pending (
  contest_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('manual', 'auto')),
  added_by_uid TEXT, -- source='manual'일 때만 값이 있음(등록한 관리자) — runforce_contests와 같은 관례
  added_by_name TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);

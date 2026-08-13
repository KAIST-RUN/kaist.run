-- 자동탐색이 대회 목록을 조회하는 것(가벼움, API 호출 한 번)과 실제로 그 대회를
-- 계산하는 것(무거움 — rated 확인·순위표 조회·unrated 참가자 확인까지 여러 API 호출)을
-- 분리하기 위한 큐입니다. 예전엔 한 틱(매시 정각)에 최대 5개까지만 처리해서 밀린 대회가
-- 많으면 다 채워지기까지 몇 시간씩 걸렸는데, 이제는 후보를 찾자마자 전부 여기 큐에 넣고
-- (enqueueDiscoveredContests), 별도의 1분 간격 크론(processDiscoveryQueue)이 큐에서
-- 몇 개씩 꺼내 실제로 계산합니다 — 훨씬 빨리 다 채워집니다.
CREATE TABLE IF NOT EXISTS runforce_discovery_queue (
  id TEXT PRIMARY KEY, -- crypto.randomUUID()
  platform TEXT NOT NULL CHECK (platform IN ('codeforces', 'atcoder')),
  contest_id TEXT NOT NULL,
  contest_name TEXT NOT NULL,
  start_time_ms INTEGER NOT NULL,
  queued_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runforce_discovery_queue_platform_id ON runforce_discovery_queue (platform, contest_id);
-- 오래된 순으로 몇 개씩 꺼내 쓰므로 조회 인덱스.
CREATE INDEX IF NOT EXISTS idx_runforce_discovery_queue_queued_at ON runforce_discovery_queue (queued_at);

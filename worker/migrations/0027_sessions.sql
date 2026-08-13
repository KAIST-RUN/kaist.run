-- 로그인 세션 저장소를 KV(SESSIONS 네임스페이스)에서 D1로 옮깁니다.
--
-- 이유: KV는 최종적 일관성(리전 간 비동기 복제, 최대 ~60초)이라 "로그인 콜백이 쓰고
-- 리다이렉트 직후 /api/me가 읽는" 세션의 사용 패턴과 계약이 안 맞습니다. Smart Placement
-- 도입 후 콜백과 /api/me가 서로 다른 위치에서 실행될 수 있게 되면서, 방금 만든 세션이
-- 아직 복제 안 된 리전에서 읽혀 401이 나는 문제가 간헐적으로 발생했습니다(KV는 "없음"
-- 결과도 최대 60초 캐시해서 곧바로 재시도해도 실패). D1은 단일 primary라 어디서 실행되든
-- 쓰기 직후 읽기가 보장됩니다.
--
-- 기존 KV 세션은 남은 유효기간(최대 30일) 동안 fallback으로 계속 인정합니다
-- (worker/src/lib/session.ts 참고).
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  discord_display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- KV의 expirationTtl을 대신하는 만료 시각. 읽기에서 걸러내고(getSession), 지난 행은
  -- 매시 정각 크론이 지웁니다(index.ts::scheduled).
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

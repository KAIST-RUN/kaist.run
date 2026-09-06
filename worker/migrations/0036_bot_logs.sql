-- 디스코드 봇(별도 저장소, 이 Worker 밖에서 실행)의 런타임 로그를 backstage에서
-- 훑어볼 수 있게 받아 쌓아두는 테이블입니다(POST /api/bot/logs). 감사 기록이 아니라
-- "서버 콘솔 접근 권한이 없는 관리자가 봇 상태를 확인하는 용도"라 오래 보관할 필요가
-- 없습니다 — 매시 정각 크론(index.ts::scheduled)이 7일 지난 행을 지웁니다
-- (worker/src/lib/botLogs.ts::purgeOldBotLogs, BOT_LOG_RETENTION_DAYS 참고).
--
-- line: 봇 쪽에서 이미 타임스탬프까지 붙여 완성한 한 줄. 여기선 그대로 저장/표시만
-- 하고 추가 파싱은 하지 않습니다. received_at은 표시용이 아니라 순수 보관기간 계산용
-- (봇이 배치로 보내는 시각 ≈ 로그가 실제로 찍힌 시각, 몇십 초 오차는 무의미).
--
-- 회원/이메일 등 일반 회원 데이터 테이블과는 완전히 분리된 전용 테이블입니다.
CREATE TABLE IF NOT EXISTS bot_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bot_logs_received_at ON bot_logs (received_at);

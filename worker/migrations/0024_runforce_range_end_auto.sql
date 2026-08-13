-- 자동 탐색 종료일을 "고정 날짜"와 "항상 오늘"로 분리합니다. 이전엔 range_end_date를
-- NULL로 지워서 "오늘 자동"을 표현했는데, 그러면 관리자가 마지막으로 입력해뒀던 날짜가
-- 사라져서 자동 설정을 껐을 때 되돌릴 값이 없었습니다. 이제 range_end_date는 항상
-- 마지막으로 입력한 값을 그대로 보존하고, range_end_auto가 켜져 있으면 그 값 대신
-- "오늘"을 동적으로 씁니다(worker/src/lib/runforce.ts::enqueueDiscoveredContests).
ALTER TABLE runforce_config ADD COLUMN range_end_auto INTEGER NOT NULL DEFAULT 0;

-- "항상 오늘 날짜로 자동 설정" 기능을 제거합니다(코드 전체 삭제와 함께) — 이제
-- 종료일은 관리자가 입력한 값을 그대로 씁니다. 0024_runforce_range_end_auto.sql로
-- 만든 컬럼을 지웁니다.
ALTER TABLE runforce_config DROP COLUMN range_end_auto;

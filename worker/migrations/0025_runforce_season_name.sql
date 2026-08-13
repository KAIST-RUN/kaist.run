-- 관리자가 backstage RUNFORCE 탭에서 지정하는 "현재 시즌 이름"(예: "Beta Season").
-- 마이페이지의 RUNFORCE 정보 카드에 시즌 이름과 적용 기간을 같이 보여주기 위한 값이라,
-- 집계 로직에는 전혀 관여하지 않는 순수 표시용입니다.
--
-- NULL이거나 빈 문자열이면 마이페이지에서 시즌 줄을 아예 안 그립니다(설정 전 상태).
ALTER TABLE runforce_config ADD COLUMN season_name TEXT;

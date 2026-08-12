-- Codeforces는 가끔 한 라운드를 Div. 1 / Div. 2 두 개의 서로 다른 contest_id로 쪼개서
-- 동시에 엽니다. 이 경우 RUNFORCE는 둘 다 독립된 대회처럼 각각 전부 계산은 하되(참가자/
-- 미참가자 순위 스냅샷 둘 다 그대로 저장 — runforce_results는 안 건드림), 최종 합산
-- (리더보드/마이페이지 총점) 시엔 회원 한 명당 이 둘 중 "실제로 참가한 쪽 하나"만
-- 반영합니다 — 안 그러면 같은 라운드가 두 번 집계되어 버립니다. 규칙: Div1에 실제로
-- 참가(platform_rank가 있음)한 회원은 Div1 점수를, 그 외(Div2 참가 또는 둘 다 미참가)는
-- Div2 점수를 가져갑니다 (worker/src/lib/runforce.ts::computeEffectiveBreakdownByUid).
--
-- division은 대회 이름에서 자동으로 판별해 추가 시점에 채워 넣습니다("Div. 1 + Div. 2"처럼
-- 합쳐진 라운드는 판별 대상 아님 → NULL). paired_contest_id는 같은 시작 시각의 반대
-- division 대회가 있으면(수동 추가든 자동 탐색이든) addTargetContest가 자동으로 서로
-- 연결하고, 필요하면 backstage에서 수동으로도 연결/해제할 수 있습니다.
ALTER TABLE runforce_contests ADD COLUMN division TEXT CHECK (division IN ('div1', 'div2'));
ALTER TABLE runforce_contests ADD COLUMN paired_contest_id TEXT;

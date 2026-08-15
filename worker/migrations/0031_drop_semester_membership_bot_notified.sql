-- 승인 알림(DM) 봇 큐 기능을 제거합니다(코드 전체 삭제와 함께) —
-- 0030_semester_membership_bot_notified.sql로 만든 컬럼을 지웁니다.
ALTER TABLE semester_membership DROP COLUMN bot_notified_at;

-- 승인을 디스코드 DM으로 봇이 알렸는지 추적하는 소비 커서. approved_at(누가 언제
-- 승인했는지)과는 별개 개념이라 컬럼도 분리합니다 — 승인 로직(semesters.ts의
-- approveSemesterMembership/addSemesterMember)은 이 컬럼을 전혀 건드리지 않고,
-- 오직 /api/bot/approvals/ack만 채웁니다. NULL = 아직 봇이 안 가져감.
ALTER TABLE semester_membership ADD COLUMN bot_notified_at TEXT;

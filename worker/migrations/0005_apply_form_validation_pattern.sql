-- 문항마다 "카이스트 이메일 검증" 하나만 고를 수 있던 걸(validate_kaist_email, 전체
-- 문항 중 최대 1개), 문항마다 자유롭게 정규식을 지정할 수 있는 방식으로 바꿉니다.
-- 빈 문자열이면 검증 없음. 기존에 카이스트 이메일 검증으로 지정돼 있던 문항은 그
-- 정규식으로 자동 채워서 동작이 그대로 유지되게 합니다.

ALTER TABLE apply_form_question ADD COLUMN validation_pattern TEXT NOT NULL DEFAULT '';

UPDATE apply_form_question
SET validation_pattern = '^[^\s@]+@kaist\.ac\.kr$'
WHERE validate_kaist_email = 1;

ALTER TABLE apply_form_question DROP COLUMN validate_kaist_email;

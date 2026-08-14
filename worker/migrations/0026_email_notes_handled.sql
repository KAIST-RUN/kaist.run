-- 메모와 별개로 "처리 완료" 여부도 메일마다 표시할 수 있게 합니다. 목록에서
-- 처리 완료 뱃지를 보여주려면 메모가 비어 있어도(=핸들만 켠 경우) 행이 남아있어야
-- 해서, email_notes를 지우는 기준도 "메모도 비어있고 처리完료도 아닐 때"로 넓힙니다
-- (worker/src/lib/emailIndex.ts::setEmailNoteState).
ALTER TABLE email_notes ADD COLUMN handled INTEGER NOT NULL DEFAULT 0;

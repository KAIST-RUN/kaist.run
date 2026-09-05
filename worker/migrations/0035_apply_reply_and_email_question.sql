-- /apply 제출 후 지원자에게 자동으로 회신 메일을 보내기 위한 설정입니다.
--
-- 서두(reply_intro_*)를 DB에 두는 이유: 개강총회 날짜처럼 리크루팅 때마다 바뀌는
-- 문구가 들어가는데, 그때마다 코드를 고치고 재배포할 수는 없어서 backstage에서
-- 편집합니다. 메일 본문은 Worker가 발송 시점에 읽으므로 재배포 없이 즉시 반영됩니다.
--
-- success_note_*는 제출 완료 화면(정적 페이지)에 뜨는 안내문이라, 이건 저장 후
-- 재빌드가 돌아야 반영됩니다. 비워두면 프런트의 i18n 기본 문구가 쓰입니다.
--
-- reply_enabled 기본값이 0이라, Email Sending 도메인 온보딩이 끝나기 전까지는
-- 관리자가 켜지 않는 한 아무 메일도 나가지 않습니다.
ALTER TABLE apply_form ADD COLUMN reply_enabled    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE apply_form ADD COLUMN reply_subject_ko TEXT NOT NULL DEFAULT '';
ALTER TABLE apply_form ADD COLUMN reply_subject_en TEXT NOT NULL DEFAULT '';
ALTER TABLE apply_form ADD COLUMN reply_intro_ko   TEXT NOT NULL DEFAULT '';
ALTER TABLE apply_form ADD COLUMN reply_intro_en   TEXT NOT NULL DEFAULT '';
ALTER TABLE apply_form ADD COLUMN success_note_ko  TEXT NOT NULL DEFAULT '';
ALTER TABLE apply_form ADD COLUMN success_note_en  TEXT NOT NULL DEFAULT '';

-- 0005에서 없앴던 "이 문항이 지원자의 이메일 문항" 표시자를 되살립니다. 0005는
-- 이걸 자유 정규식(validation_pattern)으로 대체했는데, 그건 "입력값이 이 형식이어야
-- 한다"는 검증 규칙일 뿐이라 "어느 문항의 값이 회신 수신 주소인가"를 알려주지
-- 못합니다. 두 축을 다시 분리해서, 정규식은 그대로 문항별 자유 검증으로 두고
-- 수신 주소 지정만 이 컬럼이 담당합니다. 전체 문항 중 최대 1개만 1이어야 하고
-- (backstage에서 라디오로 강제, 저장 시 서버에서도 재검증), short_answer 유형에만
-- 의미가 있습니다.
ALTER TABLE apply_form_question ADD COLUMN is_applicant_email INTEGER NOT NULL DEFAULT 0;

-- 이미 카이스트 이메일 정규식이 걸려 있는 문항(0004가 심은 entry 653190702)을
-- 자동으로 지정해 둡니다 — 관리자가 backstage에 들어가기 전에도 회신이 동작하도록.
-- 해당하는 문항이 없으면 아무것도 지정되지 않고, 그 상태에선 이메일 검증과 회신을
-- 둘 다 건너뜁니다(제출 자체는 지금까지처럼 그대로 통과).
UPDATE apply_form_question SET is_applicant_email = 1
 WHERE entry_id = (
   SELECT entry_id FROM apply_form_question
    WHERE validation_pattern LIKE '%kaist%'
    ORDER BY position LIMIT 1
 );

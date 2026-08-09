-- 지금 src/config/applyForm.ts + messages/{ko,en}.json에 하드코딩되어 있던 값을
-- 그대로 옮겨 심습니다 — 이 마이그레이션 직후 배포되는 동적 /apply 페이지가 지금과
-- 완전히 동일하게 렌더링되도록 하기 위함입니다 (source_title은 원본 구글 폼의 실제
-- 문구를 아직 안 가져온 상태라, 잠정적으로 한국어 라벨과 같은 값을 넣어뒀습니다 —
-- 나중에 backstage에서 "연결"을 한 번 실행하면 실제 원문으로 갱신됩니다).

INSERT INTO apply_form (id, form_id) VALUES
  (1, '1FAIpQLSetSxfUI39leQMdfgKs37qKI-AG0_Ti-Q9jHRTZjg97ba5HIg')
ON CONFLICT (id) DO UPDATE SET form_id = excluded.form_id;

INSERT INTO apply_form_question (entry_id, position, type, required, validate_kaist_email, source_title, label_ko, label_en, choices) VALUES
  ('1955851386', 1, 'short_answer', 1, 0, '이름', '이름', 'Name', '[]'),
  ('1697910141', 2, 'short_answer', 1, 0, '학번', '학번', 'Student ID', '[]'),
  ('2083396902', 3, 'short_answer', 1, 0, '전화번호', '전화번호 (0XX-XXXX-XXXX 형식으로 써 주세요) 또는 기타 연락처', 'Your phone number (on the form 0XX-XXXX-XXXX) or any method to contact you', '[]'),
  ('653190702', 4, 'short_answer', 1, 1, '카이스트 이메일', '카이스트 이메일', 'Your email that ends with @kaist.ac.kr', '[]'),
  ('1709014813', 5, 'paragraph', 1, 0, '지원 동기', '지원 동기', 'How did you decide to apply?', '[]'),
  ('1449610851', 6, 'paragraph', 1, 0, 'Problem Solving 관련 경험', 'Problem Solving 관련 경험(없어도 상관없음!!!!)', 'Problem solving experience (you can join regardless of your answer!)', '[]'),
  (
    '511102785', 7, 'radio', 1, 0,
    '동아리 활동에 성실히 참여할 자신이 있으신가요?',
    '동아리 활동에 성실히 참여할 자신이 있으신가요?',
    'Are you going to participate in club activities actively?',
    '[{"value":"네(Yes)","sourceLabel":"네(Yes)","labelKo":"네","labelEn":"Yes"}]'
  ),
  (
    '1776735102', 8, 'radio', 1, 0,
    '동아리 정기 모임은 수요일 오후 9시 30분에 있습니다. 보통은 비대면, 비실시간으로 진행됩니다.',
    '동아리 정기 모임은 수요일 오후 9시 30분에 있습니다. 보통은 비대면, 비실시간으로 진행됩니다.',
    'Our regular club meetings will be at Wednesday 9:30 pm. Normally however, the meetings are asynchronous remote.',
    '[{"value":"I read and understood","sourceLabel":"I read and understood","labelKo":"확인했습니다","labelEn":"I read and understood"}]'
  ),
  (
    '516469068', 9, 'radio', 1, 0,
    '3월 11(저녁 9시 반)일에 N1 102 호에서 첫 개강총회가 이루어질 예정입니다. 정기 모임은 필수참여가 아니지만, 개강총회는 필수로 참가해야 합니다. 개강총회 참석이 불가하면  010-9509-0057로 연락주세요.',
    '3월 11(저녁 9시 반)일에 N1 102 호에서 첫 개강총회가 이루어질 예정입니다. 정기 모임은 필수참여가 아니지만, 개강총회는 필수로 참가해야 합니다. 개강총회 참석이 불가하면  010-9509-0057로 연락주세요.',
    'The first club meeting is scheduled on March 11th(9:30 PM) at N1 room 102. Although club meetings are not mandatory, you have to attend the first club meeting in person. If you want to enroll in the club but cannot take part in the first club meeting, contact me at  010-9509-0057',
    '[{"value":"I read and understand","sourceLabel":"I read and understand","labelKo":"확인했습니다","labelEn":"I read and understood"}]'
  )
ON CONFLICT (entry_id) DO UPDATE SET
  position = excluded.position, type = excluded.type, required = excluded.required,
  validate_kaist_email = excluded.validate_kaist_email, source_title = excluded.source_title,
  label_ko = excluded.label_ko, label_en = excluded.label_en, choices = excluded.choices,
  updated_at = datetime('now');

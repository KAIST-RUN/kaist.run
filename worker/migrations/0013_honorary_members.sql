-- 명예회원 목록입니다 (회칙 제4조: 회원은 정회원과 명예회원으로 구성 — content/bylaws/ko.txt
-- 참고, 이건 회칙 "본문 텍스트"일 뿐 지금까지 이 정보를 실제로 관리하는 구조는 없었습니다).
-- admins 테이블과 정확히 같은 이유로 role 컬럼이 아니라 별도 테이블입니다 — 명예회원이면서
-- 동시에 admins에도 있는(관리자인) 경우가 있을 수 있어서, 두 축을 독립적으로 둡니다.
CREATE TABLE IF NOT EXISTS honorary_members (
  uid TEXT PRIMARY KEY,
  granted_by_uid TEXT,
  granted_by_name TEXT, -- 감사기록이라 그 시점 이름을 스냅샷으로 같이 저장합니다(admins와 동일 관례).
  granted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

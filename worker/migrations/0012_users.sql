-- 회원 데이터의 원천을 구글 스프레드시트에서 D1로 옮깁니다. discordId 대신 예측
-- 불가능한 uid(crypto.randomUUID())를 PK로 쓰고, "학기별 소속"을 승인 워크플로와
-- 함께 표현합니다 (기존 시트는 "역대 전체 명단" 하나뿐이라 학기 구분이 없었습니다).
--
-- status(신청중/재학/졸업)와 role(회원/관리자)은 여기 컬럼으로 안 둡니다 — admins/
-- semester_membership과 어긋날 수 있어서, 조회할 때마다 계산합니다(worker/src/lib/
-- members.ts 참고). 이 저장소의 다른 마이그레이션들과 마찬가지로 FK 절은 안 씁니다
-- (D1의 SQLite가 기본으로 강제하지 않아 문서화 이상의 의미가 없음) — cascade 삭제는
-- 애플리케이션 코드(deleteUser)에서 명시적으로 처리합니다.

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  name TEXT,
  email TEXT,
  student_id TEXT,
  phone TEXT,
  solved_ac TEXT,
  codeforces TEXT,
  atcoder TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users (discord_id);

-- "관리자 권한이 있는 유저의 UID 목록" — role 컬럼이 아니라 별도 테이블로 둡니다
-- (기존 시트의 "관리자" 탭과 같은 관계). 존재하면 관리자, 없으면 일반 회원.
CREATE TABLE IF NOT EXISTS admins (
  uid TEXT PRIMARY KEY,
  granted_by_uid TEXT,
  granted_by_name TEXT, -- 감사기록이라 그 시점 이름을 스냅샷으로 같이 저장합니다.
  granted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 어떤 학기가 "열려" 있는지(존재하는지) + 그중 지금이 몇 학기인지를 관리자가 backstage에서
-- 명시적으로 관리하는 카탈로그입니다. 디스코드 봇이 학기 문자열을 하드코딩/추측하지
-- 않도록, "현재 학기"는 여기서 서버가 결정합니다.
CREATE TABLE IF NOT EXISTS semesters (
  year INTEGER NOT NULL,
  season TEXT NOT NULL CHECK (season IN ('spring', 'fall')),
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (year, season)
);
-- 언제나 최대 하나의 행만 is_current=1이도록 부분 유니크 인덱스로 보강합니다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_semesters_current ON semesters (is_current) WHERE is_current = 1;

-- "학기별 활동회원"의 승인 워크플로. 디스코드 봇이 등록을 요청하면 pending으로
-- 생기고, 관리자가 backstage 학기별 명단 페이지에서 승인해야만 approved가 됩니다
-- (approved만 "그 학기에 소속됨"으로 칩니다 — src/lib/bylaws 스타일 코멘트 관례를
-- 따라 여기도 왜 이렇게 되는지 남겨둡니다: 봇이 아무나 등록을 요청할 수 있어서,
-- 실제로 명단에 반영되는 건 사람이 확인한 뒤여야 합니다).
CREATE TABLE IF NOT EXISTS semester_membership (
  uid TEXT NOT NULL,
  year INTEGER NOT NULL,
  season TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved')) DEFAULT 'pending',
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by_uid TEXT,
  approved_by_name TEXT, -- "OO이 승인함" — 승인 시점 이름 스냅샷.
  approved_at TEXT,
  PRIMARY KEY (uid, year, season)
);
CREATE INDEX IF NOT EXISTS idx_semester_membership_semester ON semester_membership (year, season, status);

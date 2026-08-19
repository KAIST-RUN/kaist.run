-- solved.ac/Codeforces/AtCoder 핸들(0012_users.sql)에 이어 DOJ 핸들 컬럼을 추가합니다.
-- RUNFORCE 채점 대상은 아니고(runforce.ts는 codeforces/atcoder만 씀), 마이페이지/
-- backstage에 표시·수정 가능한 프로필 핸들로만 취급합니다.
ALTER TABLE users ADD COLUMN doj TEXT;

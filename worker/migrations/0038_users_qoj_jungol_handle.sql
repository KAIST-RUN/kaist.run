-- DOJ 핸들(0032_users_doj_handle.sql)에 이어 QOJ/정올(jungol) 핸들 컬럼을 추가합니다.
-- 마찬가지로 RUNFORCE 채점 대상은 아니고, 마이페이지/backstage에 표시·수정 가능한
-- 프로필 핸들로만 취급합니다.
ALTER TABLE users ADD COLUMN qoj TEXT;
ALTER TABLE users ADD COLUMN jungol TEXT;

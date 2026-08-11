-- 지금까지는 effective_date가 가장 최신인 버전이 자동으로 kaist.run/bylaws에
-- 뜨는 방식이라, 아직 편집 중인 새 버전을 만들자마자 (완성되지 않았어도) 바로
-- 공개되는 문제가 있었습니다. 게시 여부를 별도로 관리할 수 있게 플래그를 추가합니다.
-- 기존 행은 전부 이미 게시된 걸로 취급합니다(기본값 1).
ALTER TABLE bylaws_version ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1;

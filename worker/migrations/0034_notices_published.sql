-- 공지 공개/비공개 토글 (backstage 공지 편집 화면의 "공개" 체크박스).
-- 비공개(0)면 공개 콘텐츠 API(routes/content.ts)가 목록/상세 양쪽에서 걸러내므로,
-- 다음 정적 빌드부터 메인 사이트에 아예 나타나지 않습니다. backstage 목록에는 그대로
-- 보이되 "비공개" 배지가 붙습니다(회칙의 게시/초안과 같은 패턴).
-- 기존 공지는 전부 공개 상태 그대로 유지됩니다(DEFAULT 1).
ALTER TABLE notices ADD COLUMN published INTEGER NOT NULL DEFAULT 1;

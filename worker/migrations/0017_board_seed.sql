-- output: export 정적 사이트는 동적 라우트([slug])에 생성할 페이지가 하나도 없으면
-- 빌드 자체가 실패합니다(Next.js가 "generateStaticParams가 없다"고 오판함) — 그래서
-- board_posts가 비어있는 채로는 사이트를 빌드할 수 없습니다. 게시판을 처음 여는
-- 안내 글을 하나 심어서 이 문제를 피합니다.
INSERT INTO board_posts (slug, locale, title, date, pinned, content) VALUES (
  'welcome', 'ko', '게시판이 열렸습니다', date('now'), 1,
  'RUN 회원 여러분을 위한 게시판을 새로 열었습니다. 이 게시판의 글은 운영진이 작성합니다.'
);
INSERT INTO board_posts (slug, locale, title, date, pinned, content) VALUES (
  'welcome', 'en', 'The board is now open', date('now'), 1,
  'We''ve opened a new board for RUN members. Posts here are written by the club officers.'
);

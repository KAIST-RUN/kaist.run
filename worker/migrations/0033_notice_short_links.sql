-- 공지글 짧은 URL: kaist.run/<code> (2글자) 로 접속하면 해당 공지로 리다이렉트됩니다.
-- 리다이렉트 자체는 정적 사이트의 404 페이지 인라인 스크립트가 공개 API
-- (GET /api/content/short-links/:code)로 코드를 slug로 해석해서 수행합니다 — 정적
-- 익스포트(GitHub Pages)라 서버 리다이렉트가 불가능해서, 미지 경로가 모두 404.html로
-- 떨어지는 성질을 관문으로 씁니다. (src/app/not-found.tsx 참고)
--
-- code는 [A-Za-z0-9] 2글자, 대소문자를 구분합니다(62^2 = 3,844개). 단 실제 루트 경로와
-- 겹치는 ko/en/my는 대소문자 무시하고 예약어로 발급에서 제외합니다(사람이 혼동하지 않게
-- — worker/src/lib/content.ts::createShortLink). 발급은 backstage 공지 수정 화면에서
-- 수동으로 하고, 공지 삭제 시 함께 지워집니다(deleteNotice). slug는 backstage에서 수정
-- 불가(readonly)라 매핑이 깨질 일이 없습니다.
CREATE TABLE IF NOT EXISTS notice_short_links (
  code TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 공지 하나당 코드 하나 — 같은 slug에 동시 발급이 겹쳐도 두 번째가 조용히 실패하고
-- 기존 코드를 돌려받습니다(createShortLink).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notice_short_links_slug ON notice_short_links (slug);

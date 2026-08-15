import { page, escapeHtml, formatKstDateTime, renderEmailListBody, renderEmailPageBody, type EmailListPageInfo } from "./emailRender";
import type { EmailIndexEntry, EmailNoteState } from "./emailIndex";
import type { Email } from "postal-mime";
import type { UserRecord } from "./members";
import { MEMBER_EXPORT_COLUMNS } from "./members";
import type { SemesterInfo, SemesterMemberRow, UserSemesterEntry } from "./semesters";
import { SEMESTER_EXPORT_COLUMNS } from "./semesters";
import type {
  NoticeRow,
  ArchiveRow,
  ContactRow,
  ContactInfoRow,
  ContactSocial,
  Season,
  BylawsVersionSummary,
  BylawsBlock,
  BylawsRevisionHistory,
} from "./content";
import type { UploadedFile } from "./uploads";
import type { ApplyFormConfig, ApplyFormQuestion, ConnectResult } from "./applyForm";
import {
  formatRunforceDisplay,
  groupContests,
  runforceMaxScoreFor,
  runforceWeightMultiplier,
  RUNFORCE_LEADERBOARD_EXPORT_COLUMNS,
  RUNFORCE_CONTEST_EXPORT_COLUMNS,
  type AtCoderPendingEntry,
  type RunforceDiscoveryQueueEntry,
  type ContestGroup,
  type RunforceConfig,
  type RunforceContestDetail,
  type RunforceContestSummary,
  type RunforceLeaderboardEntry,
  type RunforcePlatform,
  type RunforceRankedRow,
} from "./runforce";

const FORM_STYLE = `
  html { scrollbar-gutter: stable; }
  body { max-width: 960px; }
  h1 { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.01em; }

  /* nav(☰ + 링크들)와 로그아웃은 이제 backstageRender.ts의 shell()이 topbar 안에
     끼워 넣습니다(emailRender.ts의 page() 참고) — 로고 옆에 nav, 테마 토글 오른쪽에
     로그아웃이 오도록. .bs-nav-links 자체가 데스크톱에선 그냥 가로 나열, 모바일
     폭에서는(아래 미디어 쿼리) ☰로 여닫는 왼쪽 슬라이드 서랍(drawer)이 됩니다. */
  /* .topbar의 기본 gap은 이메일 페이지와 공유라 여기서 못 건드리고, 로고 쪽에만
     오른쪽 여백을 추가로 줘서 backstage에서만 로고-홈 간격을 늘립니다. */
  .topbar-logo { margin-right: 18px; }
  /* 메인 사이트의 MobileNav 버튼(테두리/배경 없이 아이콘만, 36px, hover는 opacity로만
     반응)과 통일한 스타일입니다 — src/components/layout/MobileNav.tsx 참고. */
  .bs-menu-toggle {
    display: none; align-items: center; justify-content: center;
    width: 36px; height: 36px; padding: 0; flex-shrink: 0;
    border: none; border-radius: 0; background: transparent; color: inherit;
    cursor: pointer; transition: opacity .15s;
  }
  .bs-menu-toggle:hover { opacity: 0.7; }
  .bs-menu-toggle svg { height: 16px; width: 16px; }
  .bs-nav-links { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.875rem; }
  .bs-nav-links a { opacity: 0.65; color: inherit; text-decoration: none; padding: 6px 14px; border-radius: 999px; transition: opacity .15s, background .15s, color .15s; }
  .bs-nav-links a:hover { opacity: 1; background: rgba(128,128,128,.1); }
  .bs-nav-links a.active { opacity: 1; font-weight: 700; background: var(--logo-primary); color: var(--bg); }
  /* 승인 대기 중일 때만 "회원 명단" 탭 글자 오른쪽 위에 지수(위첨자)처럼 붙는
     느낌표 뱃지 — PENDING_APPROVALS_BADGE_MARKER 참고. */
  .bs-nav-badge { display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; margin-left: 1px; border-radius: 999px; background: var(--logo-accent); color: #fff; font-size: 0.6rem; font-weight: 800; line-height: 1; vertical-align: super; }

  /* 공지사항/게시판/대회 아카이브처럼 성격이 비슷한 항목들을 <details>로 묶은
     드롭다운입니다 — JS 없이 네이티브 disclosure로 동작합니다. */
  .bs-nav-group { position: relative; }
  .bs-nav-group summary {
    list-style: none; cursor: pointer; opacity: 0.65; padding: 6px 14px; border-radius: 999px;
    transition: opacity .15s, background .15s, color .15s; display: flex; align-items: center; gap: 4px;
  }
  .bs-nav-group summary::-webkit-details-marker { display: none; }
  .bs-nav-group summary::after { content: "▾"; font-size: 1.6em; line-height: 1; opacity: 0.7; transition: transform .2s ease; }
  .bs-nav-group[open] summary::after { transform: rotate(-180deg); }
  .bs-nav-group summary:hover { opacity: 1; background: rgba(128,128,128,.1); }
  .bs-nav-group summary.active { opacity: 1; font-weight: 700; background: var(--logo-primary); color: var(--bg); }
  .bs-nav-group-menu {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 60; min-width: 168px;
    display: flex; flex-direction: column; gap: 2px; background: var(--bg);
    border: 1px solid rgba(128,128,128,.25); border-radius: 10px; padding: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,.18);
  }
  .bs-nav-group-menu a { padding: 8px 12px; border-radius: 8px; white-space: nowrap; }
  @media (prefers-reduced-motion: no-preference) {
    @keyframes bs-nav-menu-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .bs-nav-group[open] .bs-nav-group-menu { animation: bs-nav-menu-in .18s ease both; }
  }
  .bs-nav-logout-form { flex-shrink: 0; }
  .bs-nav-logout { -webkit-appearance: none; appearance: none; color: var(--bg); background: var(--logo-primary); border: none; white-space: nowrap; transition: opacity .15s; }
  .bs-nav-logout:hover { opacity: 0.85; }
  .bs-backdrop { display: none; }
  /* 모바일 서랍 안에서만 보이는 로그아웃 — 데스크톱에서는 topbar 오른쪽의
     .bs-nav-logout-form이 대신 보입니다(아래 미디어 쿼리에서 서로 뒤바뀜). */
  .bs-drawer-logout-form { display: none; }

  /* 페이지 곳곳의 알약(pill) 버튼(로그아웃, 새 글 작성, 저장, 삭제, 파일 선택,
     검색, + 추가)이 전부 같은 크기를 쓰도록 여기 한 곳에 모아둡니다. 색/테두리
     같은 개별 스타일은 각자의 규칙에 그대로 남아있습니다. */
  .bs-nav-logout, .bs-new, .bs-submit, .bs-danger,
  .bs-upload input[type="file"]::file-selector-button,
  .bs-cancel-btn, .bs-add-row {
    font: inherit; font-weight: 700; font-size: 0.8125rem; padding: 8px 18px; border-radius: 999px; cursor: pointer;
    transition: opacity .15s, background .15s, border-color .15s, color .15s, transform .12s;
    /* 전부 <a>였을 때는 필요 없었지만, CSV 내보내기 팝업 트리거처럼 <button>으로
       쓰는 곳이 생기면서 Safari/Chrome 기본 버튼 크롬(흰 배경 그라데이션/테두리)이
       background/border 지정과 별개로 비쳐 보이는 문제가 생겨 껐습니다. 테두리가
       필요한 쪽(.bs-new-outline 등)은 각자 규칙에서 다시 지정합니다. */
    -webkit-appearance: none; appearance: none; border: none;
  }

  /* 모바일 폭에서는 nav 링크들을 ☰ 버튼으로 여닫는 왼쪽 슬라이드 서랍(drawer)으로
     바꿉니다. 위의 통일된 버튼 크기 규칙보다 뒤에 와야 로그아웃 버튼의 규칙이
     실제로 이깁니다(같은 특정도라 소스 순서가 늦은 쪽이 이김). */
  @media (max-width: 720px) {
    /* topbar는 flex라 order로 시각적 순서만 바꿉니다 — 로고보다 먼저(왼쪽에)
       오도록. 데스크톱에서는 이 버튼 자체가 display:none이라 영향 없습니다. */
    .bs-menu-toggle { display: inline-flex; order: -1; }
    .bs-nav-links {
      position: fixed; top: 0; left: 0; bottom: 0; width: 240px; max-width: 80vw;
      display: flex; flex-direction: column; flex-wrap: nowrap; align-items: stretch; justify-content: flex-start; gap: 4px;
      margin: 0; padding: 64px 16px 20px; box-sizing: border-box; overflow-y: auto;
      border-right: 1px solid rgba(128,128,128,.18);
      background: var(--bg); z-index: 50;
      transform: translateX(-100%); transition: transform .25s ease;
    }
    .bs-nav-links.bs-nav-open { transform: translateX(0); }
    .bs-nav-links a { text-align: left; padding: 10px 12px; font-size: 0.9rem; }
    /* 좁은 화면(서랍)에서는 팝업 대신 그냥 그 자리에서 펼쳐지는 아코디언으로 */
    .bs-nav-group-menu { position: static; box-shadow: none; border: none; padding: 0 0 0 14px; margin-top: 2px; }
    .bs-nav-group-menu a { padding: 8px 12px; font-size: 0.9rem; }
    .bs-backdrop.bs-backdrop-open {
      display: block; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 40;
    }
    /* 로그아웃은 모바일에서 topbar가 아니라 서랍 맨 아래로 옮깁니다. */
    .bs-nav-logout-form { display: none; }
    .bs-drawer-logout-form {
      display: block; margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(128,128,128,.18);
    }
    .bs-drawer-logout-form .bs-nav-logout { display: block; width: 100%; text-align: center; }

    /* 공지/아카이브 목록 행에서 제목과 날짜·슬러그가 좁은 화면에서 어중간하게
       한 줄에 붙어버리지 않도록, 항상 개행해서 보여줍니다. */
    .bs-list li { flex-direction: column; align-items: flex-start; gap: 4px; }

    /* 검색창은 모바일에서 데스크톱용 상한(420px)을 풀어서 버튼과 함께 양옆
       끝까지 채웁니다. */
    .bs-search input[type="text"] { max-width: none; }

    /* 회원 명단 툴바는 좁은 화면에서 PC용 한 줄 배치(버튼 왼쪽 + 검색 오른쪽 정렬)를
       풀고 다시 세로로 쌓습니다 — 한 줄에 다 넣기엔 버튼이 너무 많습니다. */
    .bs-list-toolbar { flex-direction: column; align-items: stretch; }
    .bs-list-toolbar .bs-search { margin-left: 0; padding-top: 16px; border-top: 1px solid rgba(128,128,128,.16); }
  }

  /* 모션을 끄고 쓰는 사용자를 위해 이동/확대 같은 transform 애니메이션은
     prefers-reduced-motion에서 전부 뺍니다 (색/배경 전환은 자극이 적어 유지). */
  @media (prefers-reduced-motion: no-preference) {
    /* body에는 opacity만 있는 애니메이션을 씁니다 — transform(translateY)이 있으면
       애니메이션이 끝난 뒤에도 그 값(translateY(0))이 계속 적용된 채로 남는데,
       그러면 body가 position:fixed 자손(모바일 서랍/backdrop)의 containing block이
       되어버려서, 페이지 내용이 화면 끝까지 안 내려오는 짧은 페이지에서는 서랍이
       뷰포트 전체가 아니라 body 높이에 맞춰 잘립니다. */
    @keyframes bs-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes bs-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes bs-row-enter { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    body { animation: bs-fade-in .4s ease both; }
    .bs-card { animation: bs-fade-up .35s cubic-bezier(0.16,1,0.3,1) both; }
    .bs-row-enter { animation: bs-row-enter .25s ease both; }

    .bs-nav-logout:hover, .bs-new:hover, .bs-submit:hover, .bs-danger:hover,
    .bs-upload input[type="file"]::file-selector-button:hover,
    .bs-cancel-btn:hover, .bs-add-row:hover, .bs-row-remove:hover {
      transform: translateY(-1px);
    }
    .bs-nav-logout:active, .bs-new:active, .bs-submit:active, .bs-danger:active,
    .bs-upload input[type="file"]::file-selector-button:active,
    .bs-cancel-btn:active, .bs-add-row:active, .bs-row-remove:active {
      transform: scale(0.96);
    }
  }

  .bs-subnav { display: flex; gap: 8px; margin: -8px 0 20px; font-size: 0.8125rem; }
  .bs-subnav a { opacity: 0.6; text-decoration: none; padding: 4px 12px; border-radius: 999px; border: 1px solid rgba(128,128,128,.25); }
  .bs-subnav a.active { opacity: 1; font-weight: 700; border-color: var(--logo-primary); color: var(--logo-primary); }

  .bs-eyebrow { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.45; margin: 0 0 4px; }
  .bs-lead { opacity: 0.65; font-size: 0.9375rem; margin: 6px 0 0; }

  .bs-card { background: rgba(128,128,128,.05); border: 1px solid rgba(128,128,128,.16); border-radius: 16px; padding: 20px 22px; margin-bottom: 18px; }
  .bs-card + .bs-card { margin-top: 0; }
  .bs-card-title { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.5; margin: 0 0 16px; }

  .bs-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(128,128,128,.18); }
  .bs-list li { border-bottom: 1px solid rgba(128,128,128,.18); display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 6px; flex-wrap: wrap; border-radius: 8px; transition: background .15s; }
  .bs-list li:hover { background: rgba(128,128,128,.06); }
  .bs-list .title { font-weight: 600; text-decoration: none; color: inherit; }
  .bs-list .title:hover { color: var(--logo-primary); }
  .bs-list .meta { font-size: 0.8rem; opacity: 0.55; white-space: nowrap; }
  .bs-list .pin { color: var(--logo-accent); font-weight: 700; margin-right: 6px; }
  .empty { opacity: 0.5; padding: 20px 6px; font-size: 0.9rem; }

  .bs-new { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 20px; text-decoration: none; color: var(--bg); background: var(--logo-primary); transition: opacity .15s; }
  .bs-new:hover { opacity: 0.85; }
  /* 페이지에 주된 액션(+새 글 등)과 보조 액션(CSV 다운로드 등)이 같이 있을 때, 둘 다
     초록 알약이면 뭐가 우선인지 헷갈려서 보조 쪽만 테두리만 있는 버전으로 뺍니다. */
  .bs-new-outline { background: transparent; color: inherit; border: 1px solid rgba(128,128,128,.3); }
  .bs-new-outline:hover { background: rgba(128,128,128,.08); opacity: 1; }

  /* CSV 내보내기 열 선택 팝업 — 네이티브 <dialog>. showModal()로 열리므로 위치
     지정 없이 브라우저 기본 중앙 정렬을 그대로 씁니다. 닫혀있을 땐 반드시 레이아웃에서
     완전히 빠지도록 못박아둡니다 — 트리거 버튼과 나란히 flex 행(.bs-list-toolbar-actions
     등)에 형제로 들어가는데, 혹시라도 안 닫힌 것처럼 치이면 그 행 전체가 다이얼로그
     높이만큼 늘어나 버튼들이 세로로 비대해 보이는 원인이 됩니다. */
  dialog:not([open]) { display: none !important; }
  .bs-csv-dialog {
    border: 1px solid rgba(128,128,128,.2); border-radius: 16px; padding: 22px 24px;
    background: var(--bg); color: inherit; max-width: 360px; width: calc(100vw - 48px);
  }
  .bs-csv-dialog::backdrop { background: rgba(0,0,0,.4); }
  .bs-csv-cols { display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; }
  .bs-csv-col { display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer; user-select: none; }
  .bs-csv-col input { width: auto; accent-color: var(--logo-primary); }
  .bs-csv-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

  form.bs-form { display: flex; flex-direction: column; gap: 18px; }
  .bs-field { display: flex; flex-direction: column; gap: 6px; }
  .bs-field label { font-size: 0.8125rem; font-weight: 600; opacity: 0.75; }
  .bs-field input[type="text"], .bs-field input[type="date"], .bs-field input[type="number"], .bs-field select, .bs-field textarea {
    font: inherit; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(128,128,128,.3);
    background: rgba(128,128,128,.04); color: inherit; width: 100%; box-sizing: border-box;
    transition: border-color .15s, background .15s;
  }
  .bs-field input:focus, .bs-field select:focus, .bs-field textarea:focus {
    outline: none; border-color: var(--logo-primary); background: rgba(128,128,128,.02);
  }
  /* select 태그 자체는 color-scheme로 다크 대응이 되지만, 펼쳤을 때 나오는
     옵션 목록은 브라우저 네이티브 팝업이라 일부 브라우저에서 이게 안 먹혀서
     밝은 배경에 글자가 거의 안 보이는 상태로 나왔습니다. option에 직접
     배경/글자색을 지정해서 팝업도 테마를 따라가게 합니다.
     예전엔 .bs-field 안쪽 select만 대상이었는데, .bs-field 밖에서 인라인 스타일로
     만든 select(RUNFORCE 대회 수동 추가의 플랫폼 선택)가 이 규칙에서 빠지는 바람에
     일부 환경에서 배경/글자가 모두 흰색으로 겹쳐 안 보였습니다 — backstage의 모든
     select에 적용되도록 범위를 넓혔습니다. */
  select option { background-color: var(--bg); color: var(--fg); }
  .bs-field input[readonly] { opacity: 0.6; }
  .bs-field textarea { resize: vertical; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.8125rem; line-height: 1.6; }
  .bs-field textarea.bs-autosize { resize: none; overflow: hidden; }
  .bs-field .hint { font-size: 0.75rem; opacity: 0.5; }
  .bs-rows { display: flex; flex-direction: column; gap: 8px; }
  .bs-row-item { display: flex; gap: 8px; align-items: center; }
  /* box-sizing이 border-box가 아니면 padding+border만큼 실제 렌더 너비가
     flex-basis보다 커져서, 위 헤더 라벨(지원 폼 선택지 표의 <span>들)과 폭이
     안 맞아 보였습니다 — 열을 맞추려면 이게 꼭 있어야 합니다. */
  .bs-row-item input {
    flex: 1; min-width: 0; box-sizing: border-box; font: inherit;
    padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(128,128,128,.3);
    background: rgba(128,128,128,.04); color: inherit;
  }
  .bs-row-item input[readonly] { opacity: 0.6; }
  /* 회칙 개정이력 행 전용 — 라벨을 직접 입력받지 않고, 몇 번째 행인지로 자동
     계산합니다(첫 행 = 제정, 그 다음부터는 전부 일부개정). */
  .bs-rev-badge { flex: 0 0 auto; font-size: .75rem; font-weight: 600; opacity: .5; padding: 0 2px; white-space: nowrap; }
  .bs-rev-badge::before { content: "일부개정"; }
  .bs-row-item:first-child .bs-rev-badge::before { content: "제정"; }
  .bs-row-remove { flex-shrink: 0; width: 34px; height: 34px; border-radius: 8px; border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; font-size: 1rem; line-height: 1; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
  .bs-row-remove:hover { background: rgba(220,38,38,.12); border-color: rgba(220,38,38,.4); color: #f87171; }
  .bs-add-row { align-self: flex-start; margin-top: 6px; border: 1px dashed rgba(128,128,128,.4); background: transparent; color: inherit; transition: background .15s, border-color .15s, color .15s; }
  .bs-add-row:hover { background: rgba(128,128,128,.08); border-color: var(--logo-primary); color: var(--logo-primary); }
  @media (max-width: 560px) { .bs-row-item { flex-wrap: wrap; } .bs-row-item input { min-width: 100%; } }

  /* 회칙 트리 에디터 — 장/조/항/호/목을 중첩 카드로 표현합니다. 타입을 고르고
     순서를 옮기는 flat 목록 대신, "+"로 어디에 추가하는지가 곧 위계입니다.
     저장 시엔 문서 순서대로 평평하게 펼쳐서(flatten) blocksJson 하나로 제출합니다
     (BYLAWS_TREE_SCRIPT 참고). */
  .bylaws-node-children { display: flex; flex-direction: column; gap: 6px; margin-left: 18px; padding-left: 14px; border-left: 2px solid rgba(128,128,128,.18); }
  .bylaws-node-children.root { margin-left: 0; padding-left: 0; border-left: none; gap: 8px; }
  /* 접기 애니메이션: grid-template-rows 1fr↔0fr 트릭 — JS가 높이를 안 재도 항상 맞습니다. */
  .bylaws-children-wrap { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .2s ease; }
  .bylaws-children-wrap.collapsed { grid-template-rows: 0fr; }
  .bylaws-children-wrap > .bylaws-node-children { overflow: hidden; min-height: 0; }

  @keyframes bylaws-node-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

  .bylaws-node-card { border-radius: 8px; background: rgba(128,128,128,.05); border: 1px solid rgba(128,128,128,.14); animation: bylaws-node-in .18s ease; }
  .bylaws-node-card:focus-within { border-color: var(--logo-primary); }
  .bylaws-node-row { display: flex; align-items: flex-start; gap: 7px; padding: 7px 8px; border-radius: 8px; transition: box-shadow .1s ease; }
  .bylaws-node-row.drop-before { box-shadow: inset 0 2px 0 var(--logo-primary); }
  .bylaws-node-row.drop-after { box-shadow: inset 0 -2px 0 var(--logo-primary); }
  .bylaws-node.dragging { opacity: .4; }

  /* 태그/본문 줄 맨 앞의 "안 보이는" 접기버튼+드래그손잡이+뱃지+번호 묶음 — 위
     텍스트 칸과 같은 내용을 그대로 한 번 더 찍어서, 라벨 길이가 뭐든 그 칸의
     실제 시작 위치에 항상 정확히 맞춰줍니다. */
  .bylaws-row-gutter { flex: 0 0 auto; display: flex; align-items: flex-start; gap: 7px; visibility: hidden; pointer-events: none; }

  .bylaws-drag-handle { flex: 0 0 auto; width: 18px; padding-top: 6px; text-align: center; letter-spacing: -1px; font-size: .8125rem; color: rgba(128,128,128,.8); cursor: grab; user-select: none; }
  .bylaws-drag-handle:active { cursor: grabbing; }

  .bylaws-fold-btn, .bylaws-fold-spacer { flex: 0 0 auto; width: 26px; height: 26px; }
  .bylaws-fold-btn {
    display: flex; align-items: center; justify-content: center; padding: 0;
    border-radius: 7px; border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit;
    cursor: pointer; font-size: .8125rem; transition: background .15s, border-color .15s, color .15s, transform .1s ease;
  }
  .bylaws-fold-btn:hover { background: rgba(128,128,128,.1); border-color: var(--logo-primary); color: var(--logo-primary); }
  .bylaws-fold-btn:active { transform: scale(.9); }

  .bylaws-badge { flex: 0 0 auto; font-size: .6875rem; font-weight: 700; letter-spacing: .02em; background: rgba(128,128,128,.14); padding: 4px 8px; border-radius: 999px; margin-top: 2px; white-space: nowrap; }
  .bylaws-num { flex: 0 0 auto; font-size: .8125rem; font-weight: 700; opacity: .65; padding: 6px 2px; white-space: nowrap; min-width: 2.4em; }

  .bylaws-node-row textarea {
    flex: 1 1 auto; min-width: 0; font: inherit; font-size: .875rem; line-height: 1.5; padding: 7px 9px;
    border-radius: 6px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04);
    color: inherit; resize: none; overflow: hidden; box-sizing: border-box;
  }

  .bylaws-node-actions { flex: 0 0 auto; display: flex; gap: 3px; padding-top: 1px; }
  .bylaws-node-actions button {
    width: 24px; height: 28px; border-radius: 6px; border: 1px solid rgba(128,128,128,.3);
    background: transparent; color: inherit; cursor: pointer; font-size: .75rem; line-height: 1;
    transition: background .15s, border-color .15s, color .15s, transform .1s ease;
  }
  .bylaws-node-actions button:hover { background: rgba(220,38,38,.12); border-color: rgba(220,38,38,.4); color: #f87171; }
  .bylaws-node-actions button:active { transform: scale(.9); }

  .bylaws-add-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0; }
  /* 노드 행의 × 삭제 버튼(28px 높이)과 항상 맞춰서, 칩/태그버튼이 행마다 들쭉날쭉해
     보이지 않게 합니다. */
  .bylaws-chip {
    flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; height: 28px; box-sizing: border-box;
    font: inherit; font-size: .75rem; font-weight: 600; color: var(--logo-primary); white-space: nowrap;
    background: transparent; border: 1px dashed var(--logo-primary); border-radius: 999px; padding: 0 12px;
    cursor: pointer; transition: background .15s, border-style .15s, transform .1s ease;
  }
  .bylaws-chip:hover { background: rgba(128,128,128,.08); border-style: solid; }
  .bylaws-chip:active { transform: scale(.94); }
  .bylaws-chip-ghost { color: inherit; opacity: .65; border-color: rgba(128,128,128,.35); }
  .bylaws-chip-ghost:hover { opacity: 1; color: var(--logo-primary); border-color: var(--logo-primary); }

  /* 개정/신설 태그 삽입 — 네이티브 <select>는 브라우저마다 못생기게 나와서 대신
     버튼 + 직접 그리는 드롭다운 메뉴로 만듭니다. */
  /* 본문(body)처럼 카드 행 아래 별도 줄 — 텍스트 입력칸과 한 줄에 같이 두면
     칩/뱃지가 늘어날 때마다 줄바꿈이 지저분해져서 뺐습니다. 왼쪽은 .bylaws-row-gutter가
     맞춰주므로 여기 자체엔 왼쪽 들여쓰기를 따로 안 둡니다. */
  .bylaws-tag-row { display: flex; align-items: flex-start; gap: 7px; padding: 0 8px 8px; }
  .bylaws-tag-row-content { flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .bylaws-tag-menu { position: relative; flex: 0 0 auto; }
  .bylaws-tag-dropdown {
    display: none; flex-direction: column; gap: 1px; position: absolute; top: calc(100% + 6px); left: 0; z-index: 5;
    min-width: 176px; background: var(--bg); border: 1px solid rgba(128,128,128,.25); border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0,0,0,.18); padding: 4px;
  }
  .bylaws-tag-menu.open .bylaws-tag-dropdown { display: flex; }
  .bylaws-tag-option {
    font: inherit; font-size: .8125rem; font-weight: 600; text-align: left; padding: 6px 10px; white-space: nowrap;
    border: none; border-radius: 6px; background: transparent; color: inherit; cursor: pointer;
    transition: background .15s, color .15s;
  }
  .bylaws-tag-option:hover { background: rgba(128,128,128,.1); color: var(--logo-primary); }
  .bylaws-tag-empty { margin: 0; padding: 8px 10px; font-size: .75rem; opacity: .6; white-space: nowrap; }

  /* 이미 붙어있는 태그 — 실제 공개 페이지의 .bylaws-tag와 같은 색(teal)을 씁니다. */
  .bylaws-tag-badge {
    flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px; height: 28px; box-sizing: border-box;
    font-size: .75rem; font-weight: 700; white-space: nowrap; border-radius: 999px; padding: 0 4px 0 10px;
    color: #0e7490; background: rgba(14,116,144,.1);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .bylaws-tag-badge { color: #67e8f9; background: rgba(103,230,249,.12); }
  }
  :root[data-theme="dark"] .bylaws-tag-badge { color: #67e8f9; background: rgba(103,230,249,.12); }
  .bylaws-tag-badge button {
    all: unset; box-sizing: border-box; width: 18px; height: 18px; display: inline-flex; align-items: center;
    justify-content: center; border-radius: 999px; cursor: pointer; font-size: .7rem; line-height: 1; opacity: .75;
    transition: background .15s, color .15s, opacity .15s;
  }
  .bylaws-tag-badge button:hover { opacity: 1; background: rgba(220,38,38,.18); color: #f87171; }

  .bylaws-body-row { display: flex; align-items: flex-start; gap: 7px; padding: 0 8px 8px; animation: bylaws-node-in .16s ease; }
  .bylaws-body-row textarea {
    flex: 1 1 auto; min-width: 0; font: inherit; font-size: .875rem; line-height: 1.5; padding: 7px 9px;
    border-radius: 6px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.02);
    color: inherit; resize: none; overflow: hidden; box-sizing: border-box;
  }
  .bylaws-body-row textarea::placeholder { font-style: italic; }
  .bylaws-body-remove {
    flex: 0 0 auto; width: 22px; height: 26px; border: none; border-radius: 6px; background: transparent;
    color: rgba(128,128,128,.8); cursor: pointer; font-size: .75rem; transition: background .15s, color .15s, transform .1s ease;
  }
  .bylaws-body-remove:hover { background: rgba(220,38,38,.12); color: #f87171; }
  .bylaws-body-remove:active { transform: scale(.9); }

  /* 미리보기 — 본문 편집 카드 옆에 나란히 붙는 비모달 사이드 패널입니다. 닫혀있을
     땐 폭 0으로 접혀서 안 보이고, 열면 본문 편집 칸과 정확히 반반(같은 너비)으로
     나뉩니다. 카드 컨테이너 자체(body max-width)도 이때만 넓혀서(.bylaws-wide)
     둘 다 너무 좁아지지 않게 합니다. */
  body.bylaws-wide { max-width: 1680px; }
  .bylaws-card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .bylaws-card-header .bs-card-title { margin: 0; }
  .bylaws-card-header-actions { display: flex; align-items: center; gap: 10px; }
  .bylaws-card-header-actions .bs-submit { padding: 6px 16px; font-size: .8125rem; }
  .bylaws-preview-toggle {
    flex-shrink: 0; font: inherit; font-size: .8125rem; font-weight: 700; color: var(--logo-primary);
    background: transparent; border: 1px solid var(--logo-primary); border-radius: 999px; padding: 6px 14px;
    cursor: pointer; transition: background .15s, color .15s;
  }
  .bylaws-preview-toggle:hover { background: var(--logo-primary); color: var(--bg); }

  .bylaws-editor-row { display: flex; align-items: flex-start; }
  .bylaws-editor-col { width: 100%; min-width: 0; transition: width .25s ease; }
  .bylaws-editor-row.preview-open .bylaws-editor-col { width: calc(50% - 12px); }

  /* position: sticky + 자체 overflow-y로 뷰포트 높이만큼만 차지하고 그 안에서
     스크롤되게 합니다 — 안 그러면 미리보기가 본문 트리보다 훨씬 길 때 행(row)
     전체가 그 길이에 맞춰 늘어나서 "저장" 버튼이 한참 아래로 밀려버립니다. */
  .bylaws-preview-col {
    width: 0; flex-shrink: 0; overflow: hidden; opacity: 0; margin-left: 0;
    position: sticky; top: 20px; max-height: calc(100vh - 40px);
    transition: width .25s ease, opacity .2s ease, margin-left .25s ease;
  }
  .bylaws-editor-row.preview-open .bylaws-preview-col { width: calc(50% - 12px); opacity: 1; margin-left: 24px; overflow-y: auto; }
  .bylaws-preview-card { box-sizing: border-box; }
  .bylaws-preview-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; position: sticky; top: 0; background: var(--bg); padding-bottom: 8px; }
  .bylaws-preview-close {
    flex-shrink: 0; font: inherit; font-size: .8125rem; font-weight: 600; border-radius: 999px; padding: 6px 14px;
    border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; cursor: pointer;
    transition: background .15s, border-color .15s, color .15s; white-space: nowrap;
  }
  .bylaws-preview-close:hover { background: rgba(220,38,38,.12); border-color: rgba(220,38,38,.4); color: #f87171; }

  .bylaws-preview-wrap { background: #faf8f3; border-radius: 10px; padding: 26px 24px; border: 1px solid rgba(128,128,128,.16); }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .bylaws-preview-wrap { background: #201e1a; }
    :root:not([data-theme="light"]) .bylaws-preview .bylaws-tag { color: #67e8f9; }
  }
  :root[data-theme="dark"] .bylaws-preview-wrap { background: #201e1a; }
  :root[data-theme="dark"] .bylaws-preview .bylaws-tag { color: #67e8f9; }
  .bylaws-preview .bylaws-title { text-align: center; font-weight: 800; font-size: 1.375rem; margin: 0 0 1.1rem; }
  .bylaws-preview .bylaws-chapter, .bylaws-preview .bylaws-buchik { text-align: center; font-weight: 800; font-size: 1.1rem; margin: 1.8rem 0 .8rem; }
  .bylaws-preview .bylaws-article { font-weight: 700; font-size: .9rem; margin: .95rem 0 .2rem; }
  .bylaws-preview .bylaws-clause, .bylaws-preview .bylaws-item, .bylaws-preview .bylaws-subitem, .bylaws-preview .bylaws-body {
    display: flex; align-items: baseline; text-align: justify; line-height: 1.7; font-size: .9rem; margin: .15rem 0;
  }
  .bylaws-preview .bylaws-clause { padding-left: 1.1em; }
  .bylaws-preview .bylaws-item { padding-left: 2.3em; }
  .bylaws-preview .bylaws-subitem { padding-left: 3.5em; }
  .bylaws-preview .bylaws-body { padding-left: 1.1em; }
  .bylaws-preview .bylaws-marker { flex: 0 0 auto; margin-right: .45em; }
  .bylaws-preview .bylaws-ptext { flex: 1 1 auto; text-align: justify; }
  .bylaws-preview .bylaws-ptext.placeholder, .bylaws-preview .bylaws-article.placeholder { opacity: .5; font-style: italic; }
  .bylaws-preview .bylaws-tag { color: #0e7490; font-weight: 600; }
  .bylaws-preview-empty { opacity: .5; font-size: .875rem; text-align: center; padding: 30px 0; }

  @media (max-width: 640px) {
    .bylaws-node-row { flex-wrap: wrap; }
    .bylaws-node-row textarea { flex: 1 1 100%; }
    /* 좁은 화면에서는 반반으로 나누면 둘 다 못 써서, PC와 달리 예전처럼 화면
       전체를 덮는 오버레이로 엽니다(옆에 나란히 X). */
    body.bylaws-wide { max-width: none; }
    .bylaws-editor-row.preview-open .bylaws-editor-col { width: 100%; }
    .bylaws-preview-col {
      position: fixed; inset: 0; z-index: 71; margin: 0; width: 0; height: 0;
      background: rgba(0,0,0,.4); padding: 16px; box-sizing: border-box;
    }
    .bylaws-editor-row.preview-open .bylaws-preview-col { width: 100vw; height: 100vh; opacity: 1; }
    .bylaws-preview-card { max-height: 100%; overflow-y: auto; }
  }

  .bs-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .bs-check { flex-direction: row; align-items: center; gap: 8px; }
  .bs-check input { width: auto; accent-color: var(--logo-primary); }
  .bs-actions { display: flex; gap: 16px; align-items: center; margin-top: 4px; }
  /* 공지사항/게시판/대회 아카이브(콘텐츠) 편집 폼은 저장 버튼을 오른쪽 끝에 두고
     "취소 | 저장" 순서로 놓습니다 — 다른 폼(회원/연락처/회칙/지원 폼)은 기존 그대로. */
  .bs-actions-end { justify-content: flex-end; }
  .bs-submit { border: none; background: var(--logo-primary); color: var(--bg); }
  .bs-submit:hover { opacity: 0.88; }
  .bs-cancel { font-size: 0.875rem; opacity: 0.6; color: var(--fg); text-decoration: underline; transition: opacity .15s; }
  .bs-cancel:hover { opacity: 1; }
  .bs-danger-zone { margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(220,38,38,.2); }
  .bs-danger { border: 1px solid rgba(220,38,38,.4); color: #f87171; background: rgba(220,38,38,.06); transition: background .15s; }
  .bs-danger:hover { background: rgba(220,38,38,.14); }
  /* 검색/업로드/연결처럼 텍스트 입력 바로 옆에 붙는 버튼은 텍스트 대신 아이콘만
     넣어서 좁은 화면에서도 줄바꿈 없이 한 줄에 붙어있게 합니다. */
  .bs-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; flex-shrink: 0; }
  .bs-icon-btn svg { height: 16px; width: 16px; }
  .bs-note { font-size: 0.8125rem; opacity: 0.55; }
  .bs-error { color: #f87171; background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.25); border-radius: 10px; padding: 10px 14px; font-size: 0.875rem; margin: 0 0 18px; }
  @media (prefers-reduced-motion: no-preference) { .bs-error { animation: bs-fade-up .3s ease both; } }
  @media (max-width: 640px) { .bs-row2 { grid-template-columns: 1fr; } }

  /* 파일 선택 버튼은 항상 자기 줄을 혼자 쓰고, 파일 이름 입력+업로드 버튼이 그
     다음 줄에서 양 끝까지 채웁니다 — 화면 폭과 무관하게 항상 이 2줄 구성입니다. */
  .bs-upload { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
  .bs-upload input[type="file"] { font-size: 0.8125rem; color: inherit; flex: 1 1 100%; }
  .bs-upload input[type="file"]::file-selector-button { border: none; margin-right: 12px; background: var(--logo-primary); color: var(--bg); }
  .bs-upload input[type="file"]::file-selector-button:hover { opacity: 0.88; }
  .bs-upload input[type="text"] { font: inherit; font-size: 0.8125rem; padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04); color: inherit; min-width: 0; flex: 1 1 auto; }
  .bs-upload input[type="text"]:focus { outline: none; border-color: var(--logo-primary); }
  /* 검색창도 항상 버튼과 한 줄에서 양 끝까지 채웁니다(모바일/PC 공통) — PC에서는
     max-width로 너무 안 넓어지게만 막아둡니다. */
  .bs-search { display: flex; gap: 10px; align-items: center; flex-wrap: nowrap; margin-bottom: 20px; padding-top: 16px; border-top: 1px solid rgba(128,128,128,.16); }
  .bs-search input[type="text"] { font: inherit; padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04); color: inherit; flex: 1 1 auto; min-width: 0; max-width: 560px; }
  .bs-search input[type="text"]:focus { outline: none; border-color: var(--logo-primary); }

  /* 회원 명단 상단 툴바 — PC에서는 + 새 유저/CSV/사진 갱신 버튼을 왼쪽에 두고
     검색창을 같은 줄 오른쪽 끝에 붙입니다(margin-left:auto). 좁은 화면에서는
     아래 미디어 쿼리로 다시 세로로 쌓습니다. */
  .bs-list-toolbar { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; margin-bottom: 16px; }
  .bs-list-toolbar .bs-search { margin: 0 0 0 auto; padding-top: 0; border-top: none; flex: 1 1 auto; }
  .bs-list-toolbar-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .bs-cancel-btn { border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; }
  .bs-cancel-btn:hover { background: rgba(128,128,128,.08); }
  .bs-upload-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(128,128,128,.18); }
  /* 한 행 안 공간 우선순위: 파일명(.bs-upload-open) > URL 스니펫(.snippet, 안
     보여도 그만) > 삭제 버튼(항상 고정폭, 절대 안 줄어듦). 화면 폭과 무관하게
     항상 한 줄로 유지하고, 좁아지면 snippet부터 줄어들게 합니다. */
  .bs-upload-list li { border-bottom: 1px solid rgba(128,128,128,.18); display: flex; align-items: center; gap: 10px; padding: 12px 6px; transition: background .15s; }
  .bs-upload-list li:hover { background: rgba(128,128,128,.05); }
  .bs-upload-open { display: flex; align-items: center; gap: 14px; flex: 3 1 auto; min-width: 0; color: inherit; text-decoration: none; }
  .bs-upload-open:hover .name { text-decoration: underline; }
  .bs-upload-list .thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: rgba(128,128,128,.08); flex-shrink: 0; }
  .bs-upload-list .file-icon { width: 44px; height: 44px; border-radius: 8px; background: rgba(128,128,128,.08); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
  .bs-upload-list .info { flex: 1; min-width: 0; }
  .bs-upload-list .name { font-weight: 600; font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bs-upload-list .meta { font-size: 0.75rem; opacity: 0.55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bs-upload-list .snippet { font: inherit; font-family: ui-monospace, monospace; font-size: 0.75rem; box-sizing: border-box; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04); color: inherit; flex: 0 1 160px; min-width: 36px; }
  .bs-upload-list li form { flex-shrink: 0; }
  .bs-upload-list .bs-danger { flex-shrink: 0; }

  /* RUNFORCE에서 Div1/Div2로 짝지어진 대회 한 쌍 — 평소엔 한 줄 요약만 보이고, 화살표
     버튼을 누르면 각자 삭제 버튼 달린 두 줄로 펼쳐집니다. 제목 자체는 진짜 링크라 눌러도
     펼쳐지는 대신 그 대회(Div1+Div2 합쳐 보여주는) 상세 페이지로 이동합니다 — 그래서
     <details>의 "summary 전체가 토글" 기본 동작 대신 화살표 버튼만 JS로 토글합니다
     (RUNFORCE_PAIR_TOGGLE_SCRIPT). li 자체는 display:block으로 바꿔서 .bs-upload-list
     li의 가로 flex 규칙(그리고 그로 인한 정렬 꼬임)을 아예 안 타게 합니다 —
     .bs-upload-list li보다 특정도가 높아야 실제로 이기므로 li를 같이 붙여 씁니다. */
  .bs-upload-list li.bs-runforce-pair { display: block; padding: 0; }
  /* RUNFORCE 목록의 모든 행(일반 대회 + 짝지어진 대회 요약)에 원래 있던 왼쪽 회색 줄을
     똑같이 씁니다 — 이 목록 전용 클래스라 업로드 목록 등 .bs-upload-list를 같이 쓰는
     다른 화면에는 전혀 영향 없습니다. .bs-runforce-pair보다 뒤에 와야 그 padding:0을
     덮어씁니다(특정도가 같아서 소스 순서로 이깁니다). */
  /* border-left는 항상 요소의 위아래 전체를 채우는 게 CSS 기본 동작이라(padding까지
     포함한 박스 전체), 짧은 막대를 만들려면 border가 아니라 고정 높이(20px) ::before를
     가운데 정렬로 겹쳐야 합니다. 짝지어진 li는 펼치면(body 표시) li 전체 높이가
     늘어나므로, li 기준으로 세로 중앙 정렬하면 펼칠 때마다 막대가 아래로 밀립니다 —
     그래서 짝 쪽은 li가 아니라 높이가 절대 안 바뀌는 .bs-runforce-pair-summary 자신을
     기준으로 따로 그립니다(바로 아래 규칙). */
  .bs-upload-list li.bs-runforce-list-item { padding-left: 14px; }
  .bs-upload-list li.bs-runforce-list-item:not(.bs-runforce-pair) { position: relative; }
  .bs-upload-list li.bs-runforce-list-item:not(.bs-runforce-pair)::before {
    content: ""; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
    width: 2px; height: 20px; background: rgba(128,128,128,.3);
  }
  /* 왼쪽 인덴트는 li(.bs-runforce-list-item)의 padding-left가 이미 주므로, 여기서
     또 왼쪽 패딩을 주면 이중으로 밀려서(li 14px + 여기 6px) 일반 행보다 더 들어가
     보입니다 — 왼쪽만 0으로 빼고, 막대는 이 요소(높이 고정) 기준으로 그립니다. */
  .bs-runforce-pair-summary {
    position: relative; display: flex; align-items: center; gap: 10px;
    padding: 12px 6px 12px 0; transition: background .15s;
  }
  .bs-runforce-pair-summary::before {
    content: ""; position: absolute; left: -14px; top: 50%; transform: translateY(-50%);
    width: 2px; height: 20px; background: rgba(128,128,128,.3);
  }
  .bs-runforce-pair-summary:hover { background: rgba(128,128,128,.05); }
  .bs-runforce-pair-toggle {
    border: none; background: transparent; color: inherit; cursor: pointer;
    opacity: 0.7; font-size: 1.6em; line-height: 1; transition: transform .2s ease;
  }
  .bs-runforce-pair-toggle[aria-expanded="true"] { transform: rotate(180deg); }
  .bs-runforce-pair-body { display: flex; flex-direction: column; gap: 6px; padding: 0 6px 12px 0; }
  .bs-runforce-pair-body[hidden] { display: none; }
  /* 서브 행(Div1/Div2) 전용 — 일반 행(.bs-upload-list li)이나 그 안의 어떤 클래스와도
     안 겹치게 이름을 분리했습니다(공유하다가 한쪽만 고치려던 CSS가 다른 쪽까지 새 나간
     적이 있어서). 회색 줄/들여쓰기 없이 일반 행과 똑같이 정렬 — "• Div. 1" 점 표기 자체가
     이미 하위 항목이라는 걸 보여주므로 따로 안 필요합니다. */
  .bs-runforce-pair-subrow { display: flex; align-items: center; gap: 10px; }
  .bs-runforce-pair-subrow .bs-runforce-dot { font-size: 1.4em; line-height: 0; vertical-align: -1px; margin-right: 8px; opacity: 0.8; }
  /* 링크(.bs-upload-open)가 아니라 그냥 정보만 보여주는 행 — 클릭 안 되고 hover 밑줄도 없음. */
  .bs-upload-open-static { display: flex; align-items: center; gap: 14px; flex: 3 1 auto; min-width: 0; }

  .bs-member-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(128,128,128,.18); }
  .bs-member-list li { border-bottom: 1px solid rgba(128,128,128,.18); display: flex; align-items: center; gap: 12px; padding: 10px 6px; transition: background .15s; }
  .bs-member-list li:hover { background: rgba(128,128,128,.05); }
  /* 전체 명단에서 행 전체가 그 유저의 수정 페이지로 가는 링크입니다(학기별
     명단/관리자 목록은 대신 승인·삭제 같은 액션 버튼이 오른쪽에 붙어서 링크로
     안 감쌉니다) — li 자체의 flex/padding은 그대로 두고, 안에서 이 앵커가
     아바타+본문만 남은 공간만큼 차지하게 합니다. */
  .bs-member-link { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; color: inherit; text-decoration: none; }
  .bs-member-avatar { width: 40px; height: 40px; border-radius: 999px; object-fit: cover; flex-shrink: 0; background: rgba(128,128,128,.12); }
  .bs-member-avatar-fallback { display: flex; align-items: center; justify-content: center; font-size: 0.875rem; font-weight: 700; opacity: 0.55; }
  .bs-member-body { flex: 1; min-width: 0; }
  .bs-member-main { display: flex; align-items: center; gap: 8px; }
  .bs-member-main .name { font-weight: 600; font-size: 0.9375rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bs-member-list .meta { font-size: 0.8rem; opacity: 0.55; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bs-badge { flex-shrink: 0; font-size: 0.7rem; font-weight: 700; padding: 2px 10px; border-radius: 999px; background: var(--logo-primary); color: var(--bg); }
  /* 명예회원/활동회원/휴회원처럼 "관리자" 배지만큼 강조할 필요는 없는 상태 표시용 — 테두리만. */
  .bs-badge-outline { flex-shrink: 0; font-size: 0.7rem; font-weight: 700; padding: 2px 10px; border-radius: 999px; border: 1px solid rgba(128,128,128,.3); opacity: .75; }
  /* 학기별 명단 목록에서 "현재 학기"를 글자 대신 체크 표시로. */
  .bs-current-check { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 22px; height: 22px; border-radius: 999px; background: var(--logo-primary); color: var(--bg); }
  .bs-current-check svg { width: 13px; height: 13px; }

  /* RUNFORCE 대회별 상세/리더보드 — backstage에서 처음 쓰는 진짜 <table>입니다.
     여기 전까지는 전부 <ul> 기반 행이었지만, 순위/이름/핸들/원본순위/점수처럼
     컬럼이 4~5개인 진짜 표 형태 데이터라 table이 더 적합합니다. */
  .bs-table-wrap { overflow-x: auto; } /* 좁은 화면에서 페이지 자체가 아니라 표 안에서만 가로 스크롤 */
  .bs-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-top: 12px; }
  .bs-table th, .bs-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid rgba(128,128,128,.18); white-space: nowrap; }
  .bs-table th { font-weight: 700; opacity: .6; font-size: 0.75rem; text-transform: uppercase; }
  .bs-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .bs-table th.center, .bs-table td.center { text-align: center; }
  .bs-table tr:hover td { background: rgba(128,128,128,.05); }
`;

function navLink(href: string, label: string, active: boolean): string {
  return `<a href="${href}"${active ? ' class="active"' : ""}>${label}</a>`;
}

// CSV 다운로드 버튼 — 클릭하면 내보낼 열을 고르는 <dialog> 팝업이 뜹니다(기본은
// 전부 체크). id는 한 페이지에 이 버튼이 여러 번 나올 수 있으면(RUNFORCE Div1+Div2
// 상세처럼) 호출부에서 겹치지 않게 넘겨야 합니다. 백스테이지는 서버 렌더 HTML +
// 인라인 onclick 컨벤션(FORM_STYLE 주변 다른 버튼들 참고)이라 <dialog>도 같은
// 방식(showModal/close)으로 여닫습니다.
function renderCsvExportButton(id: string, action: string, label: string, columns: { key: string; label: string }[]): string {
  const checkboxes = columns
    .map(
      (c) =>
        `<label class="bs-csv-col"><input type="checkbox" name="cols" value="${escapeHtml(c.key)}" checked /> ${escapeHtml(c.label)}</label>`,
    )
    .join("");
  return `<button type="button" class="bs-new bs-new-outline" style="margin-bottom:0" onclick="document.getElementById('${id}').showModal()">${label}</button>
    <dialog id="${id}" class="bs-csv-dialog">
      <form method="get" action="${action}">
        <p class="bs-card-title" style="margin-bottom:12px">내보낼 열 선택</p>
        <div class="bs-csv-cols">${checkboxes}</div>
        <div class="bs-csv-actions">
          <button type="button" class="bs-cancel-btn" onclick="document.getElementById('${id}').close()">취소</button>
          <button type="submit" class="bs-new" style="margin-bottom:0">다운로드</button>
        </div>
      </form>
    </dialog>`;
}

// ☰ 버튼 클릭 시 nav를 서랍처럼 여닫습니다. 데스크톱에선 버튼 자체가 숨겨져
// (FORM_STYLE) 아무 효과가 없습니다.
const BS_MENU_SCRIPT = `
  (function () {
    var toggle = document.getElementById("bs-menu-toggle");
    var nav = document.getElementById("bs-nav");
    var backdrop = document.getElementById("bs-backdrop");
    if (!toggle || !nav || !backdrop) return;

    function closeMenu() {
      nav.classList.remove("bs-nav-open");
      backdrop.classList.remove("bs-backdrop-open");
      toggle.setAttribute("aria-expanded", "false");
    }
    function openMenu() {
      nav.classList.add("bs-nav-open");
      backdrop.classList.add("bs-backdrop-open");
      toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", function () {
      if (nav.classList.contains("bs-nav-open")) closeMenu();
      else openMenu();
    });
    backdrop.addEventListener("click", closeMenu);
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
  })();
`;

// 메인 사이트 MobileNav(src/components/layout/MobileNav.tsx)와 같은 아이콘입니다.
const MENU_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 5.5h15M2.5 10h15M2.5 14.5h15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>`;

// 텍스트 입력 옆 아이콘 전용 버튼(.bs-icon-btn)에 쓰는 아이콘들. 전부 currentColor를
// 써서 버튼 색을 그대로 물려받습니다.
const SEARCH_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5" /><path d="M17 17l-4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>`;
const UPLOAD_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 13V3M10 3l-4 4M10 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M3.5 15v1a1 1 0 001 1h11a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>`;
const LINK_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8.3 11.7l3.4-3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M9.5 6.5l1.2-1.2a2.7 2.7 0 013.9 3.9L13.4 10.4M10.5 13.5l-1.2 1.2a2.7 2.7 0 01-3.9-3.9l1.2-1.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
const CHECK_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 10.3l3.4 3.4 7.2-7.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
const TRASH_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 6h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /><path d="M8 6V4.6a.9.9 0 01.9-.9h2.2a.9.9 0 01.9.9V6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /><path d="M5.5 6l.8 9.3a1 1 0 001 .9h5.4a1 1 0 001-.9l.8-9.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /><path d="M8.5 8.7v4.6M11.5 8.7v4.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>`;

// shell()은 페이지 내용과 무관하게 항상 이 자리표시자를 nav의 "회원 명단" 링크
// 안에 심어둡니다 — 실제로 승인 대기가 있는지는 DB를 봐야 알 수 있는데, shell()
// 자신은 동기 함수라 여기서 직접 조회할 수 없습니다. 대신 backstage.ts/email.ts의
// 공용 미들웨어가 응답을 다 그린 뒤 이 문자열을 찾아 뱃지로 바꿔치기(또는 삭제)
// 합니다 — shell()을 부르는 23곳 전부에 "대기 건수"를 일일이 전달하지 않고도
// nav 배지가 백스테이지 전 페이지에서 항상 정확하게 뜨는 이유입니다.
export const PENDING_APPROVALS_BADGE_MARKER = "<!--bs-pending-badge-->";

export function shell(title: string, active: string, bodyHtml: string): string {
  // 로고 옆(topbarNav)에 ☰ + nav 링크, 테마 토글 오른쪽(topbarEnd)에 로그아웃 —
  // 실제 배치는 emailRender.ts의 page()가 topbar 안에서 조립합니다. ☰는 모바일
  // 폭에서 CSS order로 로고보다 앞(왼쪽)에 오도록 되어 있습니다(FORM_STYLE 참고).
  const menuToggle = `<button type="button" class="bs-menu-toggle" id="bs-menu-toggle" aria-label="메뉴 열기" aria-expanded="false" aria-controls="bs-nav">${MENU_ICON_SVG}</button>`;
  const drawerLogout = `
    <form method="post" action="/logout" class="bs-drawer-logout-form">
      <button type="submit" class="bs-nav-logout">로그아웃</button>
    </form>
  `;
  const contentGroupActive = active === "notices" || active === "archive" || active === "uploads";
  const infoGroupActive = active === "contact" || active === "bylaws" || active === "apply";
  const navLinks = `
    <div class="bs-nav-links" id="bs-nav">
      ${navLink("/", "홈", active === "home")}
      <details class="bs-nav-group" name="bs-nav-group">
        <summary class="${contentGroupActive ? "active" : ""}">콘텐츠</summary>
        <div class="bs-nav-group-menu">
          ${navLink("/notices", "공지사항", active === "notices")}
          ${navLink("/archive", "대회 아카이브", active === "archive")}
          ${navLink("/uploads", "업로드", active === "uploads")}
        </div>
      </details>
      <details class="bs-nav-group" name="bs-nav-group">
        <summary class="${infoGroupActive ? "active" : ""}">동아리 정보</summary>
        <div class="bs-nav-group-menu">
          ${navLink("/contact", "연락처", active === "contact")}
          ${navLink("/bylaws", "회칙", active === "bylaws")}
          ${navLink("/apply", "지원 폼", active === "apply")}
        </div>
      </details>
      <a href="/members"${active === "members" ? ' class="active"' : ""}>회원 명단${PENDING_APPROVALS_BADGE_MARKER}</a>
      ${navLink("/runforce", "RUNFORCE", active === "runforce")}
      ${navLink("/email", "이메일", active === "email")}
      ${drawerLogout}
    </div>
  `;
  // 데스크톱 topbar 오른쪽용 — 모바일 폭에서는 CSS로 숨기고 위 drawerLogout이
  // 대신 보입니다(FORM_STYLE의 모바일 미디어 쿼리 참고).
  const logout = `
    <form method="post" action="/logout" class="bs-nav-logout-form">
      <button type="submit" class="bs-nav-logout">로그아웃</button>
    </form>
  `;
  const backdrop = `<div class="bs-backdrop" id="bs-backdrop"></div>`;

  return page(
    title,
    `<style>${FORM_STYLE}</style>${backdrop}${bodyHtml}<script>${BS_MENU_SCRIPT}</script>`,
    `${menuToggle}${navLinks}`,
    logout,
  );
}

// authGuard.ts의 requireAdmin이 로그인은 됐지만 권한이 안 맞는 경우(회원 아님/관리자
// 아님)에 씁니다. 일반 renderErrorPage와 달리 로그아웃(또는 재로그인) 액션을 넣어서,
// 세션이 잘못된 계정으로 잡혀 있어도 backstage를 떠나지 않고 바로 계정을 바꿀 수 있게 합니다.
export function renderBackstageErrorPage(title: string, message: string, action?: string): string {
  return page(
    title,
    `<style>${FORM_STYLE}</style><h1>${escapeHtml(title)}</h1><p class="bs-lead">${escapeHtml(message)}</p>${action ?? ""}`,
  );
}

export const BACKSTAGE_LOGOUT_ACTION = `<form method="post" action="/logout" style="margin-top:16px"><button type="submit" class="bs-submit">로그아웃하고 다른 계정으로 로그인</button></form>`;
export const BACKSTAGE_RELOGIN_ACTION = `<a class="bs-new" href="/api/auth/discord">다시 로그인</a>`;

export function renderBackstageHome(member: UserRecord): string {
  return shell(
    "Backstage",
    "home",
    `
    <p class="bs-eyebrow">RUN Backstage</p>
    <h1>안녕하세요, ${escapeHtml(member.name || "관리자")}님</h1>
    <p class="bs-lead">관리자 권한이 확인되었습니다. 왼쪽 위 메뉴에서 관리할 콘텐츠를 선택하세요.</p>
    <p class="bs-note" style="margin-top:16px">저장하면 D1에 바로 반영되고, GitHub Actions가 자동으로 다시 빌드/배포합니다 (보통 1분 내외 걸려요).</p>
  `,
  );
}

// ---------- notices ----------

export function renderNoticeList(notices: NoticeRow[]): string {
  const items =
    notices.length === 0
      ? `<p class="empty">등록된 공지가 없습니다.</p>`
      : `<ul class="bs-list">
        ${notices
          .map(
            (n) => `<li>
              <span>
                ${n.pinned ? '<span class="pin">📌</span>' : ""}
                <a class="title" href="/notices/${escapeHtml(n.slug)}/edit">${escapeHtml(n.title)}</a>
              </span>
              <span class="meta">${escapeHtml(n.date)} · ${escapeHtml(n.slug)}</span>
            </li>`,
          )
          .join("\n")}
      </ul>`;

  return shell(
    "공지사항 관리",
    "notices",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>공지사항</h1>
    <a class="bs-new" href="/notices/new">+ 새 공지 작성</a>
    ${items}
  `,
  );
}

export type NoticeFormData = {
  slug: string;
  date: string;
  pinned: boolean;
  titleKo: string;
  titleEn: string;
  contentKo: string;
  contentEn: string;
};

export function renderNoticeForm(mode: "new" | "edit", data: NoticeFormData, error?: string): string {
  const action = mode === "new" ? "/notices/new" : `/notices/${escapeHtml(data.slug)}/edit`;
  return shell(
    mode === "new" ? "새 공지 작성" : `공지 수정 — ${data.slug}`,
    "notices",
    `
    <p class="bs-eyebrow">Backstage · 공지사항</p>
    <h1>${mode === "new" ? "새 공지 작성" : "공지 수정"}</h1>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
    <form class="bs-form" method="post" action="${action}">
      <div class="bs-card">
        <p class="bs-card-title">기본 정보</p>
        <div class="bs-field">
          <label>슬러그 (URL에 쓰임, 영문/숫자/하이픈)</label>
          <input type="text" name="slug" value="${escapeHtml(data.slug)}" pattern="[a-z0-9-]+" required ${mode === "edit" ? "readonly" : ""} />
        </div>
        <div class="bs-row2" style="margin-top:18px">
          <div class="bs-field">
            <label>날짜</label>
            <input type="date" name="date" value="${escapeHtml(data.date)}" required />
          </div>
          <div class="bs-field bs-check" style="align-self:end;flex-direction:row;">
            <input type="checkbox" id="pinned" name="pinned" ${data.pinned ? "checked" : ""} />
            <label for="pinned" style="margin:0;">상단 고정</label>
          </div>
        </div>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">제목</p>
        <div class="bs-row2">
          <div class="bs-field">
            <label>한국어</label>
            <input type="text" name="titleKo" value="${escapeHtml(data.titleKo)}" required />
          </div>
          <div class="bs-field">
            <label>영어</label>
            <input type="text" name="titleEn" value="${escapeHtml(data.titleEn)}" required />
          </div>
        </div>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">본문 (마크다운)</p>
        <div class="bs-row2">
          <div class="bs-field">
            <label>한국어</label>
            <textarea name="contentKo" class="bs-autosize" rows="14" oninput="this.style.height='';this.style.height=this.scrollHeight+'px'">${escapeHtml(data.contentKo)}</textarea>
          </div>
          <div class="bs-field">
            <label>영어</label>
            <textarea name="contentEn" class="bs-autosize" rows="14" oninput="this.style.height='';this.style.height=this.scrollHeight+'px'">${escapeHtml(data.contentEn)}</textarea>
          </div>
        </div>
      </div>
      <script>
        document.querySelectorAll("textarea.bs-autosize").forEach((el) => {
          el.style.height = el.scrollHeight + "px";
        });
      </script>

      <div class="bs-actions bs-actions-end">
        <a href="/notices" class="bs-cancel">취소</a>
        <button type="submit" class="bs-submit">저장</button>
      </div>
    </form>
    ${
      mode === "edit"
        ? `<div class="bs-danger-zone">
            <form method="post" action="/notices/${escapeHtml(data.slug)}/delete" onsubmit="return confirm('정말 삭제할까요?')">
              <button type="submit" class="bs-danger">이 공지 삭제</button>
            </form>
          </div>`
        : ""
    }
  `,
  );
}

// ---------- archive ----------

export function renderArchiveList(season: Season, entries: ArchiveRow[]): string {
  const items =
    entries.length === 0
      ? `<p class="empty">등록된 대회가 없습니다.</p>`
      : `<ul class="bs-list">
        ${entries
          .map(
            (e) => `<li>
              <a class="title" href="/archive/${season}/${escapeHtml(e.slug)}/edit">${escapeHtml(e.title)}</a>
              <span class="meta">${escapeHtml(e.date)} · ${escapeHtml(e.slug)}</span>
            </li>`,
          )
          .join("\n")}
      </ul>`;

  return shell(
    "대회 아카이브 관리",
    "archive",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>대회 아카이브</h1>
    <div class="bs-subnav">
      <a href="/archive/spring"${season === "spring" ? ' class="active"' : ""}>봄</a>
      <a href="/archive/fall"${season === "fall" ? ' class="active"' : ""}>가을</a>
    </div>
    <a class="bs-new" href="/archive/${season}/new">+ 새 대회 등록</a>
    ${items}
  `,
  );
}

export type ArchiveFormData = {
  slug: string;
  season: Season;
  year: string;
  date: string;
  titleKo: string;
  titleEn: string;
  contentKo: string;
  contentEn: string;
  resources: { file: string; label: string }[];
  judges: { name: string; url: string }[];
};

export function archiveRowsToFormData(season: Season, slug: string, ko: ArchiveRow | null, en: ArchiveRow | null): ArchiveFormData {
  const base = ko ?? en;
  return {
    slug,
    season,
    year: base ? String(base.year) : "",
    date: base?.date ?? "",
    titleKo: ko?.title ?? "",
    titleEn: en?.title ?? "",
    contentKo: ko?.content ?? "",
    contentEn: en?.content ?? "",
    resources: base?.resources ?? [],
    judges: base?.judges ?? [],
  };
}

// 자료 목록 · 온라인 저지는 둘 다 "이름 + 링크" 쌍을 여러 개 받는 반복 필드입니다.
// 서버 렌더 HTML이라 리액트 state 없이, <template> 복제 + name="...[]" 배열
// 필드(hono의 parseBody가 "[]"로 끝나는 키를 자동으로 배열로 묶어줌)로 구현합니다.
function archiveRowItem(nameField: string, linkField: string, nameVal: string, linkVal: string, namePh: string, linkPh: string): string {
  return `<div class="bs-row-item">
    <input type="text" name="${nameField}" value="${escapeHtml(nameVal)}" placeholder="${escapeHtml(namePh)}" />
    <input type="text" name="${linkField}" value="${escapeHtml(linkVal)}" placeholder="${escapeHtml(linkPh)}" />
    <button type="button" class="bs-row-remove" aria-label="삭제" onclick="this.closest('.bs-row-item').remove()">×</button>
  </div>`;
}

function archiveRowsField(
  label: string,
  rowsId: string,
  templateId: string,
  items: { name: string; link: string }[],
  nameField: string,
  linkField: string,
  namePh: string,
  linkPh: string,
): string {
  const rows = (items.length > 0 ? items : [{ name: "", link: "" }])
    .map((item) => archiveRowItem(nameField, linkField, item.name, item.link, namePh, linkPh))
    .join("");
  return `
    <div class="bs-field">
      <label>${escapeHtml(label)}</label>
      <div class="bs-rows" id="${rowsId}">${rows}</div>
      <button type="button" class="bs-add-row" data-rows="${rowsId}" data-template="${templateId}">+ 추가</button>
      <template id="${templateId}">${archiveRowItem(nameField, linkField, "", "", namePh, linkPh)}</template>
    </div>`;
}

// [data-rows]/[data-template]로 표시해둔 아무 "+ 추가" 버튼에나 다 먹습니다 — 아카이브
// 자료/저지 행뿐 아니라 회칙 개정이력 행에서도 그대로 재사용합니다.
const BS_ROWS_SCRIPT = `
  document.querySelectorAll(".bs-add-row[data-rows]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rows = document.getElementById(btn.dataset.rows);
      const tpl = document.getElementById(btn.dataset.template);
      const clone = tpl.content.cloneNode(true);
      const row = clone.firstElementChild;
      if (row) row.classList.add("bs-row-enter");
      rows.appendChild(clone);
    });
  });
`;

export function renderArchiveForm(mode: "new" | "edit", data: ArchiveFormData, error?: string): string {
  const action = mode === "new" ? `/archive/${data.season}/new` : `/archive/${data.season}/${escapeHtml(data.slug)}/edit`;
  return shell(
    mode === "new" ? "새 대회 등록" : `대회 수정 — ${data.slug}`,
    "archive",
    `
    <p class="bs-eyebrow">Backstage · 대회 아카이브</p>
    <h1>${mode === "new" ? "새 대회 등록" : "대회 수정"}</h1>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
    <form class="bs-form" method="post" action="${action}">
      <div class="bs-card">
        <p class="bs-card-title">기본 정보</p>
        <div class="bs-row2">
          <div class="bs-field">
            <label>슬러그 (예: 2026-spring)</label>
            <input type="text" name="slug" value="${escapeHtml(data.slug)}" pattern="[a-z0-9-]+" required ${mode === "edit" ? "readonly" : ""} />
          </div>
          <div class="bs-field">
            <label>시즌</label>
            <select name="season" ${mode === "edit" ? "disabled" : ""}>
              <option value="spring" ${data.season === "spring" ? "selected" : ""}>봄</option>
              <option value="fall" ${data.season === "fall" ? "selected" : ""}>가을</option>
            </select>
            ${mode === "edit" ? `<input type="hidden" name="season" value="${data.season}" />` : ""}
          </div>
        </div>
        <div class="bs-row2" style="margin-top:18px">
          <div class="bs-field">
            <label>연도</label>
            <input type="number" name="year" value="${escapeHtml(data.year)}" required />
          </div>
          <div class="bs-field">
            <label>날짜</label>
            <input type="date" name="date" value="${escapeHtml(data.date)}" required />
          </div>
        </div>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">제목</p>
        <div class="bs-row2">
          <div class="bs-field">
            <label>한국어</label>
            <input type="text" name="titleKo" value="${escapeHtml(data.titleKo)}" required />
          </div>
          <div class="bs-field">
            <label>영어</label>
            <input type="text" name="titleEn" value="${escapeHtml(data.titleEn)}" required />
          </div>
        </div>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">자료 · 저지</p>
        ${archiveRowsField(
          "자료 목록",
          "resources-rows",
          "resource-row-template",
          data.resources.map((r) => ({ name: r.label, link: r.file })),
          "resourceLabel[]",
          "resourceFile[]",
          "이름 (예: 풀이)",
          "링크 (파일명 또는 URL)",
        )}
        <div style="margin-top:18px">
          ${archiveRowsField(
            "온라인 저지",
            "judges-rows",
            "judge-row-template",
            data.judges.map((j) => ({ name: j.name, link: j.url })),
            "judgeName[]",
            "judgeUrl[]",
            "이름 (예: oj.uz)",
            "링크 (URL)",
          )}
        </div>
      </div>
      <script>${BS_ROWS_SCRIPT}</script>

      <div class="bs-card">
        <p class="bs-card-title">본문 (마크다운)</p>
        <div class="bs-row2">
          <div class="bs-field">
            <label>한국어</label>
            <textarea name="contentKo" rows="8">${escapeHtml(data.contentKo)}</textarea>
          </div>
          <div class="bs-field">
            <label>영어</label>
            <textarea name="contentEn" rows="8">${escapeHtml(data.contentEn)}</textarea>
          </div>
        </div>
      </div>

      <div class="bs-actions bs-actions-end">
        <a href="/archive/${data.season}" class="bs-cancel">취소</a>
        <button type="submit" class="bs-submit">저장</button>
      </div>
    </form>
    ${
      mode === "edit"
        ? `<div class="bs-danger-zone">
            <form method="post" action="/archive/${data.season}/${escapeHtml(data.slug)}/delete" onsubmit="return confirm('정말 삭제할까요?')">
              <button type="submit" class="bs-danger">이 대회 삭제</button>
            </form>
          </div>`
        : ""
    }
  `,
  );
}

// ---------- members ----------
// 회원 데이터의 원천은 D1(users/admins/semester_membership)입니다 — backstage에서
// 직접 만들고(+새 유저) 고치고(수정) 지울 수 있습니다. 세 하위 탭으로 나뉩니다:
// 전체 명단(/members), 학기별 명단(/members/semesters/...), 관리자(/members/admins).

// 명예회원 지정이 최우선(학기 소속 승인과 무관한 별개 자격), 그다음 이번 학기 소속
// 여부(status==="member" — 현재 학기에 approved됐는지)로 활동회원을 가립니다.
// 남은 두 경우는 한 번도 승인된 적 없으면(status==="applicant") 신규회원, 아니면
// (과거엔 승인됐지만 이번 학기는 아님) 휴회원 — 마이페이지(src/components/account/
// UserProfileCard.tsx의 memberStatusLabel)와 정확히 같은 규칙입니다.
function memberStatusLabel(user: UserRecord): string {
  if (user.isHonoraryMember) return "명예회원";
  if (user.status === "member") return "활동회원";
  if (user.status === "applicant") return "신규회원";
  return "휴회원";
}
const SEASON_LABEL: Record<"spring" | "fall", string> = { spring: "봄", fall: "가을" };

function semesterLabel(year: number, season: "spring" | "fall"): string {
  return `${year}년 ${SEASON_LABEL[season]}`;
}

function memberSubnav(active: "list" | "semesters" | "admins" | "honorary"): string {
  return `<div class="bs-subnav">
    <a href="/members"${active === "list" ? ' class="active"' : ""}>전체 명단</a>
    <a href="/members/semesters"${active === "semesters" ? ' class="active"' : ""}>학기별 명단</a>
    <a href="/members/honorary"${active === "honorary" ? ' class="active"' : ""}>명예회원</a>
    <a href="/members/admins"${active === "admins" ? ' class="active"' : ""}>관리자</a>
  </div>`;
}

function memberAvatarHtml(avatarUrl: string | null): string {
  return avatarUrl
    ? `<img class="bs-member-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" />`
    : `<div class="bs-member-avatar bs-member-avatar-fallback" aria-hidden="true">?</div>`;
}

export type MemberListPage = {
  q: string;
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  total: number;
  grandTotal: number;
  totalPages: number;
};

function memberPagerLink(q: string, page: number, label: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 0) params.set("page", String(page));
  const qs = params.toString();
  return `<a href="/members${qs ? `?${qs}` : ""}">${label}</a>`;
}

function renderMemberRow(user: UserRecord): string {
  const metaParts = [user.nickname, user.studentId, user.email, `Discord ${user.discordId}`].filter((v): v is string => Boolean(v));

  return `<li>
    <a class="bs-member-link" href="/members/${encodeURIComponent(user.uid)}/edit">
      ${memberAvatarHtml(user.avatarUrl)}
      <div class="bs-member-body">
        <div class="bs-member-main">
          <span class="name">${escapeHtml(user.name || "(이름 없음)")}</span>
          <span class="bs-badge-outline">${memberStatusLabel(user)}</span>
          ${user.role === "admin" ? '<span class="bs-badge">관리자</span>' : ""}
        </div>
        <div class="meta">${metaParts.map((p) => escapeHtml(p)).join(" · ")}</div>
      </div>
    </a>
  </li>`;
}

export function renderMemberList(users: UserRecord[], meta: MemberListPage, notice?: string): string {
  const body =
    users.length === 0
      ? `<p class="empty">${meta.q ? "검색 결과가 없습니다." : "등록된 유저가 없습니다. 위에서 새로 등록해 주세요."}</p>`
      : `<ul class="bs-member-list">${users.map(renderMemberRow).join("\n")}</ul>`;

  const pager =
    meta.hasPrev || meta.hasNext
      ? `<div class="pager">
        ${meta.hasPrev ? memberPagerLink(meta.q, meta.page - 1, "← 이전") : `<span class="disabled">← 이전</span>`}
        <span>${meta.page + 1} / ${meta.totalPages}</span>
        ${meta.hasNext ? memberPagerLink(meta.q, meta.page + 1, "다음 →") : `<span class="disabled">다음 →</span>`}
      </div>`
      : meta.total > 0
        ? `<p class="bs-note" style="margin-top:12px">총 ${meta.total}명</p>`
        : "";

  return shell(
    "회원 명단",
    "members",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>회원 명단</h1>
    ${memberSubnav("list")}
    <p class="bs-note" style="margin-bottom:16px">D1에 저장된 전체 유저 명단이에요 · 총 ${meta.grandTotal}명</p>
    ${notice ? `<p class="bs-note" style="margin-bottom:16px">${escapeHtml(notice)}</p>` : ""}

    <div class="bs-list-toolbar">
      <div class="bs-list-toolbar-actions">
        <a class="bs-new" href="/members/new" style="margin-bottom:0">+ 새 유저</a>
        ${renderCsvExportButton("csv-dialog-members", "/members/export.csv", "CSV 다운로드", MEMBER_EXPORT_COLUMNS)}
        <form method="post" action="/members/refresh-avatars" style="margin:0;">
          <button type="submit" class="bs-new bs-new-outline" style="margin-bottom:0;">프로필 사진 갱신</button>
        </form>
      </div>
      <form class="bs-search" method="get" action="/members">
        <input type="text" name="q" value="${escapeHtml(meta.q)}" placeholder="이름 · 학번 · 이메일 · Discord 검색" />
        <button type="submit" class="bs-cancel-btn bs-icon-btn" aria-label="검색">${SEARCH_ICON_SVG}</button>
        ${meta.q ? `<a href="/members" class="bs-cancel">지우기</a>` : ""}
      </form>
    </div>

    ${body}
    ${pager}
  `,
  );
}

export type UserFormData = {
  uid: string; // 새 유저면 ""
  discordId: string;
  nickname: string; // '' = 닉네임 없음(새 유저 폼에서 비워두면 Discord 표시 이름을 기본값으로 씀)
  name: string;
  email: string;
  studentId: string;
  phone: string;
  solvedAc: string;
  codeforces: string;
  atcoder: string;
  isAdmin: boolean;
  isHonoraryMember: boolean;
};

export function userRowToFormData(user: UserRecord): UserFormData {
  return {
    uid: user.uid,
    discordId: user.discordId,
    nickname: user.nickname ?? "",
    name: user.name ?? "",
    email: user.email ?? "",
    studentId: user.studentId ?? "",
    phone: user.phone ?? "",
    solvedAc: user.solvedAc ?? "",
    codeforces: user.codeforces ?? "",
    atcoder: user.atcoder ?? "",
    isAdmin: user.role === "admin",
    isHonoraryMember: user.isHonoraryMember,
  };
}

// semesters가 null이면(새 유저 작성 중) 소속 학기 카드 자체를 생략합니다 — 아직
// uid가 없어서 보여줄 게 없습니다.
export function renderUserForm(mode: "new" | "edit", data: UserFormData, semesters: UserSemesterEntry[] | null, error?: string): string {
  const action = mode === "new" ? "/members/new" : `/members/${encodeURIComponent(data.uid)}/edit`;

  return shell(
    mode === "new" ? "새 유저 등록" : `유저 수정 — ${data.name || data.discordId}`,
    "members",
    `
    <p class="bs-eyebrow">Backstage · 회원 명단</p>
    <h1>${mode === "new" ? "새 유저 등록" : "유저 수정"}</h1>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
    <form class="bs-form" method="post" action="${action}">
      <div class="bs-card">
        <p class="bs-card-title">프로필</p>
        <div class="bs-field">
          <label>Discord ID</label>
          <input type="text" name="discordId" value="${escapeHtml(data.discordId)}" required />
        </div>
        <div class="bs-row2" style="margin-top:18px">
          <div class="bs-field">
            <label>닉네임</label>
            <input type="text" name="nickname" value="${escapeHtml(data.nickname)}" maxlength="32" />
            <span class="hint">${mode === "new" ? "비워두면 Discord 표시 이름을 가져옵니다." : "비우면 '닉네임 없음'이 됩니다."}</span>
          </div>
          <div class="bs-field">
            <label>이름</label>
            <input type="text" name="name" value="${escapeHtml(data.name)}" />
          </div>
          <div class="bs-field">
            <label>학번</label>
            <input type="text" name="studentId" value="${escapeHtml(data.studentId)}" />
          </div>
        </div>
        <div class="bs-row2" style="margin-top:18px">
          <div class="bs-field">
            <label>이메일</label>
            <input type="text" name="email" value="${escapeHtml(data.email)}" />
          </div>
          <div class="bs-field">
            <label>전화번호</label>
            <input type="text" name="phone" value="${escapeHtml(data.phone)}" />
          </div>
        </div>
        <div class="bs-row2" style="margin-top:18px">
          <div class="bs-field">
            <label>solved.ac</label>
            <input type="text" name="solvedAc" value="${escapeHtml(data.solvedAc)}" />
          </div>
          <div class="bs-field">
            <label>Codeforces</label>
            <input type="text" name="codeforces" value="${escapeHtml(data.codeforces)}" />
          </div>
        </div>
        <div class="bs-field" style="margin-top:18px">
          <label>AtCoder</label>
          <input type="text" name="atcoder" value="${escapeHtml(data.atcoder)}" />
        </div>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">권한 · 자격</p>
        <div class="bs-field bs-check" style="flex-direction:row;">
          <input type="checkbox" id="isAdmin" name="isAdmin" value="1" ${data.isAdmin ? "checked" : ""} />
          <label for="isAdmin" style="margin:0;">관리자 권한 부여</label>
        </div>
        <div class="bs-field bs-check" style="flex-direction:row;margin-top:10px;">
          <input type="checkbox" id="isHonoraryMember" name="isHonoraryMember" value="1" ${data.isHonoraryMember ? "checked" : ""} />
          <label for="isHonoraryMember" style="margin:0;">명예회원 지정</label>
        </div>
      </div>

      ${
        semesters !== null
          ? `<div class="bs-card">
              <p class="bs-card-title">소속 학기</p>
              ${
                semesters.length === 0
                  ? `<p class="bs-note">소속된 학기가 없습니다 — 학기별 명단 탭에서 추가할 수 있어요.</p>`
                  : `<ul class="bs-list">
                      ${semesters
                        .map(
                          (s) =>
                            `<li><a class="title" href="/members/semesters/${s.year}/${s.season}">${escapeHtml(semesterLabel(s.year, s.season))}</a><span class="meta">${s.status === "approved" ? "승인됨" : "승인 대기"}</span></li>`,
                        )
                        .join("\n")}
                    </ul>`
              }
            </div>`
          : ""
      }

      <div class="bs-actions">
        <button type="submit" class="bs-submit">저장</button>
        <a href="/members" class="bs-cancel">취소</a>
      </div>
    </form>
    ${
      mode === "edit"
        ? `<div class="bs-danger-zone">
            <form method="post" action="/members/${encodeURIComponent(data.uid)}/delete" onsubmit="return confirm('정말 이 유저를 삭제할까요? 학기 소속/관리자 권한도 함께 지워집니다.')">
              <button type="submit" class="bs-danger">이 유저 삭제</button>
            </form>
          </div>`
        : ""
    }
  `,
  );
}

// ---------- members: 학기별 명단 ----------

export function renderSemesterPicker(semesters: SemesterInfo[], error?: string): string {
  const list =
    semesters.length === 0
      ? `<p class="empty">아직 열린 학기가 없습니다. 아래에서 첫 학기를 열어주세요.</p>`
      : `<ul class="bs-list">
          ${semesters
            .map(
              (s) =>
                `<li>
                  <span>
                    <a class="title" href="/members/semesters/${s.year}/${s.season}">${escapeHtml(semesterLabel(s.year, s.season))}</a>
                    ${s.pendingCount > 0 ? `<span class="bs-badge" style="background:var(--logo-accent);font-size:0.85rem;" title="승인 대기 중">${s.pendingCount}</span>` : ""}
                  </span>
                  ${s.isCurrent ? `<span class="bs-current-check" title="현재 학기">${CHECK_ICON_SVG}</span>` : ""}
                </li>`,
            )
            .join("\n")}
        </ul>`;

  return shell(
    "학기별 명단",
    "members",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>회원 명단</h1>
    ${memberSubnav("semesters")}
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}

    <div class="bs-card">
      <p class="bs-card-title">새 학기 열기</p>
      <form method="post" action="/members/semesters/open" class="bs-row2">
        <div class="bs-field">
          <label>연도</label>
          <input type="number" name="year" min="2000" max="2100" required />
        </div>
        <div class="bs-field">
          <label>학기</label>
          <select name="season" required>
            <option value="spring">봄</option>
            <option value="fall">가을</option>
          </select>
        </div>
        <div class="bs-field bs-check" style="flex-direction:row;grid-column:1/-1;justify-content:space-between;">
          <span style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="makeCurrent" name="makeCurrent" value="1" checked />
            <label for="makeCurrent" style="margin:0;">현재 학기로 설정</label>
          </span>
          <button type="submit" class="bs-submit" style="margin:0;">새로운 학기 생성</button>
        </div>
      </form>
    </div>

    ${list}
  `,
  );
}

// D1의 datetime('now')는 "YYYY-MM-DD HH:MM:SS"(UTC, "T"/"Z" 없음)를 돌려줍니다 —
// 그대로 new Date()에 넣으면 엔진마다 로컬 시간으로 잘못 해석될 수 있어서, ISO
// 8601로 정규화(공백→T, 끝에 Z)한 뒤에 파싱합니다.
function parseD1DateTime(value: string): number {
  return new Date(`${value.replace(" ", "T")}Z`).getTime();
}

function semesterMemberRowHtml(m: SemesterMemberRow, action: string): string {
  const metaParts = [m.studentId, m.email, `Discord ${m.discordId}`].filter((v): v is string => Boolean(v));
  return `<li>
    ${memberAvatarHtml(m.avatarUrl)}
    <div class="bs-member-body">
      <div class="bs-member-main">
        <span class="name">${escapeHtml(m.name || "(이름 없음)")}</span>
      </div>
      <div class="meta">${metaParts.map((p) => escapeHtml(p)).join(" · ")}</div>
    </div>
    ${action}
  </li>`;
}

export function renderSemesterRoster(
  year: number,
  season: "spring" | "fall",
  isCurrent: boolean,
  members: SemesterMemberRow[],
  error?: string,
): string {
  const pending = members.filter((m) => m.status === "pending");
  const approved = members.filter((m) => m.status === "approved");
  const base = `/members/semesters/${year}/${season}`;

  const pendingHtml =
    pending.length === 0
      ? `<p class="empty">승인 대기 중인 요청이 없습니다.</p>`
      : `<ul class="bs-member-list">
          ${pending
            .map((m) =>
              semesterMemberRowHtml(
                m,
                `<div style="display:flex;gap:6px;flex-shrink:0;">
                  <form method="post" action="${base}/approve"><input type="hidden" name="uid" value="${escapeHtml(m.uid)}" /><button type="submit" class="bs-submit">승인</button></form>
                  <form method="post" action="${base}/reject"><input type="hidden" name="uid" value="${escapeHtml(m.uid)}" /><button type="submit" class="bs-danger">거부</button></form>
                </div>`,
              ),
            )
            .join("\n")}
        </ul>`;

  const approvedHtml =
    approved.length === 0
      ? `<p class="empty">승인된 회원이 없습니다.</p>`
      : `<ul class="bs-member-list">
          ${approved
            .map((m) =>
              semesterMemberRowHtml(
                m,
                `<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                  <span class="bs-note" style="text-align:right;">${escapeHtml(m.approvedByName ?? "관리자")}이 승인함${m.approvedAt ? `<br />${escapeHtml(formatKstDateTime(parseD1DateTime(m.approvedAt)))}` : ""}</span>
                  <form method="post" action="${base}/revoke" onsubmit="return confirm('이 학기 소속을 취소할까요?')"><input type="hidden" name="uid" value="${escapeHtml(m.uid)}" /><button type="submit" class="bs-danger bs-icon-btn" aria-label="회수">${TRASH_ICON_SVG}</button></form>
                </div>`,
              ),
            )
            .join("\n")}
        </ul>`;

  return shell(
    `학기별 명단 — ${semesterLabel(year, season)}`,
    "members",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>회원 명단</h1>
    ${memberSubnav("semesters")}
    <p class="bs-note" style="margin-bottom:16px">
      <a href="/members/semesters" class="bs-cancel">← 학기 목록</a> ·
      ${escapeHtml(semesterLabel(year, season))}${isCurrent ? " · <strong>현재 학기</strong>" : ""}
    </p>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      ${renderCsvExportButton("csv-dialog-semester", `${base}/export.csv`, "CSV 다운로드", SEMESTER_EXPORT_COLUMNS)}
      ${
        isCurrent
          ? ""
          : `<form method="post" action="${base}/set-current" style="margin:0;">
              <button type="submit" class="bs-new bs-new-outline" style="margin-bottom:0;">현재 학기로 지정</button>
            </form>`
      }
    </div>

    <div class="bs-card">
      <p class="bs-card-title">유저를 바로 추가(즉시 승인)</p>
      <form method="post" action="${base}/add" style="display:flex;align-items:center;gap:10px;flex-wrap:nowrap;">
        <input
          type="text" name="query" required
          placeholder="이름 또는 Discord ID"
          style="flex:1 1 auto;min-width:0;font:inherit;padding:10px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.04);color:inherit;"
        />
        <button type="submit" class="bs-submit bs-icon-btn" aria-label="추가">${LINK_ICON_SVG}</button>
      </form>
      <p class="bs-note" style="margin-top:8px">이름/Discord ID가 정확히 일치하는 기존 유저 한 명을 찾아 곧바로 승인 처리합니다.</p>
    </div>

    <p class="bs-card-title" style="margin-top:24px">승인 대기 중 (${pending.length})</p>
    ${pendingHtml}

    <p class="bs-card-title" style="margin-top:24px">승인됨 (${approved.length})</p>
    ${approvedHtml}

    <div class="bs-danger-zone">
      <form method="post" action="${base}/delete" onsubmit="return confirm('정말 ${escapeHtml(semesterLabel(year, season))} 학기를 삭제할까요? 이 학기의 승인·대기 기록이 모두 함께 삭제됩니다.')">
        <button type="submit" class="bs-danger">이 학기 삭제</button>
      </form>
    </div>
  `,
  );
}

// ---------- members: 관리자 ----------

export function renderAdminList(admins: UserRecord[]): string {
  const body =
    admins.length === 0
      ? `<p class="empty">등록된 관리자가 없습니다.</p>`
      : `<ul class="bs-member-list">
          ${admins
            .map(
              (a) => `<li>
                ${memberAvatarHtml(a.avatarUrl)}
                <div class="bs-member-body">
                  <div class="bs-member-main"><span class="name">${escapeHtml(a.name || "(이름 없음)")}</span></div>
                  <div class="meta">${escapeHtml(`Discord ${a.discordId}`)}</div>
                </div>
                <form method="post" action="/members/admins/revoke" onsubmit="return confirm('${escapeHtml(a.name || a.discordId)}님의 관리자 권한을 해제할까요?')">
                  <input type="hidden" name="uid" value="${escapeHtml(a.uid)}" />
                  <button type="submit" class="bs-danger">권한 해제</button>
                </form>
              </li>`,
            )
            .join("\n")}
        </ul>`;

  return shell(
    "관리자",
    "members",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>회원 명단</h1>
    ${memberSubnav("admins")}
    <p class="bs-note" style="margin-bottom:16px">관리자를 새로 추가하려면 전체 명단에서 그 유저를 찾아 수정 페이지의 "관리자 권한 부여" 체크박스를 쓰세요.</p>
    ${body}
  `,
  );
}

// ---------- members: 명예회원 ----------

export function renderHonoraryMemberList(members: UserRecord[]): string {
  const body =
    members.length === 0
      ? `<p class="empty">등록된 명예회원이 없습니다.</p>`
      : `<ul class="bs-member-list">
          ${members
            .map(
              (m) => `<li>
                ${memberAvatarHtml(m.avatarUrl)}
                <div class="bs-member-body">
                  <div class="bs-member-main"><span class="name">${escapeHtml(m.name || "(이름 없음)")}</span></div>
                  <div class="meta">${escapeHtml(`Discord ${m.discordId}`)}</div>
                </div>
                <form method="post" action="/members/honorary/revoke" onsubmit="return confirm('${escapeHtml(m.name || m.discordId)}님의 명예회원 지정을 해제할까요?')">
                  <input type="hidden" name="uid" value="${escapeHtml(m.uid)}" />
                  <button type="submit" class="bs-danger">지정 해제</button>
                </form>
              </li>`,
            )
            .join("\n")}
        </ul>`;

  return shell(
    "명예회원",
    "members",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>회원 명단</h1>
    ${memberSubnav("honorary")}
    <p class="bs-note" style="margin-bottom:16px">명예회원을 새로 지정하려면 전체 명단에서 그 유저를 찾아 수정 페이지의 "명예회원 지정" 체크박스를 쓰세요.</p>
    ${body}
  `,
  );
}

// ---------- contact ----------
// 연락처 페이지는 항목 구성이 거의 안 바뀌는 걸 전제로, 실제 있는 필드만 딱
// 고정해서 받습니다 (회장 이름 한/영, 전화번호, 이메일, 동아리 이메일, 인스타/깃허브
// URL, 그 외 자유 텍스트). 라벨("회장"/"President" 등)과 제목("연락처"/"Contact")은
// 코드에 고정돼 있고, backstage.ts에서 채워 넣습니다.

export type ContactFormData = {
  presidentNameKo: string;
  presidentNameEn: string;
  phone: string;
  presidentEmail: string;
  clubEmail: string;
  instagramUrl: string;
  githubUrl: string;
  extraKo: string;
  extraEn: string;
};

function findInfoGroup(info: ContactInfoRow[], labels: string[]): ContactInfoRow | undefined {
  return info.find((group) => labels.includes(group.label));
}

function findSocialUrl(socials: ContactSocial[], platform: string): string {
  return socials.find((s) => s.platform === platform)?.url ?? "";
}

export function contactRowsToFormData(ko: ContactRow | null, en: ContactRow | null): ContactFormData {
  const koPresident = findInfoGroup(ko?.info ?? [], ["회장"]);
  const enPresident = findInfoGroup(en?.info ?? [], ["President"]);
  const koClubEmail = findInfoGroup(ko?.info ?? [], ["동아리 이메일"]);

  return {
    presidentNameKo: koPresident?.lines[0]?.text ?? "",
    presidentNameEn: enPresident?.lines[0]?.text ?? "",
    phone: koPresident?.lines[1]?.text ?? "",
    presidentEmail: koPresident?.lines[2]?.text ?? "",
    clubEmail: koClubEmail?.lines[0]?.text ?? "",
    instagramUrl: findSocialUrl(ko?.socials ?? [], "instagram"),
    githubUrl: findSocialUrl(ko?.socials ?? [], "github"),
    extraKo: ko?.content ?? "",
    extraEn: en?.content ?? "",
  };
}

export function renderContactForm(data: ContactFormData, error?: string): string {
  return shell(
    "연락처 편집",
    "contact",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>연락처 페이지</h1>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
    <form class="bs-form" method="post" action="/contact">
      <div class="bs-card">
        <p class="bs-card-title">회장</p>
        <div class="bs-row2">
          <div class="bs-field">
            <label>이름 (한글)</label>
            <input type="text" name="presidentNameKo" value="${escapeHtml(data.presidentNameKo)}" />
          </div>
          <div class="bs-field">
            <label>이름 (영어)</label>
            <input type="text" name="presidentNameEn" value="${escapeHtml(data.presidentNameEn)}" />
          </div>
        </div>
        <div class="bs-row2" style="margin-top:16px">
          <div class="bs-field">
            <label>전화번호</label>
            <input type="text" name="phone" value="${escapeHtml(data.phone)}" />
          </div>
          <div class="bs-field">
            <label>이메일</label>
            <input type="text" name="presidentEmail" value="${escapeHtml(data.presidentEmail)}" />
          </div>
        </div>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">동아리</p>
        <div class="bs-field">
          <label>동아리 이메일</label>
          <input type="text" name="clubEmail" value="${escapeHtml(data.clubEmail)}" />
        </div>
        <div class="bs-row2" style="margin-top:16px">
          <div class="bs-field">
            <label>인스타그램</label>
            <input type="text" name="instagramUrl" value="${escapeHtml(data.instagramUrl)}" placeholder="https://instagram.com/..." />
          </div>
          <div class="bs-field">
            <label>깃허브</label>
            <input type="text" name="githubUrl" value="${escapeHtml(data.githubUrl)}" placeholder="https://github.com/..." />
          </div>
        </div>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">추가 사항</p>
        <div class="bs-row2">
          <div class="bs-field">
            <label>한국어</label>
            <textarea name="extraKo" rows="4">${escapeHtml(data.extraKo)}</textarea>
          </div>
          <div class="bs-field">
            <label>영어</label>
            <textarea name="extraEn" rows="4">${escapeHtml(data.extraEn)}</textarea>
          </div>
        </div>
      </div>

      <div class="bs-actions bs-actions-end">
        <button type="submit" class="bs-submit">저장</button>
      </div>
    </form>
  `,
  );
}

// ---------- bylaws ----------
// 역대 회칙(버전 여러 개, effective_date가 가장 최신인 게 사이트에 뜨는 "현재 버전")을
// 다룹니다. 본문은 텍스트가 아니라 "장/조/항/호/목 타입 + 텍스트" 행(row)들의
// 순서입니다 — 번호는 src/lib/bylaws.ts(메인 사이트 렌더러)가 그 순서를 보고 매번
// 새로 계산하므로, backstage에서는 dash 문법 없이 행을 추가/삭제/이동만 하면 됩니다.

export function renderBylawsList(versions: BylawsVersionSummary[]): string {
  // versions는 effective_date 최신순인데, "현재 버전"은 그중 게시된(isPublished)
  // 것만 후보라 그냥 0번째가 아니라 게시된 것 중 첫 번째를 찾아야 ⭐가 맞습니다.
  const currentSlug = versions.find((v) => v.isPublished)?.slug;
  const items =
    versions.length === 0
      ? `<p class="empty">등록된 회칙이 없습니다.</p>`
      : `<ul class="bs-list">
        ${versions
          .map(
            (v) => `<li>
              <span>
                ${v.slug === currentSlug ? '<span class="pin">⭐</span>' : ""}
                <a class="title" href="/bylaws/${encodeURIComponent(v.slug)}/edit">${escapeHtml(v.title)} — ${escapeHtml(v.versionLabel)}</a>
                ${!v.isPublished ? '<span class="bs-badge" style="background:rgba(128,128,128,.35);color:inherit;margin-left:8px;">초안</span>' : ""}
              </span>
              <span class="meta">${escapeHtml(v.effectiveDate)} · ${escapeHtml(v.slug)}</span>
            </li>`,
          )
          .join("\n")}
      </ul>`;

  return shell(
    "회칙 관리",
    "bylaws",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>역대 회칙</h1>
    <p class="bs-note" style="margin-bottom:16px">
      게시된 버전들 중 시행일(⭐표시)이 가장 최신인 버전이 <a href="https://kaist.run/ko/bylaws" target="_blank" rel="noopener">kaist.run/ko/bylaws</a>에 뜹니다.
      "초안"은 게시 체크를 끈 상태라 kaist.run에 전혀 안 보입니다. 나머지 게시된 버전은 그 페이지의 "역대 회칙" 목록에서 링크로 연결됩니다.
    </p>
    <a class="bs-new" href="/bylaws/new">+ 새 버전 추가</a>
    ${items}
  `,
  );
}

// 라벨(제정/일부개정)은 입력받지 않습니다 — 항상 첫 행은 제정, 나머지는 일부개정이라
// .bs-rev-badge가 CSS :first-child로 알아서 표시합니다(FORM_STYLE 참고).
function bylawsRevisionRow(dateVal: string): string {
  return `<div class="bs-row-item">
    <input type="text" name="revDate[]" value="${escapeHtml(dateVal)}" placeholder="예: 2017. 03. 18." />
    <span class="bs-rev-badge"></span>
    <button type="button" class="bs-row-remove" aria-label="삭제" onclick="this.closest('.bs-row-item').remove()">×</button>
  </div>`;
}

// 트리 에디터 본체. 장/조/항/호/목을 중첩 카드로 보여주고, "+" 버튼으로 어디에
// 추가하는지가 곧 위계입니다(타입 선택 드롭다운도, 위/아래 이동도 없음 — 순서를
// 바꾸고 싶으면 드래그). 초기 데이터는 #bylaws-initial-blocks에 심어둔 JSON(문서
// 순서대로 평평한 배열, src/lib/bylaws.ts와 같은 구조)을 rank 기반으로 다시
// 트리로 복원해서(unflatten) 채우고, 제출 직전엔 반대로 트리를 평평하게
// 펼쳐서(flatten) #bylaws-blocks-json 히든 인풋에 넣습니다. 번호/미리보기 규칙은
// src/lib/bylaws.ts의 renderBylawsDocument와 반드시 같아야 합니다.
const BYLAWS_TREE_SCRIPT = `
  (function () {
    var root = document.getElementById("bylaws-tree");
    if (!root) return;
    var previewEl = document.getElementById("bylaws-preview");
    var hiddenInput = document.getElementById("bylaws-blocks-json");
    var initialEl = document.getElementById("bylaws-initial-blocks");
    var form = root.closest("form");

    // 미리보기는 본문 트리 옆에 나란히 붙는 비모달 사이드 패널입니다 — 열리면
    // 본문 편집 칸과 정확히 반반으로 나뉘고(.bylaws-editor-row.preview-open),
    // 컨테이너 자체도 그때만 넓어집니다(body.bylaws-wide). 좁은 화면에서는
    // CSS 미디어쿼리가 대신 전체화면 오버레이로 바꿔줍니다.
    var editorRow = document.getElementById("bylaws-editor-row");
    var previewPanel = document.getElementById("bylaws-preview-panel");
    var previewToggleBtn = document.getElementById("bylaws-preview-toggle");
    var previewCloseBtn = document.getElementById("bylaws-preview-close");
    function openPreview() {
      if (editorRow) editorRow.classList.add("preview-open");
      document.body.classList.add("bylaws-wide");
      if (previewPanel) previewPanel.setAttribute("aria-hidden", "false");
      if (previewToggleBtn) { previewToggleBtn.setAttribute("aria-expanded", "true"); previewToggleBtn.textContent = "닫기 ◀"; }
      renderPreviewPane();
    }
    function closePreview() {
      if (editorRow) editorRow.classList.remove("preview-open");
      document.body.classList.remove("bylaws-wide");
      if (previewPanel) previewPanel.setAttribute("aria-hidden", "true");
      if (previewToggleBtn) { previewToggleBtn.setAttribute("aria-expanded", "false"); previewToggleBtn.textContent = "미리보기 ▶"; }
    }
    function togglePreview() {
      if (editorRow && editorRow.classList.contains("preview-open")) closePreview();
      else openPreview();
    }
    if (previewToggleBtn) previewToggleBtn.addEventListener("click", togglePreview);
    if (previewCloseBtn) previewCloseBtn.addEventListener("click", closePreview);

    var TYPE_LABEL = {
      chapter: "장", article: "조", buchik: "부칙",
      clause: "항", item: "호", subitem: "목",
    };
    var PLACEHOLDER = {
      chapter: "장 제목 (예: 총칙)", article: "조 제목 (예: 명칭)",
      buchik: "부칙 표제 (예: 부칙)", clause: "항 내용", item: "호 내용", subitem: "목 내용",
    };
    var BODY_ELIGIBLE = { chapter: 1, buchik: 1, article: 1, clause: 1 };
    // 번호(제N장/제N조)가 이미 타입 이름을 담고 있는 경우엔 badge가 중복이라 뺍니다 —
    // 항(①②③...)/호(1.2.3...)/목(가.나.다...)은 번호만 봐서는 타입을 알 수 없어서 유지합니다.
    var HIDE_BADGE = { chapter: 1, article: 1, clause: 1 };
    var CHILD_TYPES = {
      root: ["chapter", "buchik", "article"],
      chapter: ["article"],
      buchik: ["clause"],
      article: ["clause"],
      clause: ["item"],
      item: ["subitem"],
      subitem: [],
    };
    var RANK = { chapter: 0, buchik: 0, article: 1, clause: 2, item: 3, subitem: 4 };
    // 삭제 표시는 실제로 쓰인 적이 없어서 뺐습니다. 본조신설(조 전체가 새로 생겼다는
    // 표시)은 항이 아니라 조 자신에게 붙는 거라 조에서만 고를 수 있게 합니다.
    var TAG_OPTIONS = { article: ["개정", "본조신설"], clause: ["개정", "신설"], item: ["개정", "신설"] };
    var CIRCLED = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];
    var SUBITEM_M = ["가","나","다","라","마","바","사","아","자","차","카","타","파","하"];

    var uid = 0;
    function nid() { uid += 1; return "bn" + uid; }
    function makeNode(type, text, body, tags) {
      return { id: nid(), type: type, text: text || "", children: [], body: body == null ? null : body, tags: tags || [], collapsed: false, label: "" };
    }

    // 문서 순서대로 평평한 blocks[]를 rank(장/부칙=0, 조=1, 항=2, 호=3, 목=4)로
    // 다시 트리로 복원합니다 — 원래 렌더러가 이 flat 순서를 해석하는 방식 그대로.
    function unflatten(blocks) {
      var out = [];
      var stack = [];
      blocks.forEach(function (b) {
        var n = makeNode(b.type, b.text, b.body, b.tags);
        var rank = RANK[b.type];
        if (rank === undefined) return;
        if (rank === 0) {
          out.push(n);
          stack = [{ node: n, rank: rank }];
          return;
        }
        while (stack.length && stack[stack.length - 1].rank >= rank) stack.pop();
        if (stack.length === 0) out.push(n);
        else stack[stack.length - 1].node.children.push(n);
        stack.push({ node: n, rank: rank });
      });
      return out;
    }

    function flatten(nodes, out) {
      out = out || [];
      nodes.forEach(function (n) {
        var block = { type: n.type, text: n.text };
        if (BODY_ELIGIBLE[n.type] && n.body) block.body = n.body;
        if (n.tags && n.tags.length > 0) block.tags = n.tags;
        out.push(block);
        flatten(n.children, out);
      });
      return out;
    }

    var rootNodes = [];
    try {
      rootNodes = unflatten(JSON.parse(initialEl ? initialEl.textContent : "[]"));
    } catch (e) {
      rootNodes = [];
    }
    var dragId = null;

    function locate(list, id) {
      for (var i = 0; i < list.length; i += 1) {
        if (list[i].id === id) return { list: list, index: i, node: list[i] };
        var found = locate(list[i].children, id);
        if (found) return found;
      }
      return null;
    }

    function numberTree(nodes) {
      var counters = [0, 0, 0, 0, 0];
      function resetBelow(level) {
        for (var i = Math.max(level, 1) + 1; i < counters.length; i += 1) counters[i] = 0;
      }
      function walk(list) {
        for (var i = 0; i < list.length; i += 1) {
          var n = list[i];
          switch (n.type) {
            case "chapter":
              counters[0] += 1; resetBelow(0);
              n.label = "제" + counters[0] + "장";
              break;
            case "buchik":
              counters[1] = 0; resetBelow(1);
              n.label = "부칙";
              break;
            case "article":
              counters[1] += 1; resetBelow(1);
              n.label = "제" + counters[1] + "조";
              break;
            case "clause":
              counters[2] += 1; resetBelow(2);
              n.label = counters[2] - 1 < CIRCLED.length ? CIRCLED[counters[2] - 1] : "(" + counters[2] + ")";
              break;
            case "item":
              counters[3] += 1; resetBelow(3);
              n.label = counters[3] + ".";
              break;
            case "subitem":
              counters[4] += 1;
              n.label = counters[4] - 1 < SUBITEM_M.length ? SUBITEM_M[counters[4] - 1] + "." : counters[4] + ")";
              break;
          }
          walk(n.children);
        }
      }
      walk(nodes);
    }

    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // <개정 N>처럼 태그가 몇 번째 개정을 가리키는지 명시하지 않으면(예전처럼 그냥
    // <개정>) 나중에 새 개정이 추가될 때마다 이미 써둔 모든 <개정> 태그가 전부
    // 최신 날짜로 슬쩍 바뀌어버립니다 — 그래서 삽입 시점에 "개정이력" 카드에
    // 실제로 입력된 날짜 중 하나를 직접 골라서 번호를 박아 넣습니다. 첫 행(제정)은
    // 개정/신설의 대상이 될 수 없어서 목록에서 뺍니다.
    function getAmendmentDates() {
      var inputs = document.querySelectorAll('#bylaws-revisions input[name="revDate[]"]');
      var out = [];
      for (var i = 0; i < inputs.length; i += 1) {
        if (i === 0) continue;
        var v = inputs[i].value.trim();
        if (v) out.push({ num: i + 1, date: v });
      }
      return out;
    }
    function renderTagMenuItems(nodeId, kinds, existingTags) {
      var amendments = getAmendmentDates();
      if (amendments.length === 0) {
        return '<p class="bylaws-tag-empty">먼저 위 "개정이력"에 개정일을 추가하세요</p>';
      }
      var used = {};
      (existingTags || []).forEach(function (t) { used[t.kind + ":" + t.num] = true; });
      var html = "";
      kinds.forEach(function (kind) {
        amendments.forEach(function (a) {
          if (used[kind + ":" + a.num]) return;
          html +=
            '<button type="button" class="bylaws-tag-option" role="menuitem" data-action="tag-add" data-id="' + nodeId + '" data-kind="' + kind + '" data-num="' + a.num + '">' +
            kind + " · " + esc(a.date) + "</button>";
        });
      });
      return html || '<p class="bylaws-tag-empty">이미 다 추가됐어요</p>';
    }

    function renderAddRow(parentId, type) {
      var kids = CHILD_TYPES[type] || [];
      if (kids.length === 0) return "";
      var buttons = kids.map(function (t) {
        return '<button type="button" class="bylaws-chip" data-action="add" data-parent="' + parentId + '" data-type="' + t + '">+ ' + TYPE_LABEL[t] + "</button>";
      }).join("");
      return '<div class="bylaws-add-row">' + buttons + "</div>";
    }

    function renderEditorNode(n) {
      var addRow = renderAddRow(n.id, n.type);
      var hasFoldableChildren = n.children.length > 0;
      var showBlock = hasFoldableChildren || addRow;

      var foldBtn = hasFoldableChildren
        ? '<button type="button" class="bylaws-fold-btn" data-action="fold" data-id="' + n.id + '" aria-label="' + (n.collapsed ? "펼치기" : "접기") + '" title="' + (n.collapsed ? "펼치기" : "접기") + '">' + (n.collapsed ? "▸" : "▾") + "</button>"
        : '<span class="bylaws-fold-spacer"></span>';

      var numHtml = n.label ? '<span class="bylaws-num">' + esc(n.label) + "</span>" : "";

      // 접기버튼/드래그손잡이/타입뱃지/번호 — 텍스트 칸 왼쪽에 오는, 노드마다 폭이
      // 들쭉날쭉한 부분(번호가 "①"냐 "제12조"냐에 따라 폭이 다름)입니다. 아래
      // 태그/본문 줄을 이 텍스트 칸 시작 위치에 맞추려고, 이 묶음을 그대로 한 번
      // 더(안 보이게) 찍어서 자리만 차지하게 합니다 — 라벨 길이가 얼마든 항상
      // 정확히 맞습니다(고정 픽셀값으로 대충 맞추는 대신).
      var gutterHtml =
        foldBtn +
        '<span class="bylaws-drag-handle" data-drag-handle draggable="true" aria-label="드래그해서 순서 변경" title="드래그해서 순서 변경">⠿</span>' +
        (HIDE_BADGE[n.type] ? "" : '<span class="bylaws-badge">' + TYPE_LABEL[n.type] + "</span>") +
        numHtml;
      var gutterSpacer = '<div class="bylaws-row-gutter" aria-hidden="true">' + gutterHtml + "</div>";

      // 태그는 텍스트 안에 글자로 박히는 게 아니라 이 노드에 딸린 메타데이터라,
      // 본문(body)처럼 카드 행 아래 별도 줄에 둡니다 — 텍스트 입력칸이 있는 줄에
      // 같이 끼워두면 줄바꿈이 지저분해집니다. 이미 붙은 태그는 뱃지로 보여주고
      // (각자 × 로 제거), "+ 태그"로 새로 추가합니다. 드롭다운 안(태그 · 날짜
      // 목록)은 열 때마다 개정이력 카드의 최신 입력값을 다시 읽어서 채웁니다
      // (renderTagMenuItems) — 여기서는 빈 채로 둡니다.
      var tagOptions = TAG_OPTIONS[n.type];
      var tagRow = "";
      if (tagOptions) {
        var tagBadgesHtml = (n.tags || [])
          .map(function (t, idx) {
            var date = dateForNum(t.num);
            var label = t.kind + (date ? " · " + date : "");
            return (
              '<span class="bylaws-tag-badge">' + esc(label) +
              '<button type="button" data-action="tag-remove" data-id="' + n.id + '" data-index="' + idx + '" aria-label="태그 제거" title="태그 제거">×</button></span>'
            );
          })
          .join("");
        var tagMenu =
          '<div class="bylaws-tag-menu">' +
          '<button type="button" class="bylaws-chip bylaws-tag-btn" data-action="tag-toggle" data-id="' + n.id + '" data-type="' + n.type + '" aria-haspopup="true" aria-expanded="false" title="개정/신설 표시 추가">+ 태그</button>' +
          '<div class="bylaws-tag-dropdown" role="menu"></div></div>';
        tagRow = '<div class="bylaws-tag-row">' + gutterSpacer + '<div class="bylaws-tag-row-content">' + tagBadgesHtml + tagMenu + "</div></div>";
      }

      // "+ 본문"도 텍스트 칸 옆이 아니라 이 줄에 둡니다 — 본문이 이미 있으면
      // 같은 자리에 그 본문 textarea가 대신 나옵니다.
      var bodyRow = "";
      if (BODY_ELIGIBLE[n.type]) {
        if (n.body === null || n.body === undefined) {
          bodyRow =
            '<div class="bylaws-body-row">' + gutterSpacer +
            '<button type="button" class="bylaws-chip bylaws-chip-ghost" data-action="body-add" data-id="' + n.id + '" aria-label="본문 추가" title="본문 추가">+ 본문</button>' +
            "</div>";
        } else {
          bodyRow =
            '<div class="bylaws-body-row">' + gutterSpacer +
            '<textarea class="bs-autosize" rows="1" data-body-id="' + n.id + '" placeholder="번호 없는 문단 (선택)">' + esc(n.body) + "</textarea>" +
            '<button type="button" class="bylaws-body-remove" data-action="body-remove" data-id="' + n.id + '" aria-label="본문 제거" title="본문 제거">×</button>' +
            "</div>";
        }
      }

      var cardHtml =
        '<div class="bylaws-node-card">' +
        '<div class="bylaws-node-row">' +
        gutterHtml +
        '<textarea class="bs-autosize" rows="1" data-text-id="' + n.id + '" placeholder="' + esc(PLACEHOLDER[n.type] || "") + '">' + esc(n.text) + "</textarea>" +
        '<span class="bylaws-node-actions"><button type="button" data-action="remove" data-id="' + n.id + '" aria-label="삭제" title="삭제">×</button></span>' +
        "</div>" +
        bodyRow +
        tagRow +
        "</div>";

      var childrenHtml = "";
      if (showBlock) {
        var wrapClass = "bylaws-children-wrap" + (n.collapsed ? " collapsed" : "");
        childrenHtml = '<div class="' + wrapClass + '"><div class="bylaws-node-children">' + n.children.map(renderEditorNode).join("") + addRow + "</div></div>";
      }

      return '<div class="bylaws-node" data-node-id="' + n.id + '">' + cardHtml + childrenHtml + "</div>";
    }

    function renderEditorPane() {
      var rootAdd = renderAddRow("root", "root");
      root.innerHTML = '<div class="bylaws-node-children root">' + rootNodes.map(renderEditorNode).join("") + rootAdd + "</div>";
    }

    function bodyPreviewHtml(n) {
      if (!BODY_ELIGIBLE[n.type] || !n.body) return "";
      return '<div class="bylaws-body"><span class="bylaws-ptext">' + esc(n.body) + "</span></div>";
    }

    // 개정이력 카드에 실제로 입력된 값 기준으로, num(1-based)번째 날짜를 읽어옵니다.
    function dateForNum(num) {
      var inputs = document.querySelectorAll('#bylaws-revisions input[name="revDate[]"]');
      var input = inputs[num - 1];
      return input ? input.value.trim() : "";
    }
    function tagsPreviewHtml(n) {
      if (!n.tags || n.tags.length === 0) return "";
      var out = "";
      n.tags.forEach(function (t) {
        var date = dateForNum(t.num);
        if (!date) return;
        var text = t.kind === "본조신설" ? "[" + t.kind + " " + date + "]" : "<" + t.kind + " " + date + ">";
        out += ' <span class="bylaws-tag">' + esc(text) + "</span>";
      });
      return out;
    }

    function renderPreviewNode(n) {
      var html = "";
      var tagsHtml = tagsPreviewHtml(n);
      switch (n.type) {
        case "chapter":
          html = '<div class="bylaws-chapter">' + esc(n.label + " " + (n.text || "(제목 없음)")) + tagsHtml + "</div>";
          break;
        case "buchik":
          html = '<div class="bylaws-buchik">' + esc(n.text || "부칙") + tagsHtml + "</div>";
          break;
        case "article":
          html = n.text
            ? '<div class="bylaws-article">' + esc(n.label + "(" + n.text + ")") + tagsHtml + "</div>"
            : '<div class="bylaws-article placeholder">' + esc(n.label + "(제목 없음)") + tagsHtml + "</div>";
          break;
        case "clause":
          html = '<div class="bylaws-clause"><span class="bylaws-marker">' + esc(n.label) + '</span><span class="bylaws-ptext' + (n.text ? "" : " placeholder") + '">' + (n.text ? esc(n.text) : "내용 없음") + tagsHtml + "</span></div>";
          break;
        case "item":
          html = '<div class="bylaws-item"><span class="bylaws-marker">' + esc(n.label) + '</span><span class="bylaws-ptext' + (n.text ? "" : " placeholder") + '">' + (n.text ? esc(n.text) : "내용 없음") + tagsHtml + "</span></div>";
          break;
        case "subitem":
          html = '<div class="bylaws-subitem"><span class="bylaws-marker">' + esc(n.label) + '</span><span class="bylaws-ptext' + (n.text ? "" : " placeholder") + '">' + (n.text ? esc(n.text) : "내용 없음") + "</span></div>";
          break;
      }
      return html + bodyPreviewHtml(n) + n.children.map(renderPreviewNode).join("");
    }

    function renderPreviewPane() {
      if (!previewEl) return;
      if (rootNodes.length === 0) {
        previewEl.innerHTML = '<div class="bylaws-preview-empty">왼쪽에서 장·조를 추가해보세요.</div>';
        return;
      }
      var titleInput = form ? form.querySelector('[name="title"]') : null;
      var title = titleInput && titleInput.value ? titleInput.value : "RUN 회칙";
      var body = rootNodes.map(renderPreviewNode).join("");
      previewEl.innerHTML = '<div class="bylaws-preview"><div class="bylaws-title">' + esc(title) + "</div>" + body + "</div>";
    }

    function autosize(ta) {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
    function autosizeAll() {
      var list = root.querySelectorAll("textarea");
      for (var i = 0; i < list.length; i += 1) autosize(list[i]);
    }

    function fullRender() {
      numberTree(rootNodes);
      renderEditorPane();
      renderPreviewPane();
      autosizeAll();
    }

    function clearDropIndicators() {
      var els = root.querySelectorAll(".drop-before, .drop-after");
      for (var i = 0; i < els.length; i += 1) els[i].classList.remove("drop-before", "drop-after");
    }

    root.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-action]");
      if (!btn) return;
      var action = btn.dataset.action;

      if (action === "add") {
        var parentId = btn.dataset.parent;
        var type = btn.dataset.type;
        var n = makeNode(type, "", null);
        if (parentId === "root") {
          rootNodes.push(n);
        } else {
          var loc = locate(rootNodes, parentId);
          if (loc) loc.node.children.push(n);
        }
        fullRender();
        requestAnimationFrame(function () {
          var ta = root.querySelector('textarea[data-text-id="' + n.id + '"]');
          if (ta) ta.focus();
        });
      } else if (action === "remove") {
        var locR = locate(rootNodes, btn.dataset.id);
        if (locR) locR.list.splice(locR.index, 1);
        fullRender();
      } else if (action === "fold") {
        var locF = locate(rootNodes, btn.dataset.id);
        if (!locF) return;
        locF.node.collapsed = !locF.node.collapsed;
        var nodeEl = btn.closest(".bylaws-node");
        var wrap = nodeEl ? nodeEl.querySelector(".bylaws-children-wrap") : null;
        if (wrap) wrap.classList.toggle("collapsed", locF.node.collapsed);
        var label = locF.node.collapsed ? "펼치기" : "접기";
        btn.textContent = locF.node.collapsed ? "▸" : "▾";
        btn.setAttribute("aria-label", label);
        btn.title = label;
      } else if (action === "body-add") {
        var locB = locate(rootNodes, btn.dataset.id);
        if (locB) locB.node.body = "";
        fullRender();
        requestAnimationFrame(function () {
          var ta = root.querySelector('textarea[data-body-id="' + btn.dataset.id + '"]');
          if (ta) ta.focus();
        });
      } else if (action === "body-remove") {
        var locBR = locate(rootNodes, btn.dataset.id);
        if (locBR) locBR.node.body = null;
        fullRender();
      } else if (action === "tag-toggle") {
        var menu = btn.closest(".bylaws-tag-menu");
        if (!menu) return;
        var wasOpen = menu.classList.contains("open");
        root.querySelectorAll(".bylaws-tag-menu.open").forEach(function (m) {
          m.classList.remove("open");
          var toggleBtn = m.querySelector('[data-action="tag-toggle"]');
          if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
        });
        if (!wasOpen) {
          var locG = locate(rootNodes, btn.dataset.id);
          var dropdown = menu.querySelector(".bylaws-tag-dropdown");
          if (dropdown) dropdown.innerHTML = renderTagMenuItems(btn.dataset.id, TAG_OPTIONS[btn.dataset.type] || [], locG ? locG.node.tags : []);
          menu.classList.add("open");
          btn.setAttribute("aria-expanded", "true");
        }
      } else if (action === "tag-add") {
        var locTA = locate(rootNodes, btn.dataset.id);
        if (locTA) {
          locTA.node.tags = locTA.node.tags || [];
          locTA.node.tags.push({ kind: btn.dataset.kind, num: Number(btn.dataset.num) });
        }
        fullRender();
      } else if (action === "tag-remove") {
        var locTR = locate(rootNodes, btn.dataset.id);
        if (locTR && locTR.node.tags) locTR.node.tags.splice(Number(btn.dataset.index), 1);
        fullRender();
      }
    });

    // 태그 메뉴 바깥을 클릭하면 열려있는 메뉴를 닫습니다.
    document.addEventListener("click", function (e) {
      if (e.target.closest(".bylaws-tag-menu")) return;
      root.querySelectorAll(".bylaws-tag-menu.open").forEach(function (m) {
        m.classList.remove("open");
        var toggleBtn = m.querySelector('[data-action="tag-toggle"]');
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
      });
    });

    root.addEventListener("input", function (e) {
      var taText = e.target.closest("textarea[data-text-id]");
      if (taText) {
        var loc = locate(rootNodes, taText.dataset.textId);
        if (loc) loc.node.text = taText.value;
        autosize(taText);
        renderPreviewPane();
        return;
      }
      var taBody = e.target.closest("textarea[data-body-id]");
      if (taBody) {
        var locBody = locate(rootNodes, taBody.dataset.bodyId);
        if (locBody) locBody.node.body = taBody.value;
        autosize(taBody);
        renderPreviewPane();
      }
    });

    root.addEventListener("dragstart", function (e) {
      var handle = e.target.closest("[data-drag-handle]");
      if (!handle) { e.preventDefault(); return; }
      var nodeEl = handle.closest(".bylaws-node");
      if (!nodeEl) { e.preventDefault(); return; }
      dragId = nodeEl.dataset.nodeId;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
      nodeEl.classList.add("dragging");
    });

    root.addEventListener("dragend", function () {
      var el = root.querySelector(".bylaws-node.dragging");
      if (el) el.classList.remove("dragging");
      clearDropIndicators();
      dragId = null;
    });

    root.addEventListener("dragover", function (e) {
      if (!dragId) return;
      var rowEl = e.target.closest(".bylaws-node-row");
      if (!rowEl) return;
      var nodeEl = rowEl.closest(".bylaws-node");
      var targetId = nodeEl.dataset.nodeId;
      if (targetId === dragId) return;
      var dragLoc = locate(rootNodes, dragId);
      var targetLoc = locate(rootNodes, targetId);
      if (!dragLoc || !targetLoc || dragLoc.list !== targetLoc.list) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      clearDropIndicators();
      var rect = rowEl.getBoundingClientRect();
      var before = e.clientY - rect.top < rect.height / 2;
      rowEl.classList.add(before ? "drop-before" : "drop-after");
    });

    root.addEventListener("drop", function (e) {
      if (!dragId) return;
      var rowEl = e.target.closest(".bylaws-node-row");
      if (!rowEl) { clearDropIndicators(); return; }
      var nodeEl = rowEl.closest(".bylaws-node");
      var targetId = nodeEl.dataset.nodeId;
      var dragLoc = locate(rootNodes, dragId);
      var targetLoc = locate(rootNodes, targetId);
      clearDropIndicators();
      if (!dragLoc || !targetLoc || dragLoc.list !== targetLoc.list || targetId === dragId) {
        dragId = null;
        return;
      }
      e.preventDefault();
      var rect = rowEl.getBoundingClientRect();
      var before = e.clientY - rect.top < rect.height / 2;
      var list = dragLoc.list;
      var draggedNode = list[dragLoc.index];
      list.splice(dragLoc.index, 1);
      var newTargetIndex = list.indexOf(targetLoc.node);
      var insertAt = before ? newTargetIndex : newTargetIndex + 1;
      list.splice(insertAt, 0, draggedNode);
      dragId = null;
      fullRender();
    });

    if (form) {
      form.addEventListener("submit", function () {
        if (hiddenInput) hiddenInput.value = JSON.stringify(flatten(rootNodes));
      });
    }
    var titleField = form ? form.querySelector('[name="title"]') : null;
    if (titleField) titleField.addEventListener("input", renderPreviewPane);

    fullRender();
  })();
`;

export type BylawsVersionFormData = {
  slug: string;
  title: string;
  versionLabel: string;
  effectiveDate: string;
  isPublished: boolean;
  revisionHistory: BylawsRevisionHistory;
  blocks: BylawsBlock[];
};

export function renderBylawsVersionForm(mode: "new" | "edit", data: BylawsVersionFormData, error?: string): string {
  const action = mode === "new" ? "/bylaws/new" : `/bylaws/${escapeHtml(data.slug)}/edit`;
  const revisionRows = (data.revisionHistory.length > 0 ? data.revisionHistory : [""]).map((date) => bylawsRevisionRow(date)).join("");
  // <script type="application/json">에 안전하게 심기 위해 "<"를 전부 이스케이프합니다
  // (JSON 문자열 안에 우연히 "</script>"가 들어가도 태그가 조기 종료되지 않게).
  const initialBlocksJson = JSON.stringify(data.blocks).replace(/</g, "\\u003c");

  return shell(
    mode === "new" ? "새 회칙 버전" : `회칙 수정 — ${data.versionLabel}`,
    "bylaws",
    `
    <p class="bs-eyebrow">Backstage · 회칙</p>
    <h1>${mode === "new" ? "새 회칙 버전 추가" : "회칙 버전 수정"}</h1>
    <p class="bs-note">⚠️ 이 탭은 수정이 필요함</p>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
    <form class="bs-form" method="post" action="${action}">
      <div class="bs-card">
        <p class="bs-card-title">기본 정보</p>
        <div class="bs-field">
          <label>slug (URL에 쓰임, 영문 소문자/숫자/하이픈 — 예: 2017-founding)</label>
          <input type="text" name="slug" value="${escapeHtml(data.slug)}" pattern="[a-z0-9-]+" required ${mode === "edit" ? "readonly" : ""} />
        </div>
        <div class="bs-row2" style="margin-top:18px">
          <div class="bs-field">
            <label>제목 (문서 맨 위, 예: RUN 회칙)</label>
            <input type="text" name="title" value="${escapeHtml(data.title)}" required />
          </div>
          <div class="bs-field">
            <label>버전 이름 (목록에 표시 — 예: 2017년 제정, 현행(2026년 개정))</label>
            <input type="text" name="versionLabel" value="${escapeHtml(data.versionLabel)}" required />
          </div>
        </div>
        <div class="bs-row2" style="margin-top:18px">
          <div class="bs-field">
            <label>시행일</label>
            <input type="date" name="effectiveDate" value="${escapeHtml(data.effectiveDate)}" required />
          </div>
          <div class="bs-field bs-check" style="align-self:end;flex-direction:row;">
            <input type="checkbox" id="isPublished" name="isPublished" ${data.isPublished ? "checked" : ""} />
            <label for="isPublished" style="margin:0;">게시 (체크 해제 시 초안으로 저장, kaist.run에 안 보임)</label>
          </div>
        </div>
        <p class="bs-note" style="margin-top:8px">게시된 버전들 중 시행일이 가장 최신인 게 kaist.run/ko/bylaws에 표시됩니다.</p>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">개정이력 (문서 상단에 우측 정렬로 표시)</p>
        <div class="bs-rows" id="bylaws-revisions">${revisionRows}</div>
        <button type="button" class="bs-add-row" data-rows="bylaws-revisions" data-template="bylaws-revision-template">+ 추가</button>
        <template id="bylaws-revision-template">${bylawsRevisionRow("")}</template>
        <p class="bs-note" style="margin-top:8px">날짜만 입력하면 됩니다 — 첫 번째는 항상 "제정", 그 다음부터는 항상
        "일부개정"이라 자동으로 표시돼요. 여기 추가한 날짜는 아래 본문의 조/항 "+ 태그"에서 골라 쓸 수 있고,
        고르면 그 조/항에 "개정 · 2026. 08. 07."처럼 뱃지로 따로 붙습니다(본문 텍스트에 글자로 섞여 들어가지
        않아요) — 몇 번째 개정인지가 뱃지에 박혀서 나중에 개정이 하나 더 늘어도 날짜가 안 바뀝니다.</p>
      </div>

      <div class="bylaws-editor-row" id="bylaws-editor-row">
        <div class="bs-card bylaws-editor-col">
          <div class="bylaws-card-header">
            <p class="bs-card-title">본문</p>
            <span class="bylaws-card-header-actions">
              <button type="button" class="bylaws-preview-toggle" id="bylaws-preview-toggle" aria-expanded="false">미리보기 ▶</button>
              <button type="submit" class="bs-submit">저장</button>
            </span>
          </div>
          <p class="bs-note" style="margin-bottom:12px">
            "+" 버튼으로 어디에 추가하는지가 곧 위계입니다 — 타입을 고르거나 순서를 옮길 필요 없이,
            이 조 아래에 항을 추가하면 그게 몇 번째 항인지도 자동으로 정해집니다. 순서를 바꾸려면
            ⠿ 손잡이를 드래그하세요. 본문(번호 없는 문단)은 장/부칙/조/항 자신에게 선택적으로 붙습니다.
          </p>
          <div id="bylaws-tree"></div>
          <script type="application/json" id="bylaws-initial-blocks">${initialBlocksJson}</script>
          <input type="hidden" name="blocksJson" id="bylaws-blocks-json" />
        </div>

        <aside class="bylaws-preview-col" id="bylaws-preview-panel" aria-hidden="true">
          <div class="bs-card bylaws-preview-card">
            <div class="bylaws-preview-panel-header">
              <p class="bs-card-title" style="margin:0">미리보기</p>
              <button type="button" class="bylaws-preview-close" id="bylaws-preview-close" aria-label="미리보기 닫기" title="닫기">◀ 닫기</button>
            </div>
            <div class="bylaws-preview-wrap"><div id="bylaws-preview"></div></div>
          </div>
        </aside>
      </div>

      <script>${BS_ROWS_SCRIPT}</script>
      <script>${BYLAWS_TREE_SCRIPT}</script>

      <div class="bs-actions">
        <button type="submit" class="bs-submit">저장</button>
        <a href="/bylaws" class="bs-cancel">취소</a>
      </div>
    </form>
    ${
      mode === "edit"
        ? `<div class="bs-danger-zone">
            <form method="post" action="/bylaws/${escapeHtml(data.slug)}/delete" onsubmit="return confirm('정말 이 버전을 삭제할까요?')">
              <button type="submit" class="bs-danger">이 버전 삭제</button>
            </form>
          </div>`
        : ""
    }
  `,
  );
}

// ---------- apply form ----------
// 문항/선택지 목록은 구글 폼에서 그대로 가져온 고정 집합이라(관리자가 여기서
// 추가/삭제하지 않음), 아카이브 폼의 <template> 복제 방식과 달리 add/remove UI가
// 필요 없습니다 — 필드 개수가 고정이라 훨씬 단순합니다.

const APPLY_TYPE_LABELS: Record<ApplyFormQuestion["type"], string> = {
  short_answer: "단답형",
  paragraph: "장문형",
  radio: "단일선택",
  checkbox: "체크박스",
  dropdown: "드롭다운",
};

// 저장 버튼을 기본 비활성화해두고, 라벨 입력이 하나라도 비면 계속 비활성 상태를
// 유지합니다(모든 required 필드가 채워져야 form.checkValidity()가 true가 됨) —
// 지금의 React /apply 페이지가 하는 것과 같은 방식을 여기선 순수 JS로 재현합니다.
const APPLY_FORM_VALIDITY_SCRIPT = `
  (function () {
    var form = document.getElementById("apply-form");
    var btn = document.getElementById("apply-save");
    if (!form || !btn) return;
    function update() { btn.disabled = !form.checkValidity(); }
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
  })();
`;

function renderApplyQuestion(q: ApplyFormQuestion): string {
  const hasChoices = q.type === "radio" || q.type === "checkbox" || q.type === "dropdown";

  const validationField =
    q.type === "short_answer" || q.type === "paragraph"
      ? `<div class="bs-field" style="margin-top:12px;">
          <label>검증 정규식 (선택)</label>
          <input type="text" name="validationPattern__${escapeHtml(q.entryId)}" value="${escapeHtml(q.validationPattern)}" placeholder="예: ^[^\\s@]+@kaist\\.ac\\.kr$" />
          <span class="hint">비워두면 검증 안 함. 입력하면 이 정규식과 안 맞는 값은 제출이 막힙니다.</span>
        </div>`
      : "";

  const choicesHtml = hasChoices
    ? `<div class="bs-rows" style="margin-top:12px;">
        <div class="bs-row-item" style="opacity:.5;font-size:.75rem;">
          <span style="flex:0 0 160px;padding-left:10px;box-sizing:border-box;">제출 값(고정)</span><span style="flex:1;min-width:0;padding-left:10px;box-sizing:border-box;">한국어 라벨</span><span style="flex:1;min-width:0;padding-left:10px;box-sizing:border-box;">영어 라벨</span>
        </div>
        ${q.choices
          .map(
            (choice, i) => `<div class="bs-row-item">
              <input type="text" value="${escapeHtml(choice.value)}" readonly style="flex:0 0 160px;" />
              <input type="text" name="choiceKo__${escapeHtml(q.entryId)}__${i}" value="${escapeHtml(choice.labelKo)}" placeholder="${escapeHtml(choice.sourceLabel)}" required />
              <input type="text" name="choiceEn__${escapeHtml(q.entryId)}__${i}" value="${escapeHtml(choice.labelEn)}" placeholder="${escapeHtml(choice.sourceLabel)}" required />
            </div>`,
          )
          .join("")}
      </div>`
    : "";

  return `<div class="bs-card">
    <p class="bs-card-title">${q.position}. ${APPLY_TYPE_LABELS[q.type]}${q.required ? "" : " · 선택 문항"}</p>
    <p class="bs-note">구글 폼 원문: ${escapeHtml(q.sourceTitle)}</p>
    <div class="bs-row2" style="margin-top:10px;">
      <div class="bs-field">
        <label>질문 (한국어)</label>
        <textarea class="bs-autosize" name="labelKo__${escapeHtml(q.entryId)}" rows="2" placeholder="${escapeHtml(q.sourceTitle)}" required oninput="this.style.height='';this.style.height=this.scrollHeight+'px'">${escapeHtml(q.labelKo)}</textarea>
      </div>
      <div class="bs-field">
        <label>질문 (영어)</label>
        <textarea class="bs-autosize" name="labelEn__${escapeHtml(q.entryId)}" rows="2" placeholder="${escapeHtml(q.sourceTitle)}" required oninput="this.style.height='';this.style.height=this.scrollHeight+'px'">${escapeHtml(q.labelEn)}</textarea>
      </div>
    </div>
    ${validationField}
    ${choicesHtml}
  </div>`;
}

export type ApplyFormPageOptions = {
  summary?: ConnectResult;
  error?: string;
  saved?: boolean;
};

export function renderApplyFormPage(config: ApplyFormConfig | null, options: ApplyFormPageOptions = {}): string {
  const { summary, error, saved } = options;

  const connectSection = `<div class="bs-card">
    <p class="bs-card-title">구글 폼 연결</p>
    ${
      config && config.formId
        ? `<p class="bs-note">현재 연결된 폼: <code>${escapeHtml(config.formId)}</code> ·
            <a href="https://docs.google.com/forms/d/e/${escapeHtml(config.formId)}/viewform" target="_blank" rel="noopener">원본 보기</a></p>`
        : `<p class="bs-note">아직 연결된 폼이 없습니다.</p>`
    }
    <form method="post" action="/apply/connect" style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:nowrap;">
      <input
        type="text" name="formUrl" required
        placeholder="구글 폼 링크 또는 ID (응답자용 .../forms/d/e/…/viewform)"
        style="flex:1 1 auto;min-width:0;font:inherit;padding:10px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.04);color:inherit;"
      />
      <button type="submit" class="bs-submit bs-icon-btn" aria-label="연결">${LINK_ICON_SVG}</button>
    </form>
    ${
      summary
        ? `<p class="bs-note" style="margin-top:10px;color:var(--logo-primary);font-weight:700;">
            완료 — 문항 ${summary.total}개(추가 ${summary.added}개, 삭제 ${summary.removed}개${summary.skipped ? `, 미지원 유형 ${summary.skipped}개 건너뜀` : ""})
            ${summary.choicesAdded || summary.choicesRemoved ? ` · 선택지 추가 ${summary.choicesAdded}개, 삭제 ${summary.choicesRemoved}개` : ""}
            ${summary.added || summary.choicesAdded ? " — 새로 생긴 문항/선택지는 라벨을 채우고 아래에서 저장해야 실제 지원 폼에 반영됩니다." : ""}
          </p>`
        : ""
    }
  </div>`;

  const header = `
    <p class="bs-eyebrow">Backstage</p>
    <h1>지원 폼</h1>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
    ${saved ? `<p class="bs-note" style="color:var(--logo-primary);font-weight:700;">저장되었습니다 — 잠시 후 사이트에 반영됩니다.</p>` : ""}
    ${connectSection}
  `;

  if (!config || config.questions.length === 0) {
    return shell("지원 폼 편집", "apply", `${header}<p class="empty">아직 문항이 없습니다. 위에서 구글 폼을 연결해 주세요.</p>`);
  }

  const questionsHtml = config.questions.map(renderApplyQuestion).join("\n");

  return shell(
    "지원 폼 편집",
    "apply",
    `
    ${header}
    <form class="bs-form" id="apply-form" method="post" action="/apply">
      ${questionsHtml}
      <div class="bs-actions bs-actions-end">
        <button type="submit" class="bs-submit" id="apply-save" disabled>저장</button>
      </div>
    </form>
    <script>
      document.querySelectorAll("textarea.bs-autosize").forEach((el) => {
        el.style.height = el.scrollHeight + "px";
      });
    </script>
    <script>${APPLY_FORM_VALIDITY_SCRIPT}</script>
  `,
  );
}

// ---------- uploads ----------

function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderUploadRow(file: UploadedFile): string {
  const url = `/upload/${file.key}`;
  const isImage = file.contentType.startsWith("image/");
  const thumb = isImage
    ? `<img class="thumb" src="${escapeHtml(url)}" alt="" loading="lazy" />`
    : `<div class="file-icon">📄</div>`;

  return `<li>
    <a class="bs-upload-open" href="${escapeHtml(url)}" target="_blank" rel="noopener">
      ${thumb}
      <div class="info">
        <div class="name">${escapeHtml(file.key)}</div>
        <div class="meta">${formatFileBytes(file.size)} · ${escapeHtml(file.contentType)}</div>
      </div>
    </a>
    <input class="snippet" type="text" readonly value="${escapeHtml(url)}" onclick="this.select()" />
    <form method="post" action="/uploads/${encodeURIComponent(file.key)}/delete" onsubmit="return confirm('이 파일을 삭제할까요? 이미 글에 쓰인 곳이 있다면 깨질 수 있어요.')">
      <button type="submit" class="bs-danger bs-icon-btn" aria-label="삭제">${TRASH_ICON_SVG}</button>
    </form>
  </li>`;
}

export type UploadListPage = {
  q: string;
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  total: number;
};

function pagerLink(q: string, page: number, label: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 0) params.set("page", String(page));
  const qs = params.toString();
  return `<a href="/uploads${qs ? `?${qs}` : ""}">${label}</a>`;
}

export function renderUploadList(files: UploadedFile[], meta: UploadListPage, error?: string): string {
  const body =
    files.length === 0
      ? `<p class="empty">${meta.q ? "검색 결과가 없습니다." : "업로드된 파일이 없습니다."}</p>`
      : `<ul class="bs-upload-list">${files.map(renderUploadRow).join("\n")}</ul>`;

  const pager =
    meta.hasPrev || meta.hasNext
      ? `<div class="pager">
        ${meta.hasPrev ? pagerLink(meta.q, meta.page - 1, "← 이전") : `<span class="disabled">← 이전</span>`}
        <span>${meta.page + 1}페이지 · 총 ${meta.total}개</span>
        ${meta.hasNext ? pagerLink(meta.q, meta.page + 1, "다음 →") : `<span class="disabled">다음 →</span>`}
      </div>`
      : meta.total > 0
        ? `<p class="bs-note" style="margin-top:12px">총 ${meta.total}개</p>`
        : "";

  return shell(
    "업로드 관리",
    "uploads",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>업로드</h1>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
    <form class="bs-upload" method="post" action="/uploads" enctype="multipart/form-data">
      <input type="file" name="file" required />
      <input type="text" name="name" placeholder="파일 이름 (선택, 비우면 원본 이름 사용)" />
      <button type="submit" class="bs-submit bs-icon-btn" aria-label="업로드">${UPLOAD_ICON_SVG}</button>
    </form>
    <form class="bs-search" method="get" action="/uploads">
      <input type="text" name="q" value="${escapeHtml(meta.q)}" placeholder="파일명 검색" />
      <button type="submit" class="bs-cancel-btn bs-icon-btn" aria-label="검색">${SEARCH_ICON_SVG}</button>
      ${meta.q ? `<a href="/uploads" class="bs-cancel">지우기</a>` : ""}
    </form>
    ${body}
    ${pager}
  `,
  );
}

// ---------- RUNFORCE ----------
// 활동회원의 Codeforces/AtCoder 대회 성적을 상대평가해 포인트로 매기는 기능
// (worker/src/lib/runforce.ts). "대상 대회"(설정+목록, 대회별 상세는 여기서 링크로
// drill-down)와 "리더보드" 2개 pill로 나눕니다 — members처럼 항상 떠 있는 하위탭이
// 아니라, 학기별 명단→개별 학기 상세와 같은 관계로 대회 상세 페이지는 뒤로가기
// 링크만 둡니다.

const PLATFORM_LABEL: Record<RunforcePlatform, string> = { codeforces: "Codeforces", atcoder: "AtCoder" };

// "3번째 개최 · ×1.103 · 만점 330.750" — 지금 등록된 대회들을 개최 순서로 줄 세웠을 때
// 몇 번째인지와 그에 따른 가중치/만점. 만점은 점수 표시와 같은 단위(1000으로 나눈 값)로
// 보여줘야 표 안의 점수들과 바로 비교됩니다. 이 번호는 고정값이 아니라, 나중에 더 이른
// 대회가 등록되면 뒤로 밀립니다.
function runforceWeightLabel(weightIndex: number): string {
  const multiplier = runforceWeightMultiplier(weightIndex).toFixed(3);
  return `${weightIndex}번째 개최 · ×${multiplier} · 만점 ${formatRunforceDisplay(runforceMaxScoreFor(weightIndex))}`;
}

function runforceSubnav(active: "targets" | "leaderboard"): string {
  return `<div class="bs-subnav">
    <a href="/runforce"${active === "targets" ? ' class="active"' : ""}>대상 대회</a>
    <a href="/runforce/leaderboard"${active === "leaderboard" ? ' class="active"' : ""}>리더보드</a>
  </div>`;
}

// 짝 없는 일반 대회 행 — 짝지어진 행(runforceContestPairRow)과 완전히 별개 구조/클래스를
// 씁니다. 예전에 이 둘이 클래스를 공유했다가, 짝 쪽만 고치려던 CSS 변경이 일반 행에도
// 새 나가서 사고가 났던 적이 있어 이후로는 절대 안 섞습니다.
function runforceContestRow(contest: RunforceContestSummary): string {
  return `<li class="bs-runforce-list-item">
    <a class="bs-upload-open" href="/runforce/${encodeURIComponent(contest.id)}">
      <div class="info">
        <div class="name">[${PLATFORM_LABEL[contest.platform]}] ${escapeHtml(contest.contestName)}</div>
        <div class="meta">${escapeHtml(contest.contestId)} · ${contest.source === "manual" ? "수동" : "자동"} · ${escapeHtml(formatKstDateTime(contest.startTimeMs))} · 참가대상 ${contest.participantCount}명 · ${runforceWeightLabel(contest.weightIndex)}</div>
      </div>
    </a>
    <form method="post" action="/runforce/${encodeURIComponent(contest.id)}/delete" onsubmit="return confirm('이 대회를 산정 대상에서 삭제할까요? 다시 추가하면 동점 처리 결과가 새로 섞입니다.')">
      <button type="submit" class="bs-danger bs-icon-btn" aria-label="삭제">${TRASH_ICON_SVG}</button>
    </form>
  </li>`;
}

// "Codeforces Round 1112 (Div. 1)" → "Codeforces Round 1112" — 짝 요약 줄 제목에서는
// division 표시가 중복이라(아래 메타줄에 이미 "Div1+Div2 짝"이 있음) 떼어냅니다.
function stripDivisionSuffix(name: string): string {
  return name.replace(/\s*\(div\.?\s*[12]\)\s*$/i, "").trim();
}

// 짝지어진 대회를 펼쳤을 때 나오는 두 줄 — 제목은 이미 요약 줄에 나와 있으므로 여기서는
// 전체 이름을 반복하지 않고 "• Div. 1"/"• Div. 2" 점 표기만 씁니다. 클릭도 안 되고(상세
// 페이지 개념이 없음) 삭제 버튼만 각자 있습니다.
function runforceContestPairSubRow(contest: RunforceContestSummary, label: string): string {
  return `<div class="bs-runforce-pair-subrow">
    <div class="bs-upload-open-static">
      <div class="info">
        <div class="name"><span class="bs-runforce-dot">•</span>${label}</div>
        <div class="meta">${escapeHtml(contest.contestId)} · ${contest.source === "manual" ? "수동" : "자동"} · 참가대상 ${contest.participantCount}명 · ${runforceWeightLabel(contest.weightIndex)}</div>
      </div>
    </div>
    <form method="post" action="/runforce/${encodeURIComponent(contest.id)}/delete" onsubmit="return confirm('${label} 쪽을 산정 대상에서 삭제할까요? 다시 추가하면 동점 처리 결과가 새로 섞입니다.')">
      <button type="submit" class="bs-danger bs-icon-btn" aria-label="삭제">${TRASH_ICON_SVG}</button>
    </form>
  </div>`;
}

// Div1/Div2로 짝지어진 대회는 한 라운드를 반으로 쪼갠 것뿐이라, 목록에서 평소엔 한 줄로
// 접혀 있다가(요약: division 표시 뗀 기본 이름, 아래 메타줄에 "Div. 1 + Div. 2 짝" 표시)
// 화살표 버튼을 누르면 점 표기 두 줄로 펼쳐집니다. 제목 자체는 진짜 링크라 눌러도 안
// 펼쳐지고 바로 그 대회(Div1+Div2 합쳐 보여주는) 상세 페이지로 이동합니다 — 펼치기는
// 화살표 버튼 전용(RUNFORCE_PAIR_TOGGLE_SCRIPT가 처리).
function runforceContestPairRow(div1: RunforceContestSummary, div2: RunforceContestSummary): string {
  return `<li class="bs-runforce-pair bs-runforce-list-item">
    <div class="bs-runforce-pair-summary">
      <a class="bs-upload-open" href="/runforce/${encodeURIComponent(div1.id)}">
        <div class="info">
          <div class="name">[${PLATFORM_LABEL[div1.platform]}] ${escapeHtml(stripDivisionSuffix(div1.contestName))}</div>
          <div class="meta">${escapeHtml(formatKstDateTime(div1.startTimeMs))} · 참가대상 ${div1.participantCount}명 · ${runforceWeightLabel(div1.weightIndex)}</div>
        </div>
      </a>
      <button type="button" class="bs-runforce-pair-toggle" aria-label="펼치기" aria-expanded="false">▾</button>
    </div>
    <div class="bs-runforce-pair-body" hidden>
      ${runforceContestPairSubRow(div1, "Div. 1")}
      ${runforceContestPairSubRow(div2, "Div. 2")}
    </div>
  </li>`;
}

const RUNFORCE_PAIR_TOGGLE_SCRIPT = `
  document.querySelectorAll(".bs-runforce-pair-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var li = btn.closest(".bs-runforce-pair");
      var body = li.querySelector(".bs-runforce-pair-body");
      var isOpen = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", isOpen ? "false" : "true");
      if (isOpen) body.setAttribute("hidden", ""); else body.removeAttribute("hidden");
    });
  });
`;

function renderRunforceContestGroup(group: ContestGroup): string {
  return "single" in group ? runforceContestRow(group.single) : runforceContestPairRow(group.div1, group.div2);
}

function runforceAtCoderPendingRow(entry: AtCoderPendingEntry): string {
  return `<li>
    <div class="info">
      <div class="name">[AtCoder] ${escapeHtml(entry.contestId)}</div>
      <div class="meta">
        ${entry.source === "manual" ? "수동" : "자동"}
        ${entry.addedByName ? ` · ${escapeHtml(entry.addedByName)}` : ""}
        · ${escapeHtml(formatKstDateTime(new Date(entry.requestedAt.replace(" ", "T") + "Z").getTime()))} 요청
      </div>
    </div>
  </li>`;
}

function runforceDiscoveryQueueRow(entry: RunforceDiscoveryQueueEntry): string {
  return `<li>
    <div class="info">
      <div class="name">[${PLATFORM_LABEL[entry.platform]}] ${escapeHtml(entry.contestName)}</div>
      <div class="meta">
        ${escapeHtml(entry.contestId)} · ${escapeHtml(formatKstDateTime(entry.startTimeMs))} ·
        ${escapeHtml(formatKstDateTime(new Date(entry.queuedAt.replace(" ", "T") + "Z").getTime()))} 큐 등록
      </div>
    </div>
  </li>`;
}

export function renderRunforceSettings(
  config: RunforceConfig,
  contests: RunforceContestSummary[],
  error?: string,
  atcoderPending: AtCoderPendingEntry[] = [],
  discoveryQueue: RunforceDiscoveryQueueEntry[] = [],
): string {
  const groups = groupContests(contests);
  const list =
    groups.length === 0
      ? `<p class="empty">등록된 대회가 없습니다. 아래에서 수동으로 추가하거나, 자동 탐색을 켜주세요.</p>`
      : `<ul class="bs-upload-list">${groups.map(renderRunforceContestGroup).join("\n")}</ul>`;

  const pendingCard =
    atcoderPending.length === 0
      ? ""
      : `<div class="bs-card">
          <p class="bs-card-title">AtCoder 순위표 대기 중 (${atcoderPending.length})</p>
          <p class="bs-note" style="margin-bottom:12px">
            atcoder.jp 순위표를 이 Worker에서 직접 못 가져와서(도메인 전체 차단), runBot이 대신 가져와
            넘겨줄 때까지 대기 중인 대회들입니다. 봇이 순위표를 넘기면 자동으로 계산되어 위 목록에
            나타나고, 여기서는 사라집니다.
          </p>
          <ul class="bs-upload-list">${atcoderPending.map(runforceAtCoderPendingRow).join("\n")}</ul>
        </div>`;

  const queueCard =
    discoveryQueue.length === 0
      ? ""
      : `<details class="bs-card">
          <summary class="bs-card-title" style="cursor:pointer;">자동탐색 큐 (${discoveryQueue.length})</summary>
          <p class="bs-note" style="margin:12px 0">
            방금 목록에서 찾았지만 아직 계산 안 된 후보들입니다 — 1분마다 도는 크론이 오래된 순으로
            몇 개씩 꺼내 실제로 계산합니다(대회당 API 호출이 여러 번이라 한 번에 다 처리하진 않습니다).
            보통 몇 분 안에 다 빠집니다.
          </p>
          <ul class="bs-upload-list">${discoveryQueue.map(runforceDiscoveryQueueRow).join("\n")}</ul>
        </details>`;

  return shell(
    "RUNFORCE",
    "runforce",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>RUNFORCE</h1>
    ${runforceSubnav("targets")}
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}

    <div class="bs-card">
      <p class="bs-card-title">날짜범위 자동 탐색</p>
      <form method="post" action="/runforce/config" class="bs-row2">
        <div class="bs-field" style="grid-column:1/-1;">
          <label>현재 시즌 이름</label>
          <input type="text" name="seasonName" value="${escapeHtml(config.seasonName ?? "")}" placeholder="예: Beta Season (비우면 마이페이지에 안 보임)" />
          <span class="hint">마이페이지 RUNFORCE 카드에 이 이름과 아래 기간이 함께 표시됩니다. 집계에는 영향을 주지 않습니다.</span>
        </div>
        <div class="bs-field">
          <label>시작일</label>
          <input type="date" name="rangeStartDate" value="${escapeHtml(config.rangeStartDate ?? "")}" />
        </div>
        <div class="bs-field">
          <label>종료일</label>
          <input type="date" name="rangeEndDate" value="${escapeHtml(config.rangeEndDate ?? "")}" />
        </div>
        <div class="bs-field bs-check" style="flex-direction:row;grid-column:1/-1;justify-content:space-between;">
          <span style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="autoDiscoveryEnabled" name="autoDiscoveryEnabled" value="1" ${config.autoDiscoveryEnabled ? "checked" : ""} />
            <label for="autoDiscoveryEnabled" style="margin:0;">매시 정각마다 이 기간의 rated 대회를 자동으로 추가</label>
          </span>
          <button type="submit" class="bs-submit" style="margin:0;">저장</button>
        </div>
      </form>
      <p class="bs-note" style="margin-top:8px">
        저장하면 매시 정각 갱신을 기다리지 않고 바로 한 번 수집합니다(수집은 백그라운드로 돌아가니,
        잠시 뒤 새로고침하면 아래 목록에 반영됩니다). 이미 등록된 대회는 다시 계산되지 않고 —
        새로 열린 rated 대회만 추가됩니다. 기간은 최대 6개월까지 설정할 수 있습니다.
      </p>
    </div>

    <div class="bs-card">
      <p class="bs-card-title">대회 수동 추가</p>
      <form method="post" action="/runforce/contests/add" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <select
          name="platform"
          style="font:inherit;padding:10px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.04);color:inherit;"
        >
          <option value="codeforces">Codeforces</option>
          <option value="atcoder">AtCoder</option>
        </select>
        <input
          type="text" name="contestId" required
          placeholder="대회 ID (예: 1900, abc300)"
          style="flex:1 1 auto;min-width:0;font:inherit;padding:10px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.04);color:inherit;"
        />
        <button type="submit" class="bs-submit">추가</button>
      </form>
      <p class="bs-note" style="margin-top:8px">rated 대회만 추가할 수 있습니다 — 대회 종료 후 레이팅이 반영된 뒤 추가해 주세요.</p>
    </div>

    ${pendingCard}

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      ${renderCsvExportButton("csv-dialog-leaderboard", "/runforce/leaderboard/export.csv", "리더보드 CSV 다운로드", RUNFORCE_LEADERBOARD_EXPORT_COLUMNS)}
    </div>

    <p class="bs-card-title" style="margin-top:24px">산정 대상 대회 (${contests.length})</p>
    ${list}

    ${queueCard}

    <div class="bs-danger-zone">
      <p class="bs-card-title">전체 초기화</p>
      <p class="bs-note" style="margin-bottom:12px">
        등록된 대회와 계산된 결과를 전부 지웁니다. 자동 탐색 설정(위)은 그대로 유지되므로, 켜져 있다면
        다음 정각에 그 날짜범위 안의 대회들을 처음부터 다시 수집합니다. 되돌릴 수 없습니다.
      </p>
      <form method="post" action="/runforce/reset" onsubmit="return confirm('정말 RUNFORCE 대회를 전부 초기화할까요? 등록된 ${contests.length}개 대회와 계산된 모든 결과가 사라지고, 되돌릴 수 없습니다.')">
        <button type="submit" class="bs-danger">RUNFORCE 대회 전체 초기화</button>
      </form>
    </div>
    <script>${RUNFORCE_PAIR_TOGGLE_SCRIPT}</script>
  `,
  );
}

// Div1/Div2 페어링 상태를 보여주는 카드 — 짝이 있으면 어느 대회와 짝지어졌는지 +
// "실제 참가한 쪽 점수만 합산된다"는 규칙 설명 + 짝 해제 버튼. 짝이 없으면 수동으로
// 다른 대회와 짝지을 수 있는 폼을 보여줍니다. AtCoder 대회는 이 개념이 아예 없어서
// 카드를 안 보여주지만, Codeforces는 division이 아직 비어있어도(자동 판별이 실패했거나,
// 이 페어링 기능이 배포되기 전에 이미 등록된 대회라 division 컬럼이 안 채워진 경우)
// 카드를 보여줍니다 — 짝짓기 액션(POST .../pair)이 이름에서 다시 판별을 시도하므로
// 여기서 폼을 숨길 이유가 없습니다.
// 짝지어져 있을 때는 renderRunforceContestDetail이 이 카드 대신 두 결과표를 한
// 페이지에 나란히 보여주므로, 여기서는 "아직 안 짝지어진" 경우만 다룹니다.
function renderRunforceDivPairingCard(contest: RunforceContestDetail): string {
  if (contest.platform !== "codeforces" || contest.pairedContest) return "";

  const divNote = contest.division
    ? `이 대회는 이름에서 ${contest.division === "div1" ? "Div1" : "Div2"}로 판별됐지만 아직 짝지어진 대회가 없습니다.`
    : `이 대회는 이름에서 Div1/Div2가 자동으로 판별되지 않았습니다(자동 페어링은 시작 시각이
       정확히 같은 경우에만 동작하고, 이 대회가 이 기능이 추가되기 전에 등록됐다면 division이
       비어있을 수 있습니다).`;
  return `<div class="bs-card">
    <p class="bs-card-title">Div1/Div2 페어링</p>
    <p class="bs-note">
      ${divNote} 같은 라운드의 반대쪽 Division 대회가 이미 등록돼 있다면, 그 대회의 행 ID를
      입력해 수동으로 짝지을 수 있습니다(짝지을 때 이름에서 Division을 다시 판별합니다).
    </p>
    <form method="post" action="/runforce/${encodeURIComponent(contest.id)}/pair" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;">
      <input
        type="text" name="otherContestId" required
        placeholder="짝지을 대회의 행 ID"
        style="flex:1 1 auto;min-width:0;font:inherit;padding:10px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.04);color:inherit;"
      />
      <button type="submit" class="bs-submit">짝짓기</button>
    </form>
  </div>`;
}

function runforceResultsTable(rows: RunforceRankedRow[]): string {
  const trs = rows
    .map(
      (r) => `<tr>
        <td class="num">${r.finalRank + 1}</td>
        <td>${escapeHtml(r.name || "(이름 없음)")}</td>
        <td>${r.handle ? escapeHtml(r.handle) : `<span class="bs-note">미등록</span>`}</td>
        <td class="num">${r.platformRank ?? (r.isUnratedParticipant ? `<span class="bs-note">unrated 참가</span>` : "미참가")}</td>
        <td class="num">${formatRunforceDisplay(r.score)}</td>
      </tr>`,
    )
    .join("\n");
  return `<div class="bs-table-wrap">
    <table class="bs-table">
      <thead><tr><th>순위</th><th>이름</th><th>핸들</th><th>대회 원본 순위</th><th>RUNFORCE</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>`;
}

// 짝지어진 대회 하나(Div1 또는 Div2)의 결과표 섹션 — 제목/CSV/삭제 버튼까지 통째로,
// 한 페이지 안에 두 번(Div1용, Div2용) 나란히 씁니다.
function runforceContestSection(contest: RunforceContestDetail, label: string): string {
  return `<div class="bs-card">
    <div class="bylaws-card-header">
      <p class="bs-card-title">[${label}] ${escapeHtml(contest.contestName)}</p>
      ${renderCsvExportButton(`csv-dialog-${encodeURIComponent(contest.id)}`, `/runforce/${encodeURIComponent(contest.id)}/export.csv`, "CSV 다운로드", RUNFORCE_CONTEST_EXPORT_COLUMNS)}
    </div>
    <p class="bs-note" style="margin-bottom:12px">
      ${escapeHtml(contest.contestId)} · ${contest.source === "manual" ? "수동 등록" : "자동 등록"} · 참가대상 ${contest.participantCount}명 · ${runforceWeightLabel(contest.weightIndex)}
    </p>
    ${runforceResultsTable(contest.rows)}
    <form method="post" action="/runforce/${encodeURIComponent(contest.id)}/delete" onsubmit="return confirm('[${label}] ${escapeHtml(contest.contestName)}을(를) 산정 대상에서 삭제할까요? 다시 추가하면 동점 처리 결과가 새로 섞입니다.')" style="margin-top:12px;">
      <button type="submit" class="bs-danger">[${label}] 삭제</button>
    </form>
  </div>`;
}

export function renderRunforceContestDetail(
  contest: RunforceContestDetail,
  error?: string,
  pairedDetail?: RunforceContestDetail | null,
): string {
  // 짝지어진 대회면 상세 페이지끼리 넘나들 필요 없이, 두 결과표를 이 페이지 하나에
  // 같이 보여줍니다 — Div1이 항상 위, Div2가 아래(어느 쪽 링크로 들어왔든 순서 고정).
  if (pairedDetail) {
    const div1 = contest.division === "div1" ? contest : pairedDetail;
    const div2 = contest.division === "div1" ? pairedDetail : contest;
    return shell(
      `${contest.contestName} (Div1+Div2)`,
      "runforce",
      `
      <p class="bs-eyebrow">Backstage</p>
      <h1>[${PLATFORM_LABEL[contest.platform]}] Div1 + Div2</h1>
      ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
      <p class="bs-note" style="margin-bottom:16px">
        <a href="/runforce" class="bs-cancel">← 대상 대회 목록</a> · ${escapeHtml(formatKstDateTime(contest.startTimeMs))}
      </p>
      <p class="bs-note" style="margin-bottom:16px">
        리더보드/마이페이지 총점 계산 시, Div1에 실제로 참가한 회원은 Div1 점수를, 그 외(Div2 참가 또는
        둘 다 미참가)는 Div2 점수를 가져가서 한 번만 합산됩니다 — 아래 두 표는 각 대회 단독 계산 결과입니다.
      </p>
      <form method="post" action="/runforce/${encodeURIComponent(contest.id)}/unpair" onsubmit="return confirm('짝을 해제할까요? 해제해도 각 대회의 계산 결과 자체는 안 바뀌고, 합산 시 둘 다 따로 반영됩니다.')" style="margin-bottom:20px;">
        <button type="submit" class="bs-danger">짝 해제</button>
      </form>

      ${runforceContestSection(div1, "Div1")}
      ${runforceContestSection(div2, "Div2")}
    `,
    );
  }

  return shell(
    contest.contestName,
    "runforce",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>[${PLATFORM_LABEL[contest.platform]}] ${escapeHtml(contest.contestName)}</h1>
    ${error ? `<p class="bs-error">${escapeHtml(error)}</p>` : ""}
    <p class="bs-note" style="margin-bottom:16px">
      <a href="/runforce" class="bs-cancel">← 대상 대회 목록</a> ·
      ${escapeHtml(contest.contestId)} · ${escapeHtml(formatKstDateTime(contest.startTimeMs))} ·
      ${contest.source === "manual" ? "수동 등록" : "자동 등록"} · 참가대상 ${contest.participantCount}명 ·
      ${runforceWeightLabel(contest.weightIndex)}
    </p>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      ${renderCsvExportButton(`csv-dialog-${encodeURIComponent(contest.id)}`, `/runforce/${encodeURIComponent(contest.id)}/export.csv`, "CSV 다운로드", RUNFORCE_CONTEST_EXPORT_COLUMNS)}
    </div>

    ${renderRunforceDivPairingCard(contest)}

    ${runforceResultsTable(contest.rows)}

    <div class="bs-danger-zone">
      <form method="post" action="/runforce/${encodeURIComponent(contest.id)}/delete" onsubmit="return confirm('이 대회를 산정 대상에서 삭제할까요? 다시 추가하면 동점 처리 결과가 새로 섞입니다.')">
        <button type="submit" class="bs-danger">이 대회 삭제</button>
      </form>
    </div>
  `,
  );
}

export function renderRunforceLeaderboard(entries: RunforceLeaderboardEntry[]): string {
  // 총점이 같으면 순위도 같게(표준 경기 순위) — 동점자 다음 순위는 인원수만큼
  // 건너뜁니다(예: 공동 1위가 둘이면 다음은 3위). entries는 이미 totalScore DESC로
  // 정렬돼서 들어옵니다(getRunforceLeaderboard).
  let lastScore: number | null = null;
  let lastRank = 0;
  const ranks = entries.map((e, idx) => {
    if (lastScore === null || e.totalScore !== lastScore) {
      lastRank = idx + 1;
      lastScore = e.totalScore;
    }
    return lastRank;
  });

  const rows = entries
    .map(
      (e, idx) => `<tr>
        <td class="num center">${ranks[idx]}</td>
        <td class="center">${escapeHtml(e.name || "(이름 없음)")}</td>
        <td class="num center">${formatRunforceDisplay(e.totalScore)}</td>
        <td class="num center">${e.contestsCounted}</td>
      </tr>`,
    )
    .join("\n");

  return shell(
    "RUNFORCE 리더보드",
    "runforce",
    `
    <p class="bs-eyebrow">Backstage</p>
    <h1>RUNFORCE 리더보드</h1>
    ${runforceSubnav("leaderboard")}

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      ${renderCsvExportButton("csv-dialog-leaderboard", "/runforce/leaderboard/export.csv", "CSV 다운로드", RUNFORCE_LEADERBOARD_EXPORT_COLUMNS)}
    </div>

    ${
      entries.length === 0
        ? `<p class="empty">이번 학기 활동회원이 없습니다.</p>`
        : `<div class="bs-table-wrap">
      <table class="bs-table">
        <thead><tr><th class="center">순위</th><th class="center">이름</th><th class="center">총점</th><th class="center">참가 대회 수</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
    }
  `,
  );
}

// ---------- 이메일 (backstage 서브탭) ----------
// 실제 목록/상세 마크업(renderEmailListBody/renderEmailPageBody)은 emailRender.ts가
// 만듭니다 — kaist.run/email(메인 도메인 직접 접근, 기본 topbar)과 여기(backstage
// 메뉴가 있는 shell) 양쪽에서 같은 내용을 재사용하기 위함입니다.
export function renderBackstageEmailList(
  items: EmailIndexEntry[],
  info: EmailListPageInfo,
  noteStates: Map<string, EmailNoteState> = new Map(),
): string {
  return shell("받은 메일함", "email", `<p class="bs-eyebrow">Backstage</p>${renderEmailListBody(items, info, noteStates)}`);
}

export function renderBackstageEmailPage(id: string, email: Email, state: EmailNoteState): string {
  return shell(
    email.subject || "(제목 없음)",
    "email",
    `<p class="bs-eyebrow">Backstage</p>${renderEmailPageBody(id, email, state)}`,
  );
}

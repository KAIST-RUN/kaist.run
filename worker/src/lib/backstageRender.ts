import { page, escapeHtml, formatKstDateTime } from "./emailRender";
import type { MemberRecord } from "./members";
import type { NoticeRow, ArchiveRow, ContactRow, ContactInfoRow, ContactSocial, Season } from "./content";
import type { UploadedFile } from "./uploads";

const FORM_STYLE = `
  body { max-width: 960px; }
  h1 { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.01em; }

  .bs-nav { display: flex; align-items: center; justify-content: space-between; gap: 6px 16px; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid rgba(128,128,128,.18); font-size: 0.875rem; flex-wrap: wrap; }
  .bs-nav-links { display: flex; gap: 6px; flex-wrap: wrap; }
  .bs-nav a { opacity: 0.65; color: inherit; text-decoration: none; padding: 6px 14px; border-radius: 999px; transition: opacity .15s, background .15s, color .15s; }
  .bs-nav a:hover { opacity: 1; background: rgba(128,128,128,.1); }
  .bs-nav a.active { opacity: 1; font-weight: 700; background: var(--logo-primary); color: var(--bg); }
  .bs-nav-logout-form { flex-shrink: 0; }
  .bs-nav-logout { -webkit-appearance: none; appearance: none; color: var(--bg); background: var(--logo-primary); border: none; white-space: nowrap; transition: opacity .15s; }
  .bs-nav-logout:hover { opacity: 0.85; }

  /* 페이지 곳곳의 알약(pill) 버튼(로그아웃, 새 글 작성, 저장, 삭제, 파일 선택,
     검색, + 추가, 복사)이 전부 같은 크기를 쓰도록 여기 한 곳에 모아둡니다. 색/테두리
     같은 개별 스타일은 각자의 규칙에 그대로 남아있습니다. */
  .bs-nav-logout, .bs-new, .bs-submit, .bs-danger,
  .bs-upload input[type="file"]::file-selector-button,
  .bs-cancel-btn, .bs-add-row, .bs-copy {
    font: inherit; font-weight: 700; font-size: 0.8125rem; padding: 8px 18px; border-radius: 999px; cursor: pointer;
    transition: opacity .15s, background .15s, border-color .15s, color .15s, transform .12s;
  }

  /* 모션을 끄고 쓰는 사용자를 위해 이동/확대 같은 transform 애니메이션은
     prefers-reduced-motion에서 전부 뺍니다 (색/배경 전환은 자극이 적어 유지). */
  @media (prefers-reduced-motion: no-preference) {
    @keyframes bs-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes bs-row-enter { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    body { animation: bs-fade-up .4s cubic-bezier(0.16,1,0.3,1) both; }
    .bs-card { animation: bs-fade-up .35s cubic-bezier(0.16,1,0.3,1) both; }
    .bs-row-enter { animation: bs-row-enter .25s ease both; }

    .bs-nav-logout:hover, .bs-new:hover, .bs-submit:hover, .bs-danger:hover,
    .bs-upload input[type="file"]::file-selector-button:hover,
    .bs-cancel-btn:hover, .bs-add-row:hover, .bs-copy:hover, .bs-row-remove:hover {
      transform: translateY(-1px);
    }
    .bs-nav-logout:active, .bs-new:active, .bs-submit:active, .bs-danger:active,
    .bs-upload input[type="file"]::file-selector-button:active,
    .bs-cancel-btn:active, .bs-add-row:active, .bs-copy:active, .bs-row-remove:active {
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
  .bs-field input[readonly] { opacity: 0.6; }
  .bs-field textarea { resize: vertical; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.8125rem; line-height: 1.6; }
  .bs-field textarea.bs-autosize { resize: none; overflow: hidden; }
  .bs-field .hint { font-size: 0.75rem; opacity: 0.5; }
  .bs-rows { display: flex; flex-direction: column; gap: 8px; }
  .bs-row-item { display: flex; gap: 8px; align-items: center; }
  .bs-row-item input { flex: 1; min-width: 0; }
  .bs-row-remove { flex-shrink: 0; width: 34px; height: 34px; border-radius: 8px; border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; font-size: 1rem; line-height: 1; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
  .bs-row-remove:hover { background: rgba(220,38,38,.12); border-color: rgba(220,38,38,.4); color: #f87171; }
  .bs-add-row { align-self: flex-start; margin-top: 6px; border: 1px dashed rgba(128,128,128,.4); background: transparent; color: inherit; transition: background .15s, border-color .15s, color .15s; }
  .bs-add-row:hover { background: rgba(128,128,128,.08); border-color: var(--logo-primary); color: var(--logo-primary); }
  @media (max-width: 560px) { .bs-row-item { flex-wrap: wrap; } .bs-row-item input { min-width: 100%; } }
  .bs-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .bs-check { flex-direction: row; align-items: center; gap: 8px; }
  .bs-check input { width: auto; accent-color: var(--logo-primary); }
  .bs-actions { display: flex; gap: 16px; align-items: center; margin-top: 4px; }
  .bs-submit { border: none; background: var(--logo-primary); color: var(--bg); }
  .bs-submit:hover { opacity: 0.88; }
  .bs-cancel { font-size: 0.875rem; opacity: 0.6; text-decoration: none; transition: opacity .15s; }
  .bs-cancel:hover { opacity: 1; }
  .bs-danger-zone { margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(220,38,38,.2); }
  .bs-danger { border: 1px solid rgba(220,38,38,.4); color: #f87171; background: rgba(220,38,38,.06); transition: background .15s; }
  .bs-danger:hover { background: rgba(220,38,38,.14); }
  .bs-note { font-size: 0.8125rem; opacity: 0.55; }
  .bs-error { color: #f87171; background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.25); border-radius: 10px; padding: 10px 14px; font-size: 0.875rem; margin: 0 0 18px; }
  @media (prefers-reduced-motion: no-preference) { .bs-error { animation: bs-fade-up .3s ease both; } }
  @media (max-width: 640px) { .bs-row2 { grid-template-columns: 1fr; } }

  .bs-upload { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; }
  .bs-upload input[type="file"] { font-size: 0.8125rem; color: inherit; }
  .bs-upload input[type="file"]::file-selector-button { border: none; margin-right: 12px; background: var(--logo-primary); color: var(--bg); }
  .bs-upload input[type="file"]::file-selector-button:hover { opacity: 0.88; }
  .bs-upload input[type="text"] { font: inherit; font-size: 0.8125rem; padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04); color: inherit; min-width: 220px; flex: 1; }
  .bs-upload input[type="text"]:focus { outline: none; border-color: var(--logo-primary); }
  .bs-search { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; padding-top: 16px; border-top: 1px solid rgba(128,128,128,.16); }
  .bs-search input[type="text"] { font: inherit; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04); color: inherit; max-width: 260px; }
  .bs-search input[type="text"]:focus { outline: none; border-color: var(--logo-primary); }
  .bs-cancel-btn { border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; }
  .bs-cancel-btn:hover { background: rgba(128,128,128,.08); }
  .bs-upload-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(128,128,128,.18); }
  .bs-upload-list li { border-bottom: 1px solid rgba(128,128,128,.18); display: flex; align-items: center; gap: 14px; padding: 12px 6px; transition: background .15s; }
  .bs-upload-list li:hover { background: rgba(128,128,128,.05); }
  .bs-upload-open { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; color: inherit; text-decoration: none; }
  .bs-upload-open:hover .name { text-decoration: underline; }
  .bs-upload-list .thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: rgba(128,128,128,.08); flex-shrink: 0; }
  .bs-upload-list .file-icon { width: 44px; height: 44px; border-radius: 8px; background: rgba(128,128,128,.08); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
  .bs-upload-list .info { flex: 1; min-width: 0; }
  .bs-upload-list .name { font-weight: 600; font-size: 0.875rem; word-break: break-all; }
  .bs-upload-list .meta { font-size: 0.75rem; opacity: 0.55; }
  .bs-upload-list .snippet { font: inherit; font-family: ui-monospace, monospace; font-size: 0.75rem; width: 220px; box-sizing: border-box; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04); color: inherit; flex-shrink: 0; }
  .bs-copy { flex-shrink: 0; border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; }
  .bs-copy:hover { background: rgba(128,128,128,.1); }
  .bs-upload-list .bs-danger { flex-shrink: 0; }
  @media (max-width: 720px) { .bs-upload-list li { flex-wrap: wrap; } .bs-upload-list .snippet { width: 100%; } }
`;

function navLink(href: string, label: string, active: boolean): string {
  return `<a href="${href}"${active ? ' class="active"' : ""}>${label}</a>`;
}

function shell(title: string, active: string, bodyHtml: string): string {
  const nav = `
    <nav class="bs-nav">
      <div class="bs-nav-links">
        ${navLink("/", "홈", active === "home")}
        ${navLink("/notices", "공지사항", active === "notices")}
        ${navLink("/archive", "대회 아카이브", active === "archive")}
        ${navLink("/contact", "연락처", active === "contact")}
        ${navLink("/uploads", "업로드", active === "uploads")}
      </div>
      <form method="post" action="/logout" class="bs-nav-logout-form">
        <button type="submit" class="bs-nav-logout">로그아웃</button>
      </form>
    </nav>
  `;
  return page(title, `<style>${FORM_STYLE}</style>${nav}${bodyHtml}`);
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

export type MemberSyncResult = { total: number; written: number; deleted: number };

export function renderBackstageHome(
  member: MemberRecord,
  syncResult?: MemberSyncResult | null,
  lastSyncedAt?: number | null,
): string {
  return shell(
    "Backstage",
    "home",
    `
    <p class="bs-eyebrow">RUN Backstage</p>
    <h1>안녕하세요, ${escapeHtml(member.name || "관리자")}님</h1>
    <p class="bs-lead">관리자 권한이 확인되었습니다. 왼쪽 위 메뉴에서 관리할 콘텐츠를 선택하세요.</p>
    <p class="bs-note" style="margin-top:16px">저장하면 D1에 바로 반영되고, GitHub Actions가 자동으로 다시 빌드/배포합니다 (보통 1분 내외 걸려요).</p>

    <div class="bs-card" style="margin-top:24px">
      <p class="bs-card-title">회원 명단 동기화</p>
      <p class="bs-note">Google Sheets 회원 명단은 매시 정각에 자동으로 KV에 동기화됩니다. 방금 시트를 고쳤다면 여기서 바로 반영할 수 있어요.</p>
      <p class="bs-note" style="margin-top:6px">
        마지막 동기화: ${lastSyncedAt ? escapeHtml(formatKstDateTime(lastSyncedAt)) : "기록 없음"}
      </p>
      ${
        syncResult
          ? `<p class="bs-note" style="margin-top:10px;color:var(--logo-primary);font-weight:700;">완료 — 전체 ${syncResult.total}명 중 ${syncResult.written}명 갱신, ${syncResult.deleted}명 삭제됨</p>`
          : ""
      }
      <form method="post" action="/sync-members" style="margin-top:14px">
        <button type="submit" class="bs-submit">지금 동기화</button>
      </form>
    </div>
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

      <div class="bs-actions">
        <button type="submit" class="bs-submit">저장</button>
        ${mode === "edit" ? `<a href="/notices" class="bs-cancel">취소</a>` : ""}
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

const ARCHIVE_ROWS_SCRIPT = `
  document.querySelectorAll(".bs-add-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rows = document.getElementById(btn.dataset.rows);
      const tpl = document.getElementById(btn.dataset.template);
      const clone = tpl.content.cloneNode(true);
      const row = clone.querySelector(".bs-row-item");
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
      <script>${ARCHIVE_ROWS_SCRIPT}</script>

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

      <div class="bs-actions">
        <button type="submit" class="bs-submit">저장</button>
        ${mode === "edit" ? `<a href="/archive/${data.season}" class="bs-cancel">취소</a>` : ""}
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

      <div class="bs-actions">
        <button type="submit" class="bs-submit">저장</button>
      </div>
    </form>
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
    <button type="button" class="bs-copy" onclick="navigator.clipboard.writeText(this.previousElementSibling.value);this.textContent='복사됨';setTimeout(()=>this.textContent='복사',1200)">복사</button>
    <form method="post" action="/uploads/${encodeURIComponent(file.key)}/delete" onsubmit="return confirm('이 파일을 삭제할까요? 이미 글에 쓰인 곳이 있다면 깨질 수 있어요.')">
      <button type="submit" class="bs-danger">삭제</button>
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
      <button type="submit" class="bs-submit">업로드</button>
    </form>
    <form class="bs-search" method="get" action="/uploads">
      <input type="text" name="q" value="${escapeHtml(meta.q)}" placeholder="파일명 검색" />
      <button type="submit" class="bs-cancel-btn">검색</button>
      ${meta.q ? `<a href="/uploads" class="bs-cancel">지우기</a>` : ""}
    </form>
    ${body}
    ${pager}
  `,
  );
}

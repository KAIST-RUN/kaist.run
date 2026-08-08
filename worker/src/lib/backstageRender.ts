import { page, escapeHtml } from "./emailRender";
import { serializeResources, serializeJudges, serializeInfo, serializeSocials } from "./contentForms";
import type { MemberRecord } from "./members";
import type { NoticeRow, ArchiveRow, ContactRow, Season } from "./content";
import { groupImagesByFolder, type ContentImage } from "./contentImages";

const FORM_STYLE = `
  body { max-width: 960px; }
  h1 { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.01em; }

  .bs-nav { display: flex; gap: 6px; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid rgba(128,128,128,.18); font-size: 0.875rem; flex-wrap: wrap; }
  .bs-nav a { opacity: 0.65; text-decoration: none; padding: 6px 14px; border-radius: 999px; transition: opacity .15s, background .15s, color .15s; }
  .bs-nav a:hover { opacity: 1; background: rgba(128,128,128,.1); }
  .bs-nav a.active { opacity: 1; font-weight: 700; background: var(--logo-primary); color: #06240a; }

  .bs-subnav { display: flex; gap: 8px; margin: -8px 0 20px; font-size: 0.8125rem; }
  .bs-subnav a { opacity: 0.6; text-decoration: none; padding: 4px 12px; border-radius: 999px; border: 1px solid rgba(128,128,128,.25); }
  .bs-subnav a.active { opacity: 1; font-weight: 700; border-color: var(--logo-primary); color: var(--logo-primary); }

  .bs-eyebrow { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.45; margin: 0 0 4px; }
  .bs-lead { opacity: 0.65; font-size: 0.9375rem; margin: 6px 0 0; }

  .bs-card { background: rgba(128,128,128,.05); border: 1px solid rgba(128,128,128,.16); border-radius: 16px; padding: 20px 22px; margin-bottom: 18px; }
  .bs-card + .bs-card { margin-top: 0; }
  .bs-card-title { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.5; margin: 0 0 16px; }

  .bs-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(128,128,128,.18); }
  .bs-list li { border-bottom: 1px solid rgba(128,128,128,.18); display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 6px; flex-wrap: wrap; border-radius: 8px; }
  .bs-list li:hover { background: rgba(128,128,128,.06); }
  .bs-list .title { font-weight: 600; text-decoration: none; color: inherit; }
  .bs-list .title:hover { color: var(--logo-primary); }
  .bs-list .meta { font-size: 0.8rem; opacity: 0.55; white-space: nowrap; }
  .bs-list .pin { color: var(--logo-accent); font-weight: 700; margin-right: 6px; }
  .empty { opacity: 0.5; padding: 20px 6px; font-size: 0.9rem; }

  .bs-new { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 20px; font-size: 0.875rem; font-weight: 700; text-decoration: none; color: #06240a; background: var(--logo-primary); padding: 8px 16px; border-radius: 999px; transition: opacity .15s; }
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
  .bs-field .hint { font-size: 0.75rem; opacity: 0.5; }
  .bs-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .bs-check { flex-direction: row; align-items: center; gap: 8px; }
  .bs-check input { width: auto; accent-color: var(--logo-primary); }
  .bs-actions { display: flex; gap: 16px; align-items: center; margin-top: 4px; }
  .bs-submit { border: none; border-radius: 999px; padding: 11px 28px; font-weight: 700; font-size: 0.9375rem; cursor: pointer; background: var(--logo-primary); color: #06240a; transition: opacity .15s, transform .1s; }
  .bs-submit:hover { opacity: 0.88; }
  .bs-submit:active { transform: scale(0.98); }
  .bs-cancel { font-size: 0.875rem; opacity: 0.6; text-decoration: none; }
  .bs-cancel:hover { opacity: 1; }
  .bs-danger-zone { margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(220,38,38,.2); }
  .bs-danger { border: 1px solid rgba(220,38,38,.4); color: #f87171; border-radius: 999px; padding: 9px 20px; background: rgba(220,38,38,.06); cursor: pointer; font-weight: 600; font-size: 0.875rem; transition: background .15s; }
  .bs-danger:hover { background: rgba(220,38,38,.14); }
  .bs-note { font-size: 0.8125rem; opacity: 0.55; }
  .bs-error { color: #f87171; background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.25); border-radius: 10px; padding: 10px 14px; font-size: 0.875rem; margin: 0 0 18px; }
  @media (max-width: 640px) { .bs-row2 { grid-template-columns: 1fr; } }

  .bs-upload { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 28px; }
  .bs-upload input[type="file"] { font-size: 0.875rem; }
  .bs-upload input[type="text"] { font: inherit; padding: 9px 12px; border-radius: 8px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04); color: inherit; }
  .bs-breadcrumb { display: inline-block; font-size: 0.875rem; opacity: 0.6; text-decoration: none; margin-bottom: 10px; }
  .bs-breadcrumb:hover { opacity: 1; }
  .bs-folders { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
  .bs-folder-tile { display: flex; flex-direction: column; align-items: center; gap: 6px; text-decoration: none; color: inherit; background: rgba(128,128,128,.05); border: 1px solid rgba(128,128,128,.16); border-radius: 14px; padding: 22px 12px; transition: background .15s, border-color .15s; }
  .bs-folder-tile:hover { background: rgba(128,128,128,.1); border-color: var(--logo-primary); }
  .bs-folder-icon { font-size: 2rem; }
  .bs-folder-name { font-weight: 600; font-size: 0.875rem; text-align: center; word-break: break-all; }
  .bs-folder-count { font-size: 0.75rem; opacity: 0.55; }
  .bs-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
  .bs-gallery figure { margin: 0; background: rgba(128,128,128,.05); border: 1px solid rgba(128,128,128,.16); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .bs-gallery .thumb { width: 100%; height: 130px; object-fit: contain; border-radius: 8px; background: rgba(128,128,128,.08); }
  .bs-gallery figcaption { font-size: 0.75rem; opacity: 0.55; word-break: break-all; }
  .bs-gallery .snippet { font: inherit; font-family: ui-monospace, monospace; font-size: 0.75rem; width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.04); color: inherit; }
  .bs-gallery .row { display: flex; gap: 6px; }
  .bs-copy { flex-shrink: 0; font-size: 0.75rem; padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(128,128,128,.3); background: transparent; color: inherit; cursor: pointer; }
  .bs-copy:hover { background: rgba(128,128,128,.1); }
  .bs-gallery .bs-danger { padding: 5px 12px; font-size: 0.75rem; }
`;

function navLink(href: string, label: string, active: boolean): string {
  return `<a href="${href}"${active ? ' class="active"' : ""}>${label}</a>`;
}

function shell(title: string, active: string, bodyHtml: string): string {
  const nav = `
    <nav class="bs-nav">
      ${navLink("/", "홈", active === "home")}
      ${navLink("/notices", "공지사항", active === "notices")}
      ${navLink("/archive", "대회 아카이브", active === "archive")}
      ${navLink("/contact", "연락처", active === "contact")}
      ${navLink("/images", "이미지", active === "images")}
    </nav>
  `;
  return page(title, `<style>${FORM_STYLE}</style>${nav}${bodyHtml}`);
}

export function renderBackstageHome(member: MemberRecord): string {
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
            <textarea name="contentKo" rows="14">${escapeHtml(data.contentKo)}</textarea>
          </div>
          <div class="bs-field">
            <label>영어</label>
            <textarea name="contentEn" rows="14">${escapeHtml(data.contentEn)}</textarea>
          </div>
        </div>
      </div>

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
  resourcesText: string;
  judgesText: string;
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
    resourcesText: serializeResources(base?.resources ?? []),
    judgesText: serializeJudges(base?.judges ?? []),
  };
}

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
        <div class="bs-field">
          <label>자료 목록 (한 줄에 하나, "파일명 또는 URL | 라벨")</label>
          <textarea name="resourcesText" rows="3">${escapeHtml(data.resourcesText)}</textarea>
          <span class="hint">예: editorial.pdf | 풀이</span>
        </div>
        <div class="bs-field" style="margin-top:14px">
          <label>온라인 저지 (한 줄에 하나, "이름 | URL")</label>
          <textarea name="judgesText" rows="3">${escapeHtml(data.judgesText)}</textarea>
          <span class="hint">예: oj.uz | https://oj.uz/problems/source/...</span>
        </div>
      </div>

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

export type ContactFormData = {
  titleKo: string;
  titleEn: string;
  contentKo: string;
  contentEn: string;
  infoText: string;
  socialsText: string;
};

export function contactRowsToFormData(ko: ContactRow | null, en: ContactRow | null): ContactFormData {
  return {
    titleKo: ko?.title ?? "",
    titleEn: en?.title ?? "",
    contentKo: ko?.content ?? "",
    contentEn: en?.content ?? "",
    infoText: serializeInfo(ko?.info ?? []),
    socialsText: serializeSocials(ko?.socials ?? []),
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
        <p class="bs-card-title">연락처 정보 · SNS</p>
        <div class="bs-field">
          <label>연락처 정보 (한국어/영어 공통 — 라벨/링크는 언어 구분 없이 그대로 씁니다)</label>
          <textarea name="infoText" rows="6">${escapeHtml(data.infoText)}</textarea>
          <span class="hint">블록마다 빈 줄로 구분. 첫 줄은 라벨(예: 회장), 다음 줄들은 "내용" 또는 "내용 | mailto:..."</span>
        </div>
        <div class="bs-field" style="margin-top:14px">
          <label>SNS (한 줄에 하나, "플랫폼 | 라벨 | URL")</label>
          <textarea name="socialsText" rows="3">${escapeHtml(data.socialsText)}</textarea>
          <span class="hint">플랫폼: instagram / github / discord / email / x — 예: instagram | @run_kaist | https://instagram.com/run_kaist</span>
        </div>
      </div>

      <div class="bs-card">
        <p class="bs-card-title">본문 (마크다운)</p>
        <div class="bs-row2">
          <div class="bs-field">
            <label>한국어</label>
            <textarea name="contentKo" rows="6">${escapeHtml(data.contentKo)}</textarea>
          </div>
          <div class="bs-field">
            <label>영어</label>
            <textarea name="contentEn" rows="6">${escapeHtml(data.contentEn)}</textarea>
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

// ---------- images ----------

function formatImageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderImageFigure(img: ContentImage, currentFolder: string): string {
  const url = `/content-images/${img.key}`;
  const snippet = `![](${url})`;
  const deleteAction = `/images/${encodeURIComponent(img.key)}/delete`;
  return `<figure>
    <img class="thumb" src="${escapeHtml(url)}" alt="" loading="lazy" />
    <figcaption>${escapeHtml(img.key)} · ${formatImageBytes(img.size)}</figcaption>
    <div class="row">
      <input class="snippet" type="text" readonly value="${escapeHtml(snippet)}" onclick="this.select()" />
      <button type="button" class="bs-copy" onclick="navigator.clipboard.writeText(${JSON.stringify(snippet)});this.textContent='복사됨';setTimeout(()=>this.textContent='복사',1200)">복사</button>
    </div>
    <form method="post" action="${deleteAction}" onsubmit="return confirm('이 이미지를 삭제할까요? 이미 글에 쓰인 곳이 있다면 깨질 수 있어요.')">
      <input type="hidden" name="folder" value="${escapeHtml(currentFolder)}" />
      <button type="submit" class="bs-danger">삭제</button>
    </form>
  </figure>`;
}

function uploadForm(folder: string): string {
  return `<form class="bs-upload" method="post" action="/images" enctype="multipart/form-data">
    <input type="file" name="file" accept="image/*" required />
    <input type="text" name="folder" value="${escapeHtml(folder)}" placeholder="폴더 (선택, 예: 2026-spring-recruiting)" style="max-width:280px" />
    <button type="submit" class="bs-submit">업로드</button>
  </form>`;
}

// folder가 없으면 "드라이브 루트"처럼 폴더 타일 목록만 보여주고, folder가 있으면
// 그 폴더 안으로 들어가서 이미지 목록을 보여줍니다 (구글 드라이브 느낌의 탐색).
export function renderImageGallery(images: ContentImage[], folder?: string, error?: string): string {
  const errorHtml = error ? `<p class="bs-error">${escapeHtml(error)}</p>` : "";

  if (!folder) {
    const groups = groupImagesByFolder(images);
    const body =
      groups.length === 0
        ? `<p class="empty">업로드된 이미지가 없습니다.</p>`
        : `<div class="bs-folders">
          ${groups
            .map(
              (group) => `<a class="bs-folder-tile" href="/images?folder=${encodeURIComponent(group.folder)}">
                <span class="bs-folder-icon">📁</span>
                <span class="bs-folder-name">${escapeHtml(group.folder)}</span>
                <span class="bs-folder-count">${group.images.length}개</span>
              </a>`,
            )
            .join("\n")}
        </div>`;

    return shell(
      "이미지 관리",
      "images",
      `
      <p class="bs-eyebrow">Backstage</p>
      <h1>이미지</h1>
      <p class="bs-lead">폴더를 눌러 들어가면 그 안의 이미지들을 볼 수 있어요. 업로드할 땐 폴더 이름을 적어서 새 폴더를 만들 수도 있어요.</p>
      ${errorHtml}
      ${uploadForm("")}
      ${body}
    `,
    );
  }

  const folderImages = images.filter((img) => (img.folder ?? "미분류") === folder);
  const body =
    folderImages.length === 0
      ? `<p class="empty">이 폴더에 이미지가 없습니다.</p>`
      : `<div class="bs-gallery">${folderImages.map((img) => renderImageFigure(img, folder)).join("\n")}</div>`;

  return shell(
    "이미지 관리",
    "images",
    `
    <p class="bs-eyebrow">Backstage</p>
    <a href="/images" class="bs-breadcrumb">← 전체 폴더</a>
    <h1>📁 ${escapeHtml(folder)}</h1>
    ${errorHtml}
    ${uploadForm(folder)}
    ${body}
  `,
  );
}

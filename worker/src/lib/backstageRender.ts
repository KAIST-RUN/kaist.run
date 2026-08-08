import { page, escapeHtml } from "./emailRender";
import { serializeResources, serializeJudges, serializeInfo, serializeSocials } from "./contentForms";
import type { MemberRecord } from "./members";
import type { NoticeRow, ArchiveRow, ContactRow, Season } from "./content";

const FORM_STYLE = `
  .bs-nav { display: flex; gap: 16px; margin-bottom: 24px; font-size: 0.9rem; flex-wrap: wrap; }
  .bs-nav a { opacity: 0.7; text-decoration: none; }
  .bs-nav a:hover { opacity: 1; text-decoration: underline; }
  .bs-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(128,128,128,.25); }
  .bs-list li { border-bottom: 1px solid rgba(128,128,128,.25); display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 4px; flex-wrap: wrap; }
  .bs-list .title { font-weight: 600; }
  .bs-list .meta { font-size: 0.8rem; opacity: 0.6; }
  .bs-list .pin { color: var(--logo-accent); font-weight: 700; margin-right: 4px; }
  .bs-new { display: inline-block; margin-bottom: 16px; font-size: 0.9rem; font-weight: 600; }
  form.bs-form { display: flex; flex-direction: column; gap: 16px; max-width: 720px; }
  .bs-field { display: flex; flex-direction: column; gap: 4px; }
  .bs-field label { font-size: 0.8125rem; font-weight: 600; opacity: 0.8; }
  .bs-field input[type="text"], .bs-field input[type="date"], .bs-field input[type="number"], .bs-field textarea {
    font: inherit; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(128,128,128,.35);
    background: transparent; color: inherit; width: 100%; box-sizing: border-box;
  }
  .bs-field textarea { resize: vertical; font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .bs-field .hint { font-size: 0.75rem; opacity: 0.55; }
  .bs-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .bs-check { flex-direction: row; align-items: center; gap: 8px; }
  .bs-check input { width: auto; }
  .bs-actions { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
  .bs-submit { border: none; border-radius: 999px; padding: 10px 24px; font-weight: 700; cursor: pointer; background: var(--logo-primary); color: #06240a; }
  .bs-danger { border: 1px solid rgba(220,38,38,.5); color: #dc2626; border-radius: 999px; padding: 10px 20px; background: transparent; cursor: pointer; font-weight: 600; }
  .bs-note { font-size: 0.8125rem; opacity: 0.6; }
  @media (max-width: 640px) { .bs-row2 { grid-template-columns: 1fr; } }
`;

function shell(title: string, active: string, bodyHtml: string): string {
  const nav = `
    <nav class="bs-nav">
      <a href="/"${active === "home" ? ' style="opacity:1;font-weight:700"' : ""}>홈</a>
      <a href="/notices"${active === "notices" ? ' style="opacity:1;font-weight:700"' : ""}>공지사항</a>
      <a href="/archive"${active === "archive" ? ' style="opacity:1;font-weight:700"' : ""}>대회 아카이브</a>
      <a href="/contact"${active === "contact" ? ' style="opacity:1;font-weight:700"' : ""}>연락처</a>
    </nav>
  `;
  return page(title, `<style>${FORM_STYLE}</style>${nav}${bodyHtml}`);
}

export function renderBackstageHome(member: MemberRecord): string {
  return shell(
    "Backstage",
    "home",
    `
    <h1>Backstage</h1>
    <p>안녕하세요, ${escapeHtml(member.name || "관리자")}님. 관리자 권한이 확인되었습니다.</p>
    <p class="bs-note">저장하면 D1에 바로 반영되고, GitHub Actions가 자동으로 다시 빌드/배포합니다 (보통 1분 내외 걸려요).</p>
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
    <h1>${mode === "new" ? "새 공지 작성" : "공지 수정"}</h1>
    ${error ? `<p style="color:#dc2626">${escapeHtml(error)}</p>` : ""}
    <form class="bs-form" method="post" action="${action}">
      <div class="bs-field">
        <label>슬러그 (URL에 쓰임, 영문/숫자/하이픈)</label>
        <input type="text" name="slug" value="${escapeHtml(data.slug)}" pattern="[a-z0-9-]+" required ${mode === "edit" ? "readonly" : ""} />
      </div>
      <div class="bs-row2">
        <div class="bs-field">
          <label>날짜</label>
          <input type="date" name="date" value="${escapeHtml(data.date)}" required />
        </div>
        <div class="bs-field bs-check" style="align-self:end;flex-direction:row;">
          <input type="checkbox" id="pinned" name="pinned" ${data.pinned ? "checked" : ""} />
          <label for="pinned" style="margin:0;">상단 고정</label>
        </div>
      </div>
      <div class="bs-row2">
        <div class="bs-field">
          <label>제목 (한국어)</label>
          <input type="text" name="titleKo" value="${escapeHtml(data.titleKo)}" required />
        </div>
        <div class="bs-field">
          <label>제목 (영어)</label>
          <input type="text" name="titleEn" value="${escapeHtml(data.titleEn)}" required />
        </div>
      </div>
      <div class="bs-row2">
        <div class="bs-field">
          <label>본문 (한국어, 마크다운)</label>
          <textarea name="contentKo" rows="14">${escapeHtml(data.contentKo)}</textarea>
        </div>
        <div class="bs-field">
          <label>본문 (영어, 마크다운)</label>
          <textarea name="contentEn" rows="14">${escapeHtml(data.contentEn)}</textarea>
        </div>
      </div>
      <div class="bs-actions">
        <button type="submit" class="bs-submit">저장</button>
        ${mode === "edit" ? `<a href="/notices" style="font-size:.875rem;opacity:.7">취소</a>` : ""}
      </div>
    </form>
    ${
      mode === "edit"
        ? `<form method="post" action="/notices/${escapeHtml(data.slug)}/delete" style="margin-top:24px" onsubmit="return confirm('정말 삭제할까요?')">
            <button type="submit" class="bs-danger">이 공지 삭제</button>
          </form>`
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
    <h1>대회 아카이브</h1>
    <div class="bs-nav" style="margin-bottom:8px">
      <a href="/archive/spring"${season === "spring" ? ' style="opacity:1;font-weight:700"' : ""}>봄</a>
      <a href="/archive/fall"${season === "fall" ? ' style="opacity:1;font-weight:700"' : ""}>가을</a>
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
    <h1>${mode === "new" ? "새 대회 등록" : "대회 수정"}</h1>
    ${error ? `<p style="color:#dc2626">${escapeHtml(error)}</p>` : ""}
    <form class="bs-form" method="post" action="${action}">
      <div class="bs-row2">
        <div class="bs-field">
          <label>슬러그 (예: 2026-spring)</label>
          <input type="text" name="slug" value="${escapeHtml(data.slug)}" pattern="[a-z0-9-]+" required ${mode === "edit" ? "readonly" : ""} />
        </div>
        <div class="bs-field">
          <label>시즌</label>
          <select name="season" ${mode === "edit" ? "disabled" : ""} style="padding:8px 10px;border-radius:6px;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;">
            <option value="spring" ${data.season === "spring" ? "selected" : ""}>봄</option>
            <option value="fall" ${data.season === "fall" ? "selected" : ""}>가을</option>
          </select>
          ${mode === "edit" ? `<input type="hidden" name="season" value="${data.season}" />` : ""}
        </div>
      </div>
      <div class="bs-row2">
        <div class="bs-field">
          <label>연도</label>
          <input type="number" name="year" value="${escapeHtml(data.year)}" required />
        </div>
        <div class="bs-field">
          <label>날짜</label>
          <input type="date" name="date" value="${escapeHtml(data.date)}" required />
        </div>
      </div>
      <div class="bs-row2">
        <div class="bs-field">
          <label>제목 (한국어)</label>
          <input type="text" name="titleKo" value="${escapeHtml(data.titleKo)}" required />
        </div>
        <div class="bs-field">
          <label>제목 (영어)</label>
          <input type="text" name="titleEn" value="${escapeHtml(data.titleEn)}" required />
        </div>
      </div>
      <div class="bs-field">
        <label>자료 목록 (한 줄에 하나, "파일명 또는 URL | 라벨")</label>
        <textarea name="resourcesText" rows="3">${escapeHtml(data.resourcesText)}</textarea>
        <span class="hint">예: editorial.pdf | 풀이</span>
      </div>
      <div class="bs-field">
        <label>온라인 저지 (한 줄에 하나, "이름 | URL")</label>
        <textarea name="judgesText" rows="3">${escapeHtml(data.judgesText)}</textarea>
        <span class="hint">예: oj.uz | https://oj.uz/problems/source/...</span>
      </div>
      <div class="bs-row2">
        <div class="bs-field">
          <label>본문 (한국어, 마크다운)</label>
          <textarea name="contentKo" rows="8">${escapeHtml(data.contentKo)}</textarea>
        </div>
        <div class="bs-field">
          <label>본문 (영어, 마크다운)</label>
          <textarea name="contentEn" rows="8">${escapeHtml(data.contentEn)}</textarea>
        </div>
      </div>
      <div class="bs-actions">
        <button type="submit" class="bs-submit">저장</button>
        ${mode === "edit" ? `<a href="/archive/${data.season}" style="font-size:.875rem;opacity:.7">취소</a>` : ""}
      </div>
    </form>
    ${
      mode === "edit"
        ? `<form method="post" action="/archive/${data.season}/${escapeHtml(data.slug)}/delete" style="margin-top:24px" onsubmit="return confirm('정말 삭제할까요?')">
            <button type="submit" class="bs-danger">이 대회 삭제</button>
          </form>`
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
    <h1>연락처 페이지</h1>
    ${error ? `<p style="color:#dc2626">${escapeHtml(error)}</p>` : ""}
    <form class="bs-form" method="post" action="/contact">
      <div class="bs-row2">
        <div class="bs-field">
          <label>제목 (한국어)</label>
          <input type="text" name="titleKo" value="${escapeHtml(data.titleKo)}" required />
        </div>
        <div class="bs-field">
          <label>제목 (영어)</label>
          <input type="text" name="titleEn" value="${escapeHtml(data.titleEn)}" required />
        </div>
      </div>
      <div class="bs-field">
        <label>연락처 정보 (한국어/영어 공통 — 라벨/링크는 언어 구분 없이 그대로 씁니다)</label>
        <textarea name="infoText" rows="6">${escapeHtml(data.infoText)}</textarea>
        <span class="hint">블록마다 빈 줄로 구분. 첫 줄은 라벨(예: 회장), 다음 줄들은 "내용" 또는 "내용 | mailto:..."</span>
      </div>
      <div class="bs-field">
        <label>SNS (한 줄에 하나, "플랫폼 | 라벨 | URL")</label>
        <textarea name="socialsText" rows="3">${escapeHtml(data.socialsText)}</textarea>
        <span class="hint">플랫폼: instagram / github / discord / email / x — 예: instagram | @run_kaist | https://instagram.com/run_kaist</span>
      </div>
      <div class="bs-row2">
        <div class="bs-field">
          <label>본문 (한국어, 마크다운)</label>
          <textarea name="contentKo" rows="6">${escapeHtml(data.contentKo)}</textarea>
        </div>
        <div class="bs-field">
          <label>본문 (영어, 마크다운)</label>
          <textarea name="contentEn" rows="6">${escapeHtml(data.contentEn)}</textarea>
        </div>
      </div>
      <div class="bs-actions">
        <button type="submit" class="bs-submit">저장</button>
      </div>
    </form>
  `,
  );
}

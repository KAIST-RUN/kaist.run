import type { Email, Address, Attachment } from "postal-mime";
import type { EmailIndexEntry, EmailNoteState } from "./emailIndex";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatAddress(addr: Address | undefined): string {
  if (!addr) return "-";
  return addr.name ? `${addr.name} <${addr.address}>` : (addr.address ?? "-");
}

export function formatAddressList(addrs: Address[] | undefined): string {
  if (!addrs || addrs.length === 0) return "-";
  return addrs.map(formatAddress).join(", ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentByteLength(content: Attachment["content"]): number {
  return typeof content === "string" ? new TextEncoder().encode(content).length : content.byteLength;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toBase64(content: Attachment["content"]): string {
  const bytes =
    typeof content === "string"
      ? new TextEncoder().encode(content)
      : content instanceof Uint8Array
        ? content
        : new Uint8Array(content);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// 본문에 인라인으로 삽입된 이미지(<img src="cid:...">)는 브라우저가 cid: URI를
// 직접 못 불러오기 때문에 그냥 안 보이거나 파일명만 뜹니다. Content-ID가 있는
// 첨부파일을 data: URI로 바로 심어서 이미지가 바로 보이게 합니다.
//
// 다운로드 경로(/email/<id>/attachments/<index>)로 바꾸는 방법도 시도해봤는데,
// 본문 iframe이 sandbox(스크립트 없음)라 origin이 opaque 취급되어 그 안에서
// 나가는 이미지 요청엔 세션 쿠키(SameSite=Lax)가 안 실려서 401이 났습니다.
// data: URI는 별도 요청 자체가 없어서 이 문제가 아예 생기지 않습니다.
function resolveInlineImages(html: string, attachments: Attachment[]): string {
  let result = html;
  for (const att of attachments) {
    if (!att.contentId) continue;
    const cid = att.contentId.replace(/^<|>$/g, "");
    const pattern = new RegExp(`cid:${escapeRegExp(cid)}`, "gi");
    const mime = att.mimeType || "application/octet-stream";
    result = result.replace(pattern, `data:${mime};base64,${toBase64(att.content)}`);
  }
  return result;
}

// 이메일 HTML은 대부분 "배경은 기본값(흰색)에 맡기고 글씨 색만 지정"하는 식으로
// 작성됩니다. 뷰어를 다크모드로 열면 브라우저/확장 프로그램의 강제 다크모드가
// (작성자가 명시 안 한) 배경만 검게 뒤집고 명시된 글씨 색은 그대로 둬서
// "검은 글씨 위에 검은 배경"이 되는 경우가 있습니다. 이메일 클라이언트들이
// 다 그렇듯 본문은 항상 라이트 모드로 고정해서 보여줍니다 — 다크모드 대응은
// 우리가 만든 바깥 UI(제목/헤더/툴바)에만 적용하면 됩니다.
function forceLightColorScheme(html: string): string {
  const tag = '<meta name="color-scheme" content="only light"><style>html,body{background:#fff;color:#000}</style>';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  }
  return `${tag}${html}`;
}

const PAGE_STYLE = `
  :root { --logo-primary: #2fae19; --logo-accent: #e8524f; --bg: #ffffff; --fg: #171717; color-scheme: light; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --logo-primary: #70ff44; --logo-accent: #ff6f6f; --bg: #0a0a0a; --fg: #ededed; color-scheme: dark; }
    /* :where()로 감싸서 이 규칙의 우선순위를 그냥 "a"와 똑같이(0) 만듭니다 — 안
       그러면 :root[...] 때문에 우선순위가 올라가서, 로그아웃 버튼이나 목록 제목처럼
       자기 색을 따로 지정한(하지만 특정도는 더 낮은) 요소들까지 이 파란색으로
       덮어써버립니다. 여긴 정말 아무 색도 안 정해준 링크(첨부파일 목록 등)에만
       기본값으로 적용되면 됩니다. */
    :where(:root:not([data-theme="light"])) a { color: #8ab4ff; }
  }
  :root[data-theme="dark"] { --logo-primary: #70ff44; --logo-accent: #ff6f6f; --bg: #0a0a0a; --fg: #ededed; color-scheme: dark; }
  :where(:root[data-theme="dark"]) a { color: #8ab4ff; }
  body { font-family: -apple-system, "Malgun Gothic", sans-serif; max-width: 900px; margin: 0 auto; padding: 24px 16px; color: var(--fg); background: var(--bg); }
  .topbar { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid rgba(128,128,128,.25); flex-wrap: wrap; }
  .topbar-logo { display: inline-flex; align-items: center; text-decoration: none; opacity: 0.85; flex-shrink: 0; }
  .topbar-logo:hover { opacity: 1; }
  .topbar svg { height: 22px; width: auto; }
  /* 로그아웃 등 오른쪽에 붙는 항목들 — margin-left:auto로 로고/중간 nav와 상관없이
     항상 맨 끝으로 밀립니다. */
  .topbar-end { display: flex; align-items: center; gap: 10px; margin-left: auto; flex-shrink: 0; }
  .theme-toggle { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 34px; height: 34px; border-radius: 999px; border: 1px solid rgba(128,128,128,.3); background: none; padding: 0; font-size: 1rem; line-height: 1; cursor: pointer; transition: background .15s; }
  .theme-toggle:hover { background: rgba(128,128,128,.1); }
  .theme-toggle .icon-moon { display: none; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .theme-toggle .icon-sun { display: none; }
    :root:not([data-theme="light"]) .theme-toggle .icon-moon { display: inline; }
  }
  :root[data-theme="dark"] .theme-toggle .icon-sun { display: none; }
  :root[data-theme="dark"] .theme-toggle .icon-moon { display: inline; }
  h1 { font-size: 1.25rem; margin: 0 0 16px; word-break: break-word; }
  dl { display: grid; grid-template-columns: 5em 1fr; gap: 4px 12px; font-size: 0.875rem; opacity: 0.85; margin: 0 0 20px; }
  dt { font-weight: 600; }
  dd { margin: 0; word-break: break-word; }
  .toolbar { display: flex; gap: 12px; margin-bottom: 20px; font-size: 0.875rem; }
  .body-frame { width: 100%; height: 70vh; border: 1px solid rgba(128,128,128,.3); border-radius: 8px; background: #fff; color-scheme: light; }
  .body-text { white-space: pre-wrap; word-break: break-word; border: 1px solid rgba(128,128,128,.3); border-radius: 8px; padding: 16px; font-size: 0.9rem; }
  .attachments { margin-top: 20px; font-size: 0.875rem; }
  .attachments ul { padding-left: 20px; }
  .email-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgba(128,128,128,.25); }
  .email-list li { border-bottom: 1px solid rgba(128,128,128,.25); }
  .email-list a { display: flex; flex-direction: column; gap: 2px; padding: 14px 4px; text-decoration: none; color: inherit; }
  .email-list a:hover { background: rgba(128,128,128,.08); }
  .email-list .subject { min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .email-list .note-badge { font-size: 1.3em; }
  /* 받는사람 줄과 체크/날짜가 항상 같은 한 줄에 오도록 별도 행으로 묶고, wrap을
     안 시킵니다 — addrs가 flex-shrink로 줄어들며 말줄임표로 잘리고, date는 폭이
     고정(flex-shrink:0)이라 항상 오른쪽 끝 자리를 지킵니다. */
  .email-list .addrs-row { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  .email-list .addrs { flex: 1 1 auto; min-width: 0; font-size: 0.8rem; opacity: 0.65; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .email-list .date { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; opacity: 0.6; }
  .email-list .handled-badge { font-size: 1.3em; }
  .empty { opacity: 0.6; padding: 24px 4px; }
  .pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 20px; font-size: 0.875rem; }
  .pager .disabled { opacity: 0.35; }
  .note-box { margin-top: 20px; padding: 14px 16px; border: 1px solid rgba(128,128,128,.3); border-radius: 8px; background: rgba(128,128,128,.04); }
  .note-box strong { display: block; font-size: 0.8125rem; margin-bottom: 8px; }
  .note-box textarea {
    width: 100%; box-sizing: border-box; font: inherit; padding: 10px 12px; border-radius: 8px;
    border: 1px solid rgba(128,128,128,.3); background: var(--bg); color: inherit; resize: vertical;
  }
  .note-box textarea:focus { outline: none; border-color: var(--logo-primary); }
  .note-actions { display: flex; align-items: center; justify-content: flex-end; gap: 16px; margin-top: 10px; }
  .note-handled { display: flex; align-items: center; gap: 6px; font-size: 0.875rem; cursor: pointer; user-select: none; }
  .note-handled input { width: auto; accent-color: var(--logo-primary); }
  .note-box button {
    font: inherit; padding: 8px 16px; border-radius: 8px; border: none;
    background: var(--logo-primary); color: #06210b; font-weight: 600; cursor: pointer;
  }
`;

// 메인 사이트의 src/components/Logo.tsx와 같은 SVG입니다 (React 없이 그냥
// 마크업만 복사, 색상은 CSS 변수라 다크모드에도 맞게 따라감).
const LOGO_SVG = `<svg viewBox="0 0 337 144" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="RUN">
  <path d="M210.448 137.859L217.348 71.859C217.648 69.159 219.748 67.209 222.598 67.209H236.848C239.398 67.209 240.898 68.859 240.898 71.259L240.448 75.459C248.698 68.109 256.55 65.959 266.75 65.959C281.6 65.959 289.55 73.009 289.55 89.209C289.55 91.159 289.4 93.259 289.25 95.359L285.598 139.059C285.298 141.759 283.198 143.709 280.348 143.709H266.998C263.248 143.709 261.748 141.459 261.748 137.859L264.65 99.859C264.65 99.109 264.8 98.359 264.8 97.609C264.8 89.659 260.45 85.759 253.4 85.759C245.3 85.759 239.398 90.309 238.348 100.509L234.298 139.059C233.998 141.759 231.898 143.709 229.048 143.709H215.698C211.948 143.709 210.448 141.459 210.448 137.859Z" fill="var(--logo-primary)"/>
  <path d="M153.681 71.1661L149 115.706C148.833 117.288 150.501 118.237 151.923 117.369L184.695 97.3436C185.964 96.5684 186.165 94.844 185.079 94.0428L171.247 83.8325C169.989 82.9038 169.341 81.371 169.514 79.7338L170.666 68.8463C170.834 67.2642 172.701 66.3166 173.939 67.1855L208.666 91.5558C212.621 94.3314 211.92 100.541 207.345 103.25L142.681 141.547C134.871 146.172 125.848 140.94 126.754 132.312L133.181 71.1661C133.412 68.969 135.39 67.188 137.599 67.188H150.099C152.308 67.188 153.912 68.969 153.681 71.1661Z" fill="var(--logo-primary)"/>
  <path d="M64.5153 129.459C65.1087 129.459 65.5716 129.973 65.5099 130.563L65.2747 132.812C65.2215 133.321 64.7922 133.708 64.2802 133.708L5 133.708C2.23858 133.708 0 135.947 0 138.708C0 141.47 2.23858 143.708 5 143.708L70 143.708H83.3472C86.1972 143.708 88.2972 141.758 88.5972 139.058L91.1472 114.608C93.0972 96.4582 104.347 86.8582 120.247 86.8582C120.697 86.8582 121.185 86.8957 121.672 86.9332C122.16 86.9707 122.647 87.0082 123.097 87.0082C124.747 87.0082 125.947 86.2582 126.097 84.6082L127.597 70.2082V69.6082C127.597 66.6082 125.797 65.4082 122.947 65.4082C111.547 65.4082 101.347 70.5082 94.7472 79.8082H94.1472L94.7472 72.9082V72.3082C94.7472 69.1582 92.6472 67.2082 89.4972 67.2082H76.8972C74.0472 67.2082 71.9472 69.1582 71.6472 71.8582L68.1344 105.459L22.7404 105.459C19.979 105.459 17.7404 107.698 17.7404 110.459C17.7404 113.22 19.979 115.459 22.7404 115.459L65.9789 115.459C66.5724 115.459 67.0352 115.973 66.9735 116.563L66.7644 118.563C66.7112 119.072 66.2819 119.459 65.7699 119.459L32.7404 119.459C29.979 119.459 27.7404 121.698 27.7404 124.459C27.7404 127.22 29.979 129.459 32.7404 129.459L64.5153 129.459Z" fill="var(--logo-primary)"/>
  <path d="M291.229 44.3693C286.496 37.6703 284.495 29.6806 285.592 21.8687C286.058 18.5642 287.169 15.3836 288.864 12.5086C290.558 9.63369 292.802 7.12065 295.468 5.113C298.134 3.10535 301.169 1.64241 304.4 0.80772C307.631 -0.0269722 310.995 -0.217073 314.299 0.248273C328.174 2.198 337.878 15.0743 335.928 28.9493C334.834 36.7381 330.708 43.8591 324.312 49.0016C320.76 51.8459 316.752 53.8434 312.949 54.7366C312.662 54.8057 312.411 54.9823 312.25 55.2301C312.089 55.478 312.029 55.7783 312.082 56.0691L312.786 59.8819C312.888 60.4007 312.813 60.9388 312.572 61.4096C312.376 61.7849 312.082 62.0995 311.72 62.3189C311.358 62.5383 310.943 62.6542 310.52 62.654C310.412 62.6543 310.304 62.6466 310.197 62.6309L307.623 62.2695C307.562 62.261 307.499 62.2724 307.445 62.3021C307.391 62.3317 307.347 62.3781 307.321 62.4343C304.905 67.6822 300.751 71.6626 295.448 73.7598C295.158 73.8744 294.847 73.9292 294.535 73.9207C294.223 73.9122 293.916 73.8406 293.633 73.7103C293.349 73.58 293.095 73.3936 292.885 73.1624C292.675 72.9312 292.515 72.66 292.413 72.365C292.004 71.1828 292.65 69.8979 293.812 69.4339C297.44 67.9846 300.464 65.339 302.382 61.9357C302.407 61.8946 302.421 61.8482 302.423 61.8006C302.425 61.753 302.415 61.7056 302.394 61.6627C302.373 61.6197 302.342 61.5826 302.304 61.5546C302.265 61.5266 302.22 61.5085 302.173 61.5021L301.103 61.3575C300.544 61.2854 300.028 61.0176 299.646 60.6016C299.338 60.2566 299.14 59.827 299.079 59.3683C299.017 58.9097 299.095 58.4431 299.301 58.029L301.044 54.527C301.177 54.261 301.202 53.9542 301.114 53.6703C301.026 53.3863 300.832 53.1471 300.573 53.0022C297.163 51.0987 293.859 48.0881 291.229 44.3693ZM313.617 46.7946C313.908 46.7945 314.196 46.7396 314.467 46.6327C320.43 44.2739 325.494 39.0159 327.684 32.9109C327.791 32.6241 327.84 32.319 327.827 32.0132C327.815 31.7075 327.743 31.4071 327.614 31.1296C327.485 30.8522 327.302 30.603 327.076 30.3967C326.85 30.1904 326.585 30.031 326.297 29.9277C326.009 29.8244 325.704 29.7793 325.398 29.795C325.092 29.8107 324.793 29.887 324.517 30.0192C324.241 30.1515 323.994 30.3373 323.791 30.5657C323.587 30.7941 323.431 31.0607 323.331 31.35C321.235 37.1948 316.499 40.8558 312.766 42.3343C312.265 42.5322 311.849 42.8986 311.589 43.3703C311.33 43.842 311.243 44.3894 311.344 44.9182C311.445 45.4471 311.727 45.9241 312.142 46.2672C312.557 46.6102 313.079 46.7978 313.617 46.7975V46.7946Z" fill="var(--logo-accent)"/>
</svg>`;

// 테마 선택을 localStorage가 아니라 Domain=.kaist.run 쿠키("kr-theme")에 저장합니다 —
// 그래야 kaist.run(메인 사이트, src/components/layout/ThemeCookieSync.tsx가 같은
// 쿠키를 읽고 씀)과 backstage.kaist.run이 같은 라이트/다크 설정을 공유합니다.
// 저장된 값을 첫 페인트부터 바로 반영하기 위해 <style>보다 먼저, 동기적으로 실행합니다
// — body 렌더 이후에 붙이면 시스템 기본값으로 그렸다가 뒤늦게 바뀌는 깜빡임(FOUC)이
// 생깁니다.
const THEME_INIT_SCRIPT = `(function(){try{var m=("; "+document.cookie).split("; kr-theme=");var v=m.length===2?m.pop().split(";").shift():null;if(v==="light"||v==="dark")document.documentElement.setAttribute("data-theme",v);}catch(e){}})();`;

// 토글 클릭 시 "현재 실효 테마"(명시적 선택이 없으면 시스템 설정)의 반대로 전환하고
// 쿠키에 저장합니다. 실제 색상 전환은 전부 CSS(PAGE_STYLE의 [data-theme] 규칙)가
// 담당하므로, 여기선 속성/쿠키만 건드립니다.
const THEME_TOGGLE_SCRIPT = `(function(){var b=document.getElementById("theme-toggle");if(!b)return;b.addEventListener("click",function(){var root=document.documentElement;var current=root.getAttribute("data-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var next=current==="dark"?"light":"dark";root.setAttribute("data-theme",next);try{var h=location.hostname;var onKaistRun=h==="kaist.run"||h.slice(-10)===".kaist.run";var domain=onKaistRun?"; domain=.kaist.run":"";var secure=onKaistRun?"; secure":"";document.cookie="kr-theme="+next+"; path=/; max-age=31536000; samesite=lax"+domain+secure;}catch(e){}});})();`;

// backstage.ts 등 다른 라우트도 같은 스타일/로고 셸을 쓰고 싶을 때를 위해 export합니다.
// topbarNav/topbarEnd는 backstageRender.ts의 shell()이 로고 옆(nav, ☰)과 테마 토글
// 오른쪽(로그아웃)에 자기 마크업을 끼워 넣을 때 씁니다 — 이메일 뷰어 등 다른
// 호출부는 그냥 생략하면 로고+테마 토글만 있는 기본 topbar가 됩니다.
export function page(title: string, bodyHtml: string, topbarNav?: string, topbarEnd?: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<script>if ("scrollRestoration" in history) history.scrollRestoration = "manual";</script>
<script>${THEME_INIT_SCRIPT}</script>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="topbar">
  <a href="https://kaist.run" aria-label="kaist.run" class="topbar-logo">${LOGO_SVG}</a>
  ${topbarNav ?? ""}
  <div class="topbar-end">
    <button type="button" class="theme-toggle" id="theme-toggle" aria-label="테마 전환" title="테마 전환">
      <span class="icon-sun" aria-hidden="true">☀️</span><span class="icon-moon" aria-hidden="true">🌙</span>
    </button>
    ${topbarEnd ?? ""}
  </div>
</div>
${bodyHtml}
<script>${THEME_TOGGLE_SCRIPT}</script>
</body>
</html>`;
}

export function renderErrorPage(title: string, message: string): string {
  return page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`);
}

// page() 셸(로고/테마 토글만 있는 기본 topbar)과 backstageRender.ts의 shell()(전체
// backstage 메뉴가 있는 topbar) 양쪽에서 재사용할 수 있도록, 제목과 내용 마크업을
// 따로 만듭니다 — kaist.run/email(메인 도메인 직접 접근)은 앞의 것을, backstage.kaist.run/email
// (backstage 메뉴 안 서브탭)은 뒤의 것을 씁니다. 실제로 쓰는 CSS 클래스(.email-list,
// .toolbar, .body-frame 등)는 PAGE_STYLE에 있고, page()가 어느 경로로 호출되든 항상
// <style>${PAGE_STYLE}</style>을 넣어주므로(backstageRender.ts::shell도 내부적으로
// page()를 호출) 클래스 스타일은 두 경로 모두에서 그대로 적용됩니다.
export function renderEmailPageBody(id: string, email: Email, state: EmailNoteState): string {
  // id는 URL 경로에서 그대로 옵니다 — 지금은 항상 서버가 생성한 랜덤 hex라
  // 위험한 문자가 들어올 일이 없지만, href에 그대로 꽂아 넣는 값이라 방어적으로
  // escape 해둡니다.
  const safeId = escapeHtml(id);
  const subject = email.subject || "(제목 없음)";
  const attachments: Attachment[] = email.attachments ?? [];

  const bodyHtml = email.html
    ? `<iframe class="body-frame" sandbox srcdoc="${escapeHtml(forceLightColorScheme(resolveInlineImages(email.html, attachments)))}"></iframe>`
    : `<div class="body-text">${escapeHtml(email.text || "(본문 없음)")}</div>`;

  const attachmentsHtml =
    attachments.length === 0
      ? ""
      : `<div class="attachments">
        <strong>첨부파일 (${attachments.length})</strong>
        <ul>
          ${attachments
            .map(
              (att, i) =>
                `<li><a href="/email/${safeId}/attachments/${i}">${escapeHtml(att.filename || `attachment-${i}`)}</a> (${formatBytes(attachmentByteLength(att.content))})</li>`,
            )
            .join("\n")}
        </ul>
      </div>`;

  const noteHtml = `
    <div class="note-box">
      <strong>메모</strong>
      <form method="post" action="/email/${safeId}/note">
        <textarea name="note" rows="3" placeholder="이 메일에 대한 메모(회신 여부, 담당자 등)를 남겨두세요.">${escapeHtml(state.note)}</textarea>
        <div class="note-actions">
          <label class="note-handled">
            <input type="checkbox" name="handled" value="1" ${state.handled ? "checked" : ""} />
            처리 완료
          </label>
          <button type="submit">저장</button>
        </div>
      </form>
    </div>`;

  return `
    <h1>${escapeHtml(subject)}</h1>
    <dl>
      <dt>보낸 사람</dt><dd>${escapeHtml(formatAddress(email.from))}</dd>
      <dt>받는 사람</dt><dd>${escapeHtml(formatAddressList(email.to))}</dd>
      <dt>날짜</dt><dd>${escapeHtml(email.date || "-")}</dd>
    </dl>
    <div class="toolbar">
      <a href="/email/${safeId}/raw">원본 .eml 다운로드</a>
    </div>
    ${bodyHtml}
    ${attachmentsHtml}
    ${noteHtml}
  `;
}

export function renderEmailPage(id: string, email: Email, state: EmailNoteState): string {
  return page(email.subject || "(제목 없음)", renderEmailPageBody(id, email, state));
}

// KST(Asia/Seoul) 기준 "YYYY-MM-DD HH:mm"로 고정 포맷 — 로케일 구분자에 기대지 않고
// formatToParts로 직접 조립해서 어느 런타임에서 돌아도 형태가 안 바뀌게 합니다.
// backstageRender.ts(회원 명단 마지막 동기화 시각)도 재사용합니다.
export function formatKstDateTime(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export type EmailListPageInfo = {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export function renderEmailListBody(
  items: EmailIndexEntry[],
  info: EmailListPageInfo,
  noteStates: Map<string, EmailNoteState> = new Map(),
): string {
  const rows = items.length
    ? `<ul class="email-list">
        ${items
          .map((item) => {
            const safeId = escapeHtml(item.id);
            const state = noteStates.get(item.id);
            const handledBadge = state?.handled ? `<span class="handled-badge" title="처리 완료">✅</span>` : "";
            const noteBadge = state?.note ? `<span class="note-badge" title="메모 있음">📝</span>` : "";
            return `<li><a href="/email/${safeId}">
              <span class="subject">${escapeHtml(item.subject)}</span>
              <div class="addrs-row">
                <span class="addrs">${escapeHtml(item.from)} → ${escapeHtml(item.to)}</span>
                <span class="date">${noteBadge}${handledBadge}${escapeHtml(formatKstDateTime(item.receivedAt))}</span>
              </div>
            </a></li>`;
          })
          .join("\n")}
      </ul>`
    : `<p class="empty">받은 메일이 없습니다.</p>`;

  const pager = `<div class="pager">
    ${info.hasPrev ? `<a href="/email?page=${info.page - 1}">← 이전</a>` : `<span class="disabled">← 이전</span>`}
    <span>${info.page + 1}페이지</span>
    ${info.hasNext ? `<a href="/email?page=${info.page + 1}">다음 →</a>` : `<span class="disabled">다음 →</span>`}
  </div>`;

  return `<h1>받은 메일함</h1>${rows}${pager}`;
}

export function renderEmailListPage(
  items: EmailIndexEntry[],
  info: EmailListPageInfo,
  noteStates: Map<string, EmailNoteState> = new Map(),
): string {
  return page("받은 메일함", renderEmailListBody(items, info, noteStates));
}

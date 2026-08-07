import type { Email, Address, Attachment } from "postal-mime";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAddress(addr: Address | undefined): string {
  if (!addr) return "-";
  return addr.name ? `${addr.name} <${addr.address}>` : (addr.address ?? "-");
}

function formatAddressList(addrs: Address[] | undefined): string {
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

const PAGE_STYLE = `
  body { font-family: -apple-system, "Malgun Gothic", sans-serif; max-width: 900px; margin: 0 auto; padding: 24px 16px; color: #171717; }
  @media (prefers-color-scheme: dark) { body { color: #ededed; background: #0a0a0a; } a { color: #8ab4ff; } }
  h1 { font-size: 1.25rem; margin: 0 0 16px; word-break: break-word; }
  dl { display: grid; grid-template-columns: 5em 1fr; gap: 4px 12px; font-size: 0.875rem; opacity: 0.85; margin: 0 0 20px; }
  dt { font-weight: 600; }
  dd { margin: 0; word-break: break-word; }
  .toolbar { display: flex; gap: 12px; margin-bottom: 20px; font-size: 0.875rem; }
  .body-frame { width: 100%; height: 70vh; border: 1px solid rgba(128,128,128,.3); border-radius: 8px; }
  .body-text { white-space: pre-wrap; word-break: break-word; border: 1px solid rgba(128,128,128,.3); border-radius: 8px; padding: 16px; font-size: 0.9rem; }
  .attachments { margin-top: 20px; font-size: 0.875rem; }
  .attachments ul { padding-left: 20px; }
`;

function page(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function renderErrorPage(title: string, message: string): string {
  return page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`);
}

export function renderEmailPage(id: string, email: Email): string {
  // id는 URL 경로에서 그대로 옵니다 — 지금은 항상 서버가 생성한 랜덤 hex라
  // 위험한 문자가 들어올 일이 없지만, href에 그대로 꽂아 넣는 값이라 방어적으로
  // escape 해둡니다.
  const safeId = escapeHtml(id);
  const subject = email.subject || "(제목 없음)";
  const attachments: Attachment[] = email.attachments ?? [];

  const bodyHtml = email.html
    ? `<iframe class="body-frame" sandbox srcdoc="${escapeHtml(email.html)}"></iframe>`
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

  return page(
    subject,
    `
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
  `,
  );
}

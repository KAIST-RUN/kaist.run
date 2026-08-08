import { page, escapeHtml } from "./emailRender";
import type { MemberRecord } from "./members";

// backstage.kaist.run의 임시 홈. 관리자 권한 확인까지만 우선 구현하고,
// 실제 관리 기능(회원/지원서 등)은 여기에 이어서 추가할 예정입니다.
export function renderBackstageHome(member: MemberRecord): string {
  const displayName = member.name || "관리자";

  return page(
    "Backstage",
    `
    <h1>Backstage</h1>
    <p>안녕하세요, ${escapeHtml(displayName)}님. 관리자 권한이 확인되었습니다.</p>
    <p style="opacity:.6;font-size:.875rem;">여기에 관리 기능이 추가될 예정입니다.</p>
  `,
  );
}

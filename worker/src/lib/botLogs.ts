import type { Env } from "../types";

// 디스코드 봇 런타임 로그 수신/조회/보관기간 관리 (worker/migrations/0035_bot_logs.sql).
// 감사 기록이 아니라 "서버 콘솔 접근 권한이 없는 관리자가 봇 상태를 훑어보는 용도"라,
// 회원/이메일 데이터와 분리된 전용 테이블에 짧게만 보관합니다.

// 봇이 한 번에 보낼 수 있는 최대 줄 수/줄 길이 — 정상 사용(30초 배치, 초당 요청 매우
// 낮음)에선 절대 안 걸리는 한도지만, 시크릿이 유출되거나 봇 버그로 거대한 페이로드가
// 오는 경우까지 방어합니다. 초과분은 자르되(잘라서라도 남기는 게 요청 자체를 거부해
// 정보를 통째로 잃는 것보다 낫습니다) 응답 자체는 항상 200으로 돌려줍니다.
const MAX_LINES_PER_REQUEST = 500;
const MAX_LINE_LENGTH = 4000;

// 감사 기록이 아니므로 짧게만 보관합니다 — 현재 D1 사용량이 매우 적어(전체 <1MB)
// 이 기간에 별다른 근거는 없고, 나중에 저장 용량이 부담되면 이 상수만 줄이면 됩니다.
export const BOT_LOG_RETENTION_DAYS = 7;

// 시크릿이 유출되면 요청 빈도 제한이 없어(x-bot-secret만 맞으면 통과) 이 엔드포인트를
// 반복 호출해 7일 안에도 테이블을 계속 채울 수 있습니다. 요청 빈도 대신 "테이블 전체
// 행 수"에 절대 상한을 둬서, 호출 빈도와 무관하게 저장 용량 자체가 무한정 늘 수 없게
// 막습니다 — 줄당 최대 4000자(MAX_LINE_LENGTH)를 곱해도 최악 수십 MB 수준이라
// D1 한도에 전혀 위협이 안 되는 선입니다. 정상 사용(30초 배치)에선 7일치가 이 훨씬
// 아래에서 자연히 순환하므로 평소엔 절대 걸리지 않습니다.
const MAX_BOT_LOG_ROWS = 10000;

export function clampBotLogLines(lines: string[]): string[] {
  return lines.slice(0, MAX_LINES_PER_REQUEST).map((line) => (line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line));
}

// 한 번의 D1 왕복으로 전부 넣고, 같은 batch(원자적 트랜잭션)로 상한 초과분(가장 오래된
// 것부터)을 지웁니다. 상한 밑이면(대부분의 경우) 서브쿼리가 NULL을 돌려주고
// "id < NULL"은 항상 거짓이라 DELETE가 아무것도 안 지우고 조용히 끝납니다.
export async function appendBotLogs(env: Env, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const placeholders = lines.map((_, i) => `(?${i + 1})`).join(", ");
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare(`INSERT INTO bot_logs (line) VALUES ${placeholders}`).bind(...lines),
    env.CONTENT_DB.prepare(
      `DELETE FROM bot_logs WHERE id < (SELECT id FROM bot_logs ORDER BY id DESC LIMIT 1 OFFSET ?1)`,
    ).bind(MAX_BOT_LOG_ROWS - 1),
  ]);
}

export type BotLogRow = { id: number; line: string; receivedAt: string };

// 봇이 찍는 타임스탬프(UTC ISO 8601, 예: "2026-09-07T04:43:11.606Z")를 표시할 때만
// KST로 바꿔줍니다 — 저장된 line 자체는 절대 안 건드립니다(원본 그대로 보관해야
// 나중에 봇 쪽 로그와 대조할 때 혼선이 없음). 매치 안 되는 줄(타임스탬프가 다른
// 형식이거나 아예 없는 줄)은 원문 그대로 반환합니다.
//
// 보안 참고: 이 함수는 렌더링 파이프라인에서 escapeHtml보다 먼저 호출되므로(원본
// 텍스트를 대상으로 정규식 치환) 여기서 만드는 대체 문자열(숫자·"-"·":"·공백·"KST"만)
// 자체엔 HTML 메타문자가 없어 안전하지만, 그 뒤에도 항상 escapeHtml을 거쳐야 합니다
// (매치되지 않은 나머지 원문에 외부 API 에러 메시지 등 우리가 통제 못하는 텍스트가
// 섞여 있을 수 있음). 정규식 자체도 중첩/모호한 수량자가 없어 ReDoS 우려가 없고,
// 입력은 이미 줄당 최대 4000자로 잘려 있어(MAX_LINE_LENGTH) 매치 비용도 항상 상한이 있습니다.
const ISO_UTC_TIMESTAMP = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,6})?Z/g;

export function formatBotLogLineForDisplay(line: string): string {
  return line.replace(ISO_UTC_TIMESTAMP, (match, base: string, frac: string | undefined) => {
    const d = new Date(`${base}${frac ?? ""}Z`);
    if (Number.isNaN(d.getTime())) return match; // 파싱 실패 시 원문 그대로(안전한 폴백)

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    // 밀리초는 타임존 변환과 무관(오프셋이 초 단위 이상이라 소수부는 그대로 유지)이라
    // 원본 조각(frac)을 그대로 이어붙입니다. "KST" 표기는 UTC였던 원본과 헷갈리지
    // 않게 하기 위함입니다.
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}${frac ?? ""} KST`;
  });
}

// backstage 로그 뷰어용 — 최신순, 단순 ?before=id 커서 페이지네이션(총 개수를 셀
// 필요가 없어 COUNT 쿼리 없이 "다음 페이지 있음" 여부만 limit+1로 확인합니다).
export async function listBotLogs(env: Env, opts: { limit: number; beforeId?: number }): Promise<{ rows: BotLogRow[]; hasMore: boolean }> {
  const { limit, beforeId } = opts;
  const query = beforeId
    ? env.CONTENT_DB.prepare("SELECT id, line, received_at FROM bot_logs WHERE id < ?1 ORDER BY id DESC LIMIT ?2").bind(beforeId, limit + 1)
    : env.CONTENT_DB.prepare("SELECT id, line, received_at FROM bot_logs ORDER BY id DESC LIMIT ?1").bind(limit + 1);

  const { results } = await query.all<{ id: number; line: string; received_at: string }>();
  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;
  return { rows: page.map((r) => ({ id: r.id, line: r.line, receivedAt: r.received_at })), hasMore };
}

// 매시 정각 크론(index.ts::scheduled)이 호출 — purgeExpiredSessions와 같은 방식으로
// 보관기간 지난 행을 지웁니다.
export async function purgeOldBotLogs(env: Env): Promise<void> {
  await env.CONTENT_DB.prepare(`DELETE FROM bot_logs WHERE received_at <= datetime('now', '-${BOT_LOG_RETENTION_DAYS} days')`).run();
}

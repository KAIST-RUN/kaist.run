import type { Env } from "../types";

export class RosterSheetValidationError extends Error {}

// 구글 시트 URL(.../spreadsheets/d/<ID>/edit#gid=0)이든 순수 ID든 ID만 뽑아냅니다.
export function parseSheetIdOrUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new RosterSheetValidationError("구글 시트 링크 또는 ID를 입력해 주세요.");

  const match = trimmed.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;

  throw new RosterSheetValidationError("구글 시트 링크 형식을 알아볼 수 없습니다.");
}

// D1에 backstage로 연결해 둔 시트가 있으면 그 값, 없으면 빈 문자열입니다.
export async function getRosterSheetOverride(env: Env): Promise<string> {
  const row = await env.CONTENT_DB.prepare("SELECT sheet_id FROM roster_sheet WHERE id = 1").first<{
    sheet_id: string;
  }>();
  return row?.sheet_id ?? "";
}

// 실제로 동기화에 쓰이는 시트 ID입니다 — D1 override가 있으면 그걸, 없으면 지금까지
// 쓰던 ROSTER_ALL_TIME_SHEET_ID 시크릿을 그대로 씁니다(배포 직후에도 동작이 안 끊김).
export async function getEffectiveSheetId(env: Env): Promise<string> {
  const override = await getRosterSheetOverride(env);
  return override || env.ROSTER_ALL_TIME_SHEET_ID;
}

export async function setRosterSheetOverride(env: Env, sheetId: string): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO roster_sheet (id, sheet_id, updated_at) VALUES (1, ?1, datetime('now'))
     ON CONFLICT (id) DO UPDATE SET sheet_id = excluded.sheet_id, updated_at = datetime('now')`,
  )
    .bind(sheetId)
    .run();
}

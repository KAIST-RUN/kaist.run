import * as XLSX from "xlsx";
import type { Season } from "./content";

// 과거 학기 명단을 담은 엑셀(.xlsx) 일괄 등록 — 시트 하나가 학기 하나(시트 이름
// "2025-봄"/"2025-가을"), 1행은 헤더, 2행부터 학번/신청자/전화번호/이메일 순서.
// 전화번호·이메일은 읽지 않습니다 — 매칭은 학번만으로 하고(실제 파일 분석 결과
// 이메일이 비어있는 행이 학기가 오래될수록 많아서, 이메일을 매칭 조건에 넣으면
// 정작 옛날 학기를 놓치게 됨), semester_membership 테이블에 저장할 자리도 없습니다.

export type SemesterImportRow = { studentId: string; name: string };
export type SemesterImportSheet = { year: number; season: Season; rows: SemesterImportRow[] };
export type SemesterImportSkippedSheet = { name: string; reason: string };
export type ParsedSemesterImport = { sheets: SemesterImportSheet[]; skipped: SemesterImportSkippedSheet[] };

const SHEET_NAME_RE = /^(\d{4})-(봄|가을)$/;

export function parseSemesterSheetName(name: string): { year: number; season: Season } | null {
  const m = SHEET_NAME_RE.exec(name.trim());
  if (!m) return null;
  return { year: Number(m[1]), season: m[2] === "봄" ? "spring" : "fall" };
}

// 2026-가을(현재 학기) 이전 학기만 이 기능의 대상입니다 — 2026-봄까지는 이미
// 끝난 과거 학기라 일괄 등록 대상에 포함하고, 2026-가을은 정상 경로(디스코드
// 봇 신청 → 관리자 승인)로 관리되고 있어서 제외합니다. season 문자열을 그대로
// 비교하면 "spring" > "fall"이라 틀리므로 listSemesters와 같은 방식(가을=1/봄=0)
// 으로 정렬 키를 만들어 비교합니다.
function semesterSortKey(year: number, season: Season): number {
  return year * 10 + (season === "fall" ? 1 : 0);
}
const IMPORT_CUTOFF = semesterSortKey(2026, "fall");

export function isSemesterImportable(year: number, season: Season): boolean {
  return semesterSortKey(year, season) < IMPORT_CUTOFF;
}

export function parseSemesterImportWorkbook(buffer: ArrayBuffer): ParsedSemesterImport {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets: SemesterImportSheet[] = [];
  const skipped: SemesterImportSkippedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const parsed = parseSemesterSheetName(sheetName);
    if (!parsed) {
      skipped.push({ name: sheetName, reason: "시트 이름이 'YYYY-봄'/'YYYY-가을' 형식이 아님" });
      continue;
    }
    if (!isSemesterImportable(parsed.year, parsed.season)) {
      skipped.push({ name: sheetName, reason: "2026-가을 이후 학기는 대상이 아님" });
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const rows: SemesterImportRow[] = [];
    // 1행(헤더: 학번/신청자/전화번호/이메일)은 건너뜁니다.
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i] ?? [];
      const studentId = String(row[0] ?? "").trim();
      const name = String(row[1] ?? "").trim();
      if (!studentId) continue;
      rows.push({ studentId, name });
    }
    sheets.push({ year: parsed.year, season: parsed.season, rows });
  }

  return { sheets, skipped };
}

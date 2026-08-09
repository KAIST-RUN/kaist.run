// backstage 유저/학기별 명단 CSV 내보내기용 최소 RFC4180 인코더입니다.
// Windows Excel은 BOM 없는 UTF-8 CSV의 한글을 깨뜨리므로(이 저장소에서 PDF 생성 때도
// 같은 종류의 문제를 겪은 적 있음), toCsvDocument가 항상 파일 맨 앞에 BOM을 붙입니다.

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // 콤마/따옴표/개행이 하나라도 있으면 전체를 따옴표로 감싸고, 내부 따옴표는 두 배로.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

export function toCsvDocument(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)];
  return `﻿${lines.join("\r\n")}\r\n`;
}

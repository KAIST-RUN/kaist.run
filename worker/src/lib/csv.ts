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

// CSV export 화면에서 "필요한 열만 선택"하는 팝업(backstageRender.ts의
// renderCsvExportButton)과 실제 내보내기 라우트가 같은 열 목록을 공유하기 위한 타입입니다 —
// 열 정의를 데이터별 lib 파일(members.ts, semesters.ts, runforce.ts)에 한 번만 선언해두고
// 라우트(값 추출)와 렌더(체크박스 라벨) 양쪽에서 그 배열을 그대로 가져다 씁니다.
export type CsvColumn<T> = {
  key: string;
  label: string;
  value: (row: T) => string | number | null | undefined;
};

// 요청된 열 키(?cols=a,b,c)로 컬럼 정의를 걸러냅니다. 파라미터가 없거나(직접 URL을 친
// 경우) 걸러낸 결과가 하나도 안 남으면(잘못된 키만 들어온 경우) 전체 열로 되돌아가
// 항상 비어있지 않은 CSV가 나가게 합니다.
export function selectCsvColumns<T>(columns: CsvColumn<T>[], requestedKeys: string[] | undefined): CsvColumn<T>[] {
  if (!requestedKeys?.length) return columns;
  const selected = columns.filter((c) => requestedKeys.includes(c.key));
  return selected.length ? selected : columns;
}

export function toCsvDocumentFromColumns<T>(columns: CsvColumn<T>[], rows: T[]): string {
  return toCsvDocument(
    columns.map((c) => c.label),
    rows.map((row) => columns.map((c) => c.value(row))),
  );
}

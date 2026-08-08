import type { ArchiveResource, ArchiveJudge, ContactInfoRow, ContactSocial } from "./content";

// 아카이브/연락처의 중첩 필드(자료 목록, 심사 저지, 연락처 행, SNS 목록)는 동적으로
// 행을 추가/삭제하는 UI 대신, 한 줄에 "필드1 | 필드2" 형태로 적는 간단한 텍스트
// 문법으로 받습니다 — 클라이언트 자바스크립트 없이 <textarea> 하나로 처리하기
// 위함입니다. 각 함수는 폼 표시용(serialize)과 제출 파싱용(parse) 짝입니다.

function splitLine(line: string): string[] {
  return line.split("|").map((part) => part.trim());
}

export function parseResourcesText(text: string): ArchiveResource[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [file, label] = splitLine(line);
      return { file, label: label || file };
    });
}

export function serializeResources(items: ArchiveResource[]): string {
  return items.map((r) => `${r.file} | ${r.label}`).join("\n");
}

export function parseJudgesText(text: string): ArchiveJudge[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url] = splitLine(line);
      return { name, url: url || "" };
    });
}

export function serializeJudges(items: ArchiveJudge[]): string {
  return items.map((j) => `${j.name} | ${j.url}`).join("\n");
}

// 연락처 "정보" 행: 빈 줄로 블록을 구분, 블록의 첫 줄이 라벨(예: "회장"),
// 나머지 줄이 "내용" 또는 "내용 | mailto:..." 형태의 항목들입니다.
export function parseInfoText(text: string): ContactInfoRow[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const [label, ...rest] = lines;
      return {
        label,
        lines: rest.map((line) => {
          const [text, href] = splitLine(line);
          return href ? { text, href } : { text };
        }),
      };
    });
}

export function serializeInfo(rows: ContactInfoRow[]): string {
  return rows
    .map((row) =>
      [row.label, ...row.lines.map((l) => (l.href ? `${l.text} | ${l.href}` : l.text))].join("\n"),
    )
    .join("\n\n");
}

export function parseSocialsText(text: string): ContactSocial[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [platform, label, url] = splitLine(line);
      return { platform, label: label || platform, url: url || "" };
    });
}

export function serializeSocials(items: ContactSocial[]): string {
  return items.map((s) => `${s.platform} | ${s.label} | ${s.url}`).join("\n");
}

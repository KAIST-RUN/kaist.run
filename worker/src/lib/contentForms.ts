import type { ArchiveResource, ArchiveJudge } from "./content";

// 아카이브의 중첩 필드(자료 목록, 심사 저지)는 동적으로 행을 추가/삭제하는 UI 대신,
// 한 줄에 "필드1 | 필드2" 형태로 적는 간단한 텍스트 문법으로 받습니다 — 클라이언트
// 자바스크립트 없이 <textarea> 하나로 처리하기 위함입니다. 각 함수는 폼 표시용
// (serialize)과 제출 파싱용(parse) 짝입니다.

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

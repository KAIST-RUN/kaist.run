import { fetchContentJson } from "./api";

// apply-form과 마찬가지로 로케일 구분이 없습니다 — 번역이 없는 한국어 단일 문서라서요.
export type Bylaws = {
  content: string;
  updated_at: string;
};

export async function getBylaws(): Promise<Bylaws | null> {
  return fetchContentJson<Bylaws>("/bylaws");
}

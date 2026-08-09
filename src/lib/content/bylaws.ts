import { fetchContentJson } from "./api";
import type { BylawsDocument } from "@/lib/bylaws";

// apply-form과 마찬가지로 로케일 구분이 없습니다 — 번역이 없는 한국어 문서라서요.
// "역대 회칙"이라 slug로 여러 버전이 있고, effective_date가 가장 최신인 게 /bylaws의
// "현재 버전"입니다(worker/src/lib/content.ts의 getCurrentBylawsVersion 참고).
export type BylawsVersion = BylawsDocument & {
  slug: string;
  versionLabel: string;
  effectiveDate: string;
  updated_at: string;
};

export type BylawsVersionSummary = Omit<BylawsVersion, "revisionHistory" | "blocks">;

export async function getCurrentBylaws(): Promise<BylawsVersion | null> {
  return fetchContentJson<BylawsVersion>("/bylaws");
}

export async function getBylawsVersion(slug: string): Promise<BylawsVersion | null> {
  return fetchContentJson<BylawsVersion>(`/bylaws/${slug}`);
}

export async function listBylawsVersions(): Promise<BylawsVersionSummary[]> {
  return (await fetchContentJson<BylawsVersionSummary[]>("/bylaws-versions")) ?? [];
}

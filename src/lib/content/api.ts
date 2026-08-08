// 공지/아카이브/연락처는 이제 content/ 마크다운이 아니라 Worker(D1)에서 옵니다.
// 이 사이트는 완전 정적 export라 이 fetch들은 전부 `next build` 시점(서버/빌드
// 환경, GitHub Actions)에서만 실행됩니다 — 브라우저에서 실행되지 않습니다.
//
// 로컬에서 콘텐츠 변경을 바로 보고 싶으면 CONTENT_API_BASE_URL을
// http://localhost:8787/api/content로 바꿔서(.env.development.local) 로컬
// worker(npm run dev)를 가리키게 하세요. 기본값은 프로덕션 Worker입니다.
const API_BASE = process.env.CONTENT_API_BASE_URL ?? "https://kaist.run/api/content";

export async function fetchContentJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Content API request failed: ${path} → ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

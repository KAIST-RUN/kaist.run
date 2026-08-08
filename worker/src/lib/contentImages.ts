import type { Env } from "../types";

export type ContentImage = {
  key: string;
  size: number;
  uploaded: string; // ISO
  contentType: string;
  folder: string | null;
};

const UNSORTED_FOLDER = "미분류";

function normalizeFolder(folder: string | undefined): string | null {
  const trimmed = folder?.trim();
  if (!trimmed) return null;
  // customMetadata 값(폴더명)에 그대로 들어가는 문자열이라 슬래시는 막아둡니다
  // (실제 R2 키/URL 구조엔 안 쓰이지만, 표시할 때 경로처럼 보이는 걸 방지).
  return trimmed.replace(/\//g, "-").slice(0, 60);
}

function randomId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "file";
}

// R2 key = 공개 URL의 kaist.run/content-images/ 뒤에 오는 부분과 그대로 같습니다
// (contentImages.ts 라우트가 :key를 그대로 R2 조회에 씀). 폴더는 실제 키 구조에는
// 안 들어가고(슬래시가 들어가면 라우팅이 복잡해짐) customMetadata로만 저장해서,
// 갤러리 화면에서 묶어 보여주는 용도로만 씁니다.
export async function storeContentImage(
  env: Env,
  filename: string,
  contentType: string,
  data: ArrayBuffer,
  folder?: string,
): Promise<string> {
  const key = `${randomId()}-${sanitizeFilename(filename)}`;
  const normalizedFolder = normalizeFolder(folder);
  await env.CONTENT_IMAGES.put(key, data, {
    httpMetadata: { contentType },
    customMetadata: normalizedFolder ? { folder: normalizedFolder } : undefined,
  });
  return key;
}

export async function listContentImages(env: Env): Promise<ContentImage[]> {
  const images: ContentImage[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.CONTENT_IMAGES.list({ cursor });
    for (const object of page.objects) {
      images.push({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded.toISOString(),
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        folder: object.customMetadata?.folder ?? null,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  images.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
  return images;
}

// 갤러리에서 폴더별로 묶을 때 씁니다. 폴더가 없는 이미지는 "미분류"로 모읍니다.
export function groupImagesByFolder(images: ContentImage[]): { folder: string; images: ContentImage[] }[] {
  const groups = new Map<string, ContentImage[]>();
  for (const image of images) {
    const key = image.folder ?? UNSORTED_FOLDER;
    const list = groups.get(key) ?? [];
    list.push(image);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === UNSORTED_FOLDER ? 1 : b === UNSORTED_FOLDER ? -1 : a.localeCompare(b)))
    .map(([folder, images]) => ({ folder, images }));
}

export async function getContentImage(env: Env, key: string) {
  return env.CONTENT_IMAGES.get(key);
}

export async function deleteContentImage(env: Env, key: string): Promise<void> {
  await env.CONTENT_IMAGES.delete(key);
}

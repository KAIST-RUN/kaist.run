import type { Env } from "../types";

// 공지/아카이브 본문에 넣을 파일(이미지 등)을 올려두는 범용 업로드함입니다.
// 이미지로 한정하지 않고 아무 파일이나 받고, kaist.run/upload/<key>로 공개됩니다.
export type UploadedFile = {
  key: string;
  size: number;
  uploaded: string; // ISO
  contentType: string;
};


function sanitizeFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "file";
}

function extname(name: string): string {
  const match = /\.[a-z0-9]+$/i.exec(name);
  return match ? match[0] : "";
}

export class UploadNameCollisionError extends Error {
  constructor(public readonly key: string) {
    super(`이미 같은 이름의 파일이 있습니다: ${key}`);
  }
}

// R2 key = 공개 URL의 kaist.run/upload/ 뒤에 오는 부분과 그대로 같습니다.
// desiredName을 주면 원본 파일명 대신 그걸 기반으로 key를 만듭니다(확장자가
// 없으면 원본 파일의 확장자를 붙여줍니다).
//
// R2가 파일명을 그대로 키로 쓰는 평평한(flat) 저장소라, 이름이 이미 있으면 조용히
// 덮어쓰거나 임의로 접두사를 붙이지 않고 그냥 거부합니다 — 관리자가 이름을 바꿔서
// 다시 올리면 됩니다.
export async function storeUpload(
  env: Env,
  filename: string,
  contentType: string,
  data: ArrayBuffer,
  desiredName?: string,
): Promise<string> {
  const trimmed = desiredName?.trim();
  const base = trimmed ? (extname(trimmed) ? trimmed : `${trimmed}${extname(filename)}`) : filename;
  const key = sanitizeFilename(base);
  if (await env.UPLOADS.head(key)) throw new UploadNameCollisionError(key);
  await env.UPLOADS.put(key, data, { httpMetadata: { contentType } });
  return key;
}

export async function listUploads(env: Env): Promise<UploadedFile[]> {
  const files: UploadedFile[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.UPLOADS.list({ cursor });
    for (const object of page.objects) {
      files.push({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded.toISOString(),
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  files.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
  return files;
}

export async function getUpload(env: Env, key: string) {
  return env.UPLOADS.get(key);
}

export async function deleteUpload(env: Env, key: string): Promise<void> {
  await env.UPLOADS.delete(key);
}

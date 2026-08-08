import type { Env } from "../types";

// 공지/아카이브 본문에 넣을 파일(이미지 등)을 올려두는 범용 업로드함입니다.
// 이미지로 한정하지 않고 아무 파일이나 받고, kaist.run/upload/<key>로 공개됩니다.
export type UploadedFile = {
  key: string;
  size: number;
  uploaded: string; // ISO
  contentType: string;
};

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

// R2 key = 공개 URL의 kaist.run/upload/ 뒤에 오는 부분과 그대로 같습니다.
export async function storeUpload(
  env: Env,
  filename: string,
  contentType: string,
  data: ArrayBuffer,
): Promise<string> {
  const key = `${randomId()}-${sanitizeFilename(filename)}`;
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

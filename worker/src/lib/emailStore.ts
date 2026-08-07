import type { Env } from "../types";

const EMAIL_KEY_PREFIX = "emails/";

function randomEmailId(): string {
  // 세션 id(session.ts)보다 짧게 — URL로 공유되니까요. 12바이트(96비트)면
  // 추측 불가능한 수준으로 충분합니다.
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// 원본 이메일(.eml, raw MIME)을 R2에 저장하고 새 id를 돌려줍니다.
export async function storeRawEmail(env: Env, raw: ArrayBuffer): Promise<string> {
  const id = randomEmailId();
  await env.EMAILS.put(`${EMAIL_KEY_PREFIX}${id}.eml`, raw, {
    httpMetadata: { contentType: "message/rfc822" },
  });
  return id;
}

export async function getRawEmail(env: Env, id: string): Promise<ArrayBuffer | null> {
  const object = await env.EMAILS.get(`${EMAIL_KEY_PREFIX}${id}.eml`);
  if (!object) return null;
  return object.arrayBuffer();
}

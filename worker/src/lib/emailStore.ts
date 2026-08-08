import type { Env } from "../types";

// 백필(emailIndex.ts)이 R2 전체를 순회할 때도 같은 프리픽스를 써야 해서 export합니다.
export const EMAIL_KEY_PREFIX = "emails/";
const EMAIL_KEY_SUFFIX = ".eml";

function randomEmailId(): string {
  // 세션 id(session.ts)보다 짧게 — URL로 공유되니까요. 12바이트(96비트)면
  // 추측 불가능한 수준으로 충분합니다.
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function keyForId(id: string): string {
  return `${EMAIL_KEY_PREFIX}${id}${EMAIL_KEY_SUFFIX}`;
}

// 원본 이메일(.eml, raw MIME)을 R2에 저장하고 새 id를 돌려줍니다.
export async function storeRawEmail(env: Env, raw: ArrayBuffer): Promise<string> {
  const id = randomEmailId();
  await env.EMAILS.put(keyForId(id), raw, {
    httpMetadata: { contentType: "message/rfc822" },
  });
  return id;
}

export async function getRawEmail(env: Env, id: string): Promise<ArrayBuffer | null> {
  const object = await env.EMAILS.get(keyForId(id));
  if (!object) return null;
  return object.arrayBuffer();
}

// 백필이 R2 list() 결과의 key(예: "emails/abcd1234.eml")에서 id만 뽑아낼 때 씁니다.
export function idFromKey(key: string): string | null {
  if (!key.startsWith(EMAIL_KEY_PREFIX) || !key.endsWith(EMAIL_KEY_SUFFIX)) return null;
  return key.slice(EMAIL_KEY_PREFIX.length, -EMAIL_KEY_SUFFIX.length);
}

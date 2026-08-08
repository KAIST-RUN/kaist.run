import PostalMime from "postal-mime";
import type { Env } from "../types";
import { EMAIL_KEY_PREFIX, getRawEmail, idFromKey } from "./emailStore";
import { formatAddress, formatAddressList } from "./emailRender";

const INDEX_PREFIX = "email:";

// 13자리(9,999,999,999,999)면 서기 2286년까지 안전합니다 — 그 이상은 신경 안 씁니다.
const MAX_REVERSE_TS = 9_999_999_999_999;
const REVERSE_TS_WIDTH = 13;

export type EmailIndexEntry = {
  id: string;
  subject: string;
  from: string;
  to: string;
  receivedAt: number; // epoch millis
};

function indexKey(id: string, receivedAt: number): string {
  const reverseTs = String(MAX_REVERSE_TS - receivedAt).padStart(REVERSE_TS_WIDTH, "0");
  return `${INDEX_PREFIX}${reverseTs}:${id}`;
}

// 목록 페이지가 KV 메타데이터 1KB 한도를 넉넉히 지키도록 문자열 길이를 자릅니다.
function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// 받은 이메일 하나를 목록 색인에 기록합니다. 목록 페이지(GET /email)가 R2 원본을
// 매번 파싱하지 않고 이 가벼운 KV 메타데이터만 읽도록 하기 위함입니다. 값(value)
// 자체는 안 쓰므로 빈 문자열로 두고, list()가 돌려주는 metadata만 사용합니다.
export async function indexEmail(env: Env, entry: EmailIndexEntry): Promise<void> {
  const key = indexKey(entry.id, entry.receivedAt);
  const metadata: EmailIndexEntry = {
    id: entry.id,
    subject: truncate(entry.subject, 200),
    from: truncate(entry.from, 150),
    to: truncate(entry.to, 150),
    receivedAt: entry.receivedAt,
  };
  await env.EMAIL_INDEX.put(key, "", { metadata });
}

// 최신순으로 최대 1,000건. 키가 이미 "역순타임스탬프:id"로 정렬돼 있어서 list() 1회
// 호출로 최신순 전체(사실상 동아리 메일함 전체 이력)를 가져올 수 있습니다 — 몇 번째
// 페이지를 요청하든 이 함수 호출은 항상 KV list() 1회입니다. 1,000건을 넘어가면
// (역순 정렬 덕분에) 가장 오래된 메일부터 빠집니다.
export async function listEmailIndex(env: Env): Promise<EmailIndexEntry[]> {
  const result = await env.EMAIL_INDEX.list<EmailIndexEntry>({ prefix: INDEX_PREFIX, limit: 1000 });
  const entries: EmailIndexEntry[] = [];
  for (const key of result.keys) {
    if (key.metadata) entries.push(key.metadata);
  }
  return entries;
}

export type BackfillResult = {
  total: number; // R2에 있는 전체 원본 메일 수
  indexed: number; // 이번에 새로 색인한 수 (이미 색인된 건 건너뜀)
};

// 이 기능을 배포하기 전에 이미 R2에 쌓여 있던 메일들을 위한 1회성 마이그레이션.
// 라이브 경로(email() 핸들러)는 수신 시각을 Date.now()로 기록하지만, 이미 지나간
// 메일은 그 순간을 알 수 없으니 R2 객체의 uploaded(실제 저장 시각)를 대신 씁니다.
//
// 이미 색인된 id는 건너뛰어서(먼저 listEmailIndex로 색인된 id 집합을 만듦), 라이브
// 경로가 이미 색인해둔 메일을 다른 receivedAt으로 다시 써서 같은 메일이 두 줄로
// 중복되는 일이 없게 합니다 — 이 덕분에 관리자가 몇 번을 다시 실행해도 안전합니다.
export async function backfillEmailIndex(env: Env): Promise<BackfillResult> {
  const already = new Set((await listEmailIndex(env)).map((e) => e.id));

  let total = 0;
  let indexed = 0;
  let cursor: string | undefined;

  do {
    const page = await env.EMAILS.list({ prefix: EMAIL_KEY_PREFIX, cursor });
    for (const object of page.objects) {
      const id = idFromKey(object.key);
      if (!id) continue;
      total++;
      if (already.has(id)) continue;

      const raw = await getRawEmail(env, id);
      if (!raw) continue;

      try {
        const parsed = await PostalMime.parse(raw);
        await indexEmail(env, {
          id,
          subject: parsed.subject || "(제목 없음)",
          from: formatAddress(parsed.from),
          to: formatAddressList(parsed.to),
          receivedAt: object.uploaded.getTime(),
        });
        indexed++;
      } catch (err) {
        console.error(`Failed to backfill index for email ${id}`, err);
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { total, indexed };
}

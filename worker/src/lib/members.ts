import type { Env } from "../types";
import { fetchMembersFromSheet, type MemberRecord } from "./googleSheets";

export type { MemberRecord };

const MEMBER_KEY_PREFIX = "member:";
// "member:" 프리픽스를 안 씁니다 — removeStaleMembers가 그 프리픽스로 나열한 키를
// 전부 discordId로 취급해서, 시트에 없는 키는 지워버립니다. 여기에 두면 매 동기화마다
// 자기 자신이 "탈퇴한 회원"으로 오인되어 지워지는 꼴이 됩니다.
const LAST_SYNCED_KEY = "meta:members_last_synced_at";

export async function getMember(env: Env, discordId: string): Promise<MemberRecord | null> {
  const raw = await env.MEMBERS.get(`${MEMBER_KEY_PREFIX}${discordId}`);
  return raw ? (JSON.parse(raw) as MemberRecord) : null;
}

// backstage 홈 화면에 "마지막 동기화" 시각을 보여주기 위함.
export async function getMembersLastSyncedAt(env: Env): Promise<number | null> {
  const raw = await env.MEMBERS.get(LAST_SYNCED_KEY);
  return raw ? Number(raw) : null;
}

// backstage의 회원 명단 페이지용 — KV에 캐싱된 회원 전체를 가져옵니다. 회원 수가
// 많지 않아(역대 전체 다 합쳐도 수백 명 수준) 한 번에 다 읽어도 괜찮습니다.
export async function listMembers(env: Env): Promise<MemberRecord[]> {
  const members: MemberRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.MEMBERS.list({ prefix: MEMBER_KEY_PREFIX, cursor });
    const values = await Promise.all(page.keys.map((k) => env.MEMBERS.get(k.name)));
    for (const raw of values) {
      if (raw) members.push(JSON.parse(raw) as MemberRecord);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  members.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  return members;
}

export type SyncResult = {
  total: number; // 시트에서 읽은 전체 회원 수
  written: number; // 실제로 바뀌어서 KV에 다시 쓴 회원 수
  deleted: number; // 시트에서 빠져서 KV에서 지운 회원 수
};

// 시트에서 빠진(삭제된) 회원의 KV 항목을 지웁니다. 이게 없으면 시트에서 지운
// 사람도 계속 로그인 세션이 유효해서 예전 정보로 접속할 수 있게 됩니다 —
// /api/me가 getMember()로 매번 다시 확인하므로, 여기서 지우면 그 사람은
// 다음 /api/me 호출부터 바로 403으로 막힙니다(다시 로그인해도 not_member).
async function removeStaleMembers(env: Env, currentIds: Set<string>): Promise<number> {
  let deletedCount = 0;
  let cursor: string | undefined;

  do {
    const page = await env.MEMBERS.list({ prefix: MEMBER_KEY_PREFIX, cursor });
    const staleKeys = page.keys
      .map((k) => k.name)
      .filter((name) => !currentIds.has(name.slice(MEMBER_KEY_PREFIX.length)));

    await Promise.all(staleKeys.map((key) => env.MEMBERS.delete(key)));
    deletedCount += staleKeys.length;

    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return deletedCount;
}

// Google Sheets → KV로 회원 명단을 다시 채웁니다.
// index.ts의 scheduled(cron)와 routes/admin.ts(수동 트리거)에서 호출됩니다.
//
// KV 쓰기(write)는 무료 티어에서 하루 1,000회로 제한되어 있어서, 매번 전체를
// 덮어쓰지 않고 기존 값과 비교해 실제로 바뀐 회원만 씁니다. 대신 회원 수만큼
// 읽기(read)가 늘어나는데, 읽기는 하루 100,000회로 훨씬 여유롭습니다.
export async function syncMembersFromSheet(env: Env): Promise<SyncResult> {
  const members = await fetchMembersFromSheet(env);
  const currentIds = new Set(members.map((m) => m.discordId));

  const [results, deleted] = await Promise.all([
    Promise.all(
      members.map(async (member) => {
        const key = `${MEMBER_KEY_PREFIX}${member.discordId}`;
        const nextRaw = JSON.stringify(member);
        const existingRaw = await env.MEMBERS.get(key);
        if (existingRaw === nextRaw) return false; // 변경 없음 — 쓰기 생략

        await env.MEMBERS.put(key, nextRaw);
        return true;
      }),
    ),
    removeStaleMembers(env, currentIds),
  ]);

  await env.MEMBERS.put(LAST_SYNCED_KEY, String(Date.now()));

  return { total: members.length, written: results.filter(Boolean).length, deleted };
}

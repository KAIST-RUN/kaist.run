import type { Env } from "../types";
import { fetchMembersFromSheet, type MemberRecord } from "./googleSheets";
import { getEffectiveSheetId, setRosterSheetOverride, parseSheetIdOrUrl } from "./rosterSheet";
import { fetchDiscordAvatarUrl } from "./discord";

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

// Discord 봇 토큰으로 동시에 너무 많이 요청하지 않도록 개수를 제한한 채로 아바타를
// 채웁니다. 실패(레이트리밋 소진, 5xx 등)한 항목은 그냥 Map에서 빠집니다 — 호출부가
// "이 discordId가 Map에 없으면 이전 캐시값 유지"로 구분해서 처리합니다.
const AVATAR_FETCH_CONCURRENCY = 5;

async function fetchAvatarsForMembers(env: Env, discordIds: string[]): Promise<Map<string, string | null>> {
  const avatars = new Map<string, string | null>();
  let index = 0;

  async function worker() {
    while (index < discordIds.length) {
      const discordId = discordIds[index++];
      try {
        avatars.set(discordId, await fetchDiscordAvatarUrl(env.DISCORD_BOT_TOKEN, discordId));
      } catch (err) {
        console.error(`Failed to fetch Discord avatar for ${discordId}`, err);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(AVATAR_FETCH_CONCURRENCY, discordIds.length) }, worker));
  return avatars;
}

// Google Sheets → KV로 회원 명단을 다시 채웁니다.
// index.ts의 scheduled(cron)와 routes/admin.ts(수동 트리거)에서 호출됩니다.
//
// KV 쓰기(write)는 무료 티어에서 하루 1,000회로 제한되어 있어서, 매번 전체를
// 덮어쓰지 않고 기존 값과 비교해 실제로 바뀐 회원만 씁니다. 대신 회원 수만큼
// 읽기(read)가 늘어나는데, 읽기는 하루 100,000회로 훨씬 여유롭습니다.
//
// sheetIdOverride를 안 주면 getEffectiveSheetId(env)로 알아서 결정합니다(D1에
// backstage로 연결해 둔 시트가 있으면 그걸, 없으면 기존 시크릿). connectRosterSheet가
// "새 시트가 진짜 동작하는지" 저장 전에 시험해볼 때만 명시적으로 넘겨줍니다.
export async function syncMembersFromSheet(env: Env, sheetIdOverride?: string): Promise<SyncResult> {
  const sheetId = sheetIdOverride ?? (await getEffectiveSheetId(env));
  const fetchedMembers = await fetchMembersFromSheet(env, sheetId);
  const currentIds = new Set(fetchedMembers.map((m) => m.discordId));
  const avatars = await fetchAvatarsForMembers(
    env,
    fetchedMembers.map((m) => m.discordId),
  );

  const [results, deleted] = await Promise.all([
    Promise.all(
      fetchedMembers.map(async (member) => {
        const key = `${MEMBER_KEY_PREFIX}${member.discordId}`;
        const existingRaw = await env.MEMBERS.get(key);
        const existing = existingRaw ? (JSON.parse(existingRaw) as MemberRecord) : null;

        // 이번에 못 가져왔으면(Map에 없음) 이전 캐시값을 그대로 둡니다 —
        // 일시적 오류로 멀쩡한 아바타가 지워지면 안 되니까요.
        const avatarUrl = avatars.has(member.discordId) ? (avatars.get(member.discordId) ?? null) : (existing?.avatarUrl ?? null);

        const next: MemberRecord = { ...member, avatarUrl };
        const nextRaw = JSON.stringify(next);
        if (existingRaw === nextRaw) return false; // 변경 없음 — 쓰기 생략

        await env.MEMBERS.put(key, nextRaw);
        return true;
      }),
    ),
    removeStaleMembers(env, currentIds),
  ]);

  await env.MEMBERS.put(LAST_SYNCED_KEY, String(Date.now()));

  return { total: fetchedMembers.length, written: results.filter(Boolean).length, deleted };
}

// backstage에서 "역대 명단 시트"를 새로 연결할 때 씁니다. 잘못된 링크를 저장해서
// 로그인/회원 시스템 전체가 막히는 일이 없도록, 실제로 한 번 동기화까지 성공해야만
// D1에 override로 저장합니다(실패하면 예외가 그대로 올라가고 아무것도 안 바뀜).
export async function connectRosterSheet(env: Env, sheetIdOrUrl: string): Promise<SyncResult> {
  const sheetId = parseSheetIdOrUrl(sheetIdOrUrl);
  const result = await syncMembersFromSheet(env, sheetId);
  await setRosterSheetOverride(env, sheetId);
  return result;
}

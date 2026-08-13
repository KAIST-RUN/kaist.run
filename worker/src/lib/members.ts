import type { Env } from "../types";
import { fetchDiscordAvatarUrl, fetchDiscordUserProfile } from "./discord";
import type { Season } from "./content";
import type { UserSemesterEntry } from "./semesters";

// 예전엔 구글 스프레드시트 → MEMBERS(KV) 캐시가 회원 데이터의 원천이었지만, 이제 D1의
// users/admins/semester_membership 테이블이 원천입니다(0012_users.sql). uid는
// discordId 대신 예측 불가능한 crypto.randomUUID()를 PK로 씁니다 — 나중에 Discord가
// 아닌 다른 로그인 수단이 생기거나, discordId 자체가 바뀌어야 하는 상황에서도 다른
// 테이블(semester_membership, admins)이 참조하는 값이 안 흔들리도록.

export class UserValidationError extends Error {}

export const NICKNAME_MAX_LENGTH = 32;

// 닉네임에서 막는 문자 — 출력은 어디서든 이스케이프되므로 XSS 목적이 아니라, 표시가
// 깨지거나 남을 사칭하는 걸 막기 위한 제한입니다.
//   \u0000-\u001F, \u007F-\u009F : 제어문자(줄바꿈·탭 포함) — 한 줄 표시가 깨짐
//   \u200B-\u200F, \uFEFF        : 폭 없는 문자 — 눈에 안 보여서 같은 이름처럼 위장 가능
//   \u202A-\u202E, \u2066-\u2069 : 양방향 제어문자 — 글자 순서를 뒤집어 위장 가능
//   < > & " '                    : 마크업/따옴표 — CSV·디스코드 메시지 등 앞으로 늘어날
//                                  출력 경로까지 감안한 보수적 차단
const FORBIDDEN_NICKNAME_CHARS =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF<>&"']/;

// 앞뒤 공백을 정리한 닉네임을 돌려줍니다. 빈 문자열은 "닉네임 없음"을 뜻하는 유효한
// 값이라 그대로 통과시킵니다(공백만 입력한 경우도 여기로 수렴).
export function normalizeNickname(raw: string): string {
  const nickname = raw.trim();
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    throw new UserValidationError(`닉네임은 ${NICKNAME_MAX_LENGTH}자를 넘을 수 없습니다.`);
  }
  if (FORBIDDEN_NICKNAME_CHARS.test(nickname)) {
    throw new UserValidationError(`닉네임에 사용할 수 없는 문자가 있습니다 (< > & " ' 및 보이지 않는 특수문자).`);
  }
  return nickname;
}

type RawUserRow = {
  uid: string;
  discord_id: string;
  name: string | null;
  email: string | null;
  student_id: string | null;
  phone: string | null;
  solved_ac: string | null;
  codeforces: string | null;
  atcoder: string | null;
  avatar_url: string | null;
  nickname: string | null;
  created_at: string;
  updated_at: string;
  is_admin: number;
  is_honorary: number;
  is_current_member: number;
  has_ever_approved: number;
};

export type UserRecord = {
  uid: string;
  discordId: string;
  name: string | null;
  email: string | null;
  studentId: string | null;
  phone: string | null;
  solvedAc: string | null;
  codeforces: string | null;
  atcoder: string | null;
  avatarUrl: string | null;
  // 실명(name)과 별개인 표시용 닉네임. NULL(아직 정해진 적 없음)과 ''(회원이 명시적으로
  // 비움)를 구분해서 저장하지만, 화면에는 둘 다 "닉네임 없음"으로 똑같이 보입니다
  // (0026_users_nickname.sql 참고). 회원 간 중복 허용.
  nickname: string | null;
  // 셋 다 저장 컬럼이 아니라 조회 시점에 admins/honorary_members/semester_membership을
  // 보고 계산합니다(별도 컬럼으로 두면 그 테이블들과 값이 어긋날 수 있어서) — 아래
  // USER_SELECT 참고. role/status와 달리 isHonoraryMember는 admins처럼 독립된
  // boolean입니다 — 명예회원이면서 동시에 관리자이거나, 아직 재학 중인 학기 소속
  // 회원이 명예회원으로 지정되는 것도 전부 가능해야 해서(회칙상 명예회원 지정은
  // 학기 소속 승인과 무관한 별개 절차) role/status 계산에 안 섞습니다.
  role: "member" | "admin";
  status: "applicant" | "member" | "alumni";
  isHonoraryMember: boolean;
  createdAt: string;
};

// is_current_member: "현재 학기"에 approved된 학기 소속이 있는지.
// has_ever_approved: 학기를 막론하고 approved된 적이 한 번이라도 있는지.
// role은 admins 테이블에, isHonoraryMember는 honorary_members 테이블에 존재하는지로 판정합니다.
const USER_SELECT = `
  SELECT u.*,
    EXISTS(SELECT 1 FROM admins a WHERE a.uid = u.uid) AS is_admin,
    EXISTS(SELECT 1 FROM honorary_members h WHERE h.uid = u.uid) AS is_honorary,
    EXISTS(
      SELECT 1 FROM semester_membership sm
      JOIN semesters s ON s.year = sm.year AND s.season = sm.season AND s.is_current = 1
      WHERE sm.uid = u.uid AND sm.status = 'approved'
    ) AS is_current_member,
    EXISTS(SELECT 1 FROM semester_membership sm WHERE sm.uid = u.uid AND sm.status = 'approved') AS has_ever_approved
  FROM users u
`;

function toUserRecord(row: RawUserRow): UserRecord {
  return {
    uid: row.uid,
    discordId: row.discord_id,
    name: row.name,
    email: row.email,
    studentId: row.student_id,
    phone: row.phone,
    solvedAc: row.solved_ac,
    codeforces: row.codeforces,
    atcoder: row.atcoder,
    avatarUrl: row.avatar_url,
    nickname: row.nickname,
    role: row.is_admin ? "admin" : "member",
    status: row.is_current_member ? "member" : row.has_ever_approved ? "alumni" : "applicant",
    isHonoraryMember: !!row.is_honorary,
    createdAt: row.created_at,
  };
}

// 로그인/세션 게이트의 핵심 조회입니다 (authGuard.ts::requireSession, auth.ts의 OAuth
// 콜백) — 예전 getMember(env, discordId)를 그대로 대체합니다.
export async function getUserByDiscordId(env: Env, discordId: string): Promise<UserRecord | null> {
  const row = await env.CONTENT_DB.prepare(`${USER_SELECT} WHERE u.discord_id = ?1`).bind(discordId).first<RawUserRow>();
  return row ? toUserRecord(row) : null;
}

export async function getUserByUid(env: Env, uid: string): Promise<UserRecord | null> {
  const row = await env.CONTENT_DB.prepare(`${USER_SELECT} WHERE u.uid = ?1`).bind(uid).first<RawUserRow>();
  return row ? toUserRecord(row) : null;
}

// backstage 유저 명단 페이지용 — 회원 수가 많지 않아(역대 전체 합쳐도 수백 명 수준)
// 한 번에 다 읽어도 괜찮습니다. SQLite엔 한글 collation이 없어서 기존 KV 시절과
// 동일하게 JS에서 localeCompare로 정렬합니다.
export async function listUsers(env: Env): Promise<UserRecord[]> {
  const { results } = await env.CONTENT_DB.prepare(`${USER_SELECT} ORDER BY u.created_at ASC`).all<RawUserRow>();
  const users = results.map(toUserRecord);
  users.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  return users;
}

export type UserInput = {
  discordId: string;
  name?: string | null;
  email?: string | null;
  studentId?: string | null;
  phone?: string | null;
  solvedAc?: string | null;
  codeforces?: string | null;
  atcoder?: string | null;
  avatarUrl?: string | null;
  // 생략(undefined)하면 Discord 표시 이름으로 채우고, ''를 명시하면 "닉네임 없음"으로 둡니다.
  nickname?: string | null;
};

// backstage "새 유저" 수동 등록용 — 이미 있는 discordId면 명확한 에러로 거부합니다
// (조용히 덮어쓰면 실수로 다른 사람 정보를 고칠 수 있어서 — 재등록/갱신은
// upsertUserByDiscordId가 따로 담당합니다).
export async function createUser(env: Env, input: UserInput): Promise<UserRecord> {
  const existing = await getUserByDiscordId(env, input.discordId);
  if (existing) throw new UserValidationError("이미 등록된 Discord 계정입니다.");

  // 아바타나 닉네임이 안 넘어왔으면 봇 토큰으로 Discord 프로필을 한 번 조회해서 채웁니다
  // (둘 다 같은 응답에 들어있어서 호출은 한 번). 그래야 backstage에서 방금 만든 유저도
  // 명단에 사진과 닉네임이 바로 뜹니다(그 사람이 아직 로그인한 적 없어도).
  // 실패해도 등록 자체는 막지 않고 해당 값만 비워둡니다.
  // 닉네임은 undefined일 때만 기본값을 채웁니다 — ''는 "닉네임 없음"을 명시적으로 고른
  // 것이라 Discord 이름으로 덮어쓰면 안 됩니다.
  // 봇 가입 경로(upsertUserByDiscordId)도 이 함수를 거치므로 두 경로가 같은 동작을 합니다.
  let avatarUrl = input.avatarUrl ?? null;
  let nickname = input.nickname === undefined ? null : normalizeNickname(input.nickname ?? "");
  if (avatarUrl === null || input.nickname === undefined) {
    try {
      const profile = await fetchDiscordUserProfile(env.DISCORD_BOT_TOKEN, input.discordId);
      if (profile) {
        if (avatarUrl === null) avatarUrl = profile.avatarUrl;
        if (input.nickname === undefined) {
          // Discord 표시 이름이 우리 규칙에 안 맞으면(제어문자/따옴표 등) 기본값을 포기하고
          // 비워둡니다 — 가입 자체를 막을 이유는 없습니다.
          try {
            nickname = normalizeNickname(profile.displayName);
          } catch {
            nickname = null;
          }
        }
      }
    } catch (err) {
      console.error(`Failed to fetch Discord profile for new user ${input.discordId}`, err);
    }
  }

  const uid = crypto.randomUUID();
  // ON CONFLICT DO NOTHING: 위의 "이미 있나" 확인과 이 INSERT 사이에는 Discord 프로필
  // 조회(외부 HTTP, 429면 수 초)가 끼어 있어서, 같은 사람의 가입 요청이 동시에 오면
  // (모집 기간 봇 재시도 등) 둘 다 확인을 통과하고 둘 다 INSERT에 도달할 수 있습니다.
  // 유니크 인덱스(idx_users_discord_id) 덕에 중복 행은 어차피 못 생기지만, 예전엔 진 쪽이
  // constraint 에러(=500)로 터졌습니다. 이제 조용히 0행 삽입이 되고, 아래에서 확인 시점과
  // 같은 에러로 바꿔 던집니다 — upsertUserByDiscordId가 이 에러를 받아 갱신 경로로
  // 넘어갑니다(race에서 진 쪽도 결국 성공 응답).
  const result = await env.CONTENT_DB.prepare(
    `INSERT INTO users (uid, discord_id, name, email, student_id, phone, solved_ac, codeforces, atcoder, avatar_url, nickname)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
     ON CONFLICT (discord_id) DO NOTHING`,
  )
    .bind(
      uid,
      input.discordId,
      input.name ?? null,
      input.email ?? null,
      input.studentId ?? null,
      input.phone ?? null,
      input.solvedAc ?? null,
      input.codeforces ?? null,
      input.atcoder ?? null,
      avatarUrl,
      nickname,
    )
    .run();
  if (result.meta.changes === 0) throw new UserValidationError("이미 등록된 Discord 계정입니다.");

  const created = await getUserByUid(env, uid);
  if (!created) throw new Error("Failed to read back just-created user");
  return created;
}

// 디스코드 봇의 "신규 회원가입"용 — discordId 기준으로 있으면 갱신, 없으면 새로 만듭니다
// (재실행해도 안전한 upsert). 넘어오지 않은(undefined) 필드는 기존 값을 그대로 둡니다.
// 신규 유저의 아바타 조회는 createUser가 담당합니다(backstage 수동 등록과 동일한 동작).
export async function upsertUserByDiscordId(
  env: Env,
  discordId: string,
  input: Omit<UserInput, "discordId">,
): Promise<{ uid: string; created: boolean }> {
  let existing = await getUserByDiscordId(env, discordId);

  if (!existing) {
    // 아바타 조회는 createUser가 알아서 합니다(안 넘기면 봇 토큰으로 채움).
    try {
      const created = await createUser(env, { discordId, ...input });
      return { uid: created.uid, created: true };
    } catch (err) {
      if (!(err instanceof UserValidationError)) throw err;
      // "이미 등록된 계정" — 우리 확인 이후에 동시 요청이 먼저 만든 경우입니다. 그 행을
      // 다시 읽어 갱신 경로로 넘어가면 race에서 진 쪽도 정상 응답이 됩니다. 재조회해도
      // 없다면 race가 아니라 진짜 검증 실패(닉네임 규칙 위반 등)이므로 그대로 던집니다.
      existing = await getUserByDiscordId(env, discordId);
      if (!existing) throw err;
    }
  }

  // 보낸(defined) 필드의 컬럼만 SET 합니다. 예전엔 existing을 읽어 메모리에서 병합한 뒤
  // 전 컬럼을 다시 썼는데, 그 사이(읽기~쓰기)에 회원이 마이페이지에서 닉네임/핸들을
  // 고치면 봇의 갱신이 그 값을 읽기 시점의 옛 값으로 조용히 되돌렸습니다(lost update).
  // 안 보낸 컬럼을 아예 안 건드리면 그 창 자체가 없습니다 — 같은 필드를 동시에 고치는
  // 경우만 남고, 그건 어느 쪽이 이기든 의도된 last-write-wins입니다.
  const sets: string[] = [];
  const binds: (string | null)[] = [existing.uid];
  const add = (column: string, value: string | null) => {
    binds.push(value);
    sets.push(`${column}=?${binds.length}`);
  };
  // 안 보내면(undefined) 회원이 마이페이지에서 정한 닉네임을 그대로 둡니다. 봇이 동기화할
  // 때마다 디스코드 이름을 실어 보내면 본인이 고른 닉네임을 덮어쓰게 되니, 바꿀 의도가
  // 있을 때만 nickname을 넣어 보내세요(isAdmin과 같은 주의점).
  if (input.nickname !== undefined) add("nickname", normalizeNickname(input.nickname ?? ""));
  if (input.name !== undefined) add("name", input.name);
  if (input.email !== undefined) add("email", input.email);
  if (input.studentId !== undefined) add("student_id", input.studentId);
  if (input.phone !== undefined) add("phone", input.phone);
  if (input.solvedAc !== undefined) add("solved_ac", input.solvedAc);
  if (input.codeforces !== undefined) add("codeforces", input.codeforces);
  if (input.atcoder !== undefined) add("atcoder", input.atcoder);

  if (sets.length > 0) {
    await env.CONTENT_DB.prepare(`UPDATE users SET ${sets.join(", ")}, updated_at=datetime('now') WHERE uid=?1`)
      .bind(...binds)
      .run();
  }
  return { uid: existing.uid, created: false };
}

export type AvatarRefreshResult = { total: number; updated: number; unchanged: number; failed: number };

// 한 번에 띄우는 Discord API 요청 수. 회원이 수백 명으로 늘어도 한 번의 클릭으로 끝나되,
// Discord 레이트리밋(전역 초당 수십 건)에 여유를 두는 정도로 잡았습니다. fetchDiscordAvatarUrl
// 자체도 429면 Retry-After만큼 기다렸다 한 번 재시도합니다.
const AVATAR_REFRESH_CONCURRENCY = 5;

// backstage 회원 명단의 "프로필 사진 갱신" 버튼 — 전체 유저의 아바타를 Discord에서 다시
// 읽어옵니다. 평소엔 로그인할 때마다 공짜로 갱신되지만(auth.ts::touchUserAvatar), 한 번도
// 로그인한 적 없는 회원은 등록 시점 사진에 머물러 있어서 이 수동 갱신이 필요합니다.
//
// 실패한 사람은 기존 사진을 그대로 둡니다 — fetchDiscordAvatarUrl은 "확인해보니 사진 없음"을
// null로, 일시적 실패(레이트리밋/5xx)는 예외로 구분해서 알려주므로(discord.ts 참고), 예외인
// 경우까지 null로 덮어쓰면 멀쩡한 사진이 사라집니다.
export async function refreshAllUserAvatars(env: Env): Promise<AvatarRefreshResult> {
  const users = await listUsers(env);
  const result: AvatarRefreshResult = { total: users.length, updated: 0, unchanged: 0, failed: 0 };

  for (let i = 0; i < users.length; i += AVATAR_REFRESH_CONCURRENCY) {
    const batch = users.slice(i, i + AVATAR_REFRESH_CONCURRENCY);
    await Promise.all(
      batch.map(async (user) => {
        try {
          const avatarUrl = await fetchDiscordAvatarUrl(env.DISCORD_BOT_TOKEN, user.discordId);
          if (avatarUrl === user.avatarUrl) {
            result.unchanged++;
            return;
          }
          await touchUserAvatar(env, user.discordId, avatarUrl);
          result.updated++;
        } catch (err) {
          console.error(`아바타 갱신 실패 (discordId=${user.discordId})`, err);
          result.failed++;
        }
      }),
    );
  }
  return result;
}

export type UserUpdateInput = {
  discordId: string;
  nickname: string; // '' = 닉네임 없음
  name: string | null;
  email: string | null;
  studentId: string | null;
  phone: string | null;
  solvedAc: string | null;
  codeforces: string | null;
  atcoder: string | null;
};

// backstage 유저 수정 페이지 저장 — discordId도 고칠 수 있게 합니다(오타 정정 등
// 드물지만 실제로 필요한 케이스라서), 단 다른 유저가 이미 쓰는 값이면 거부합니다.
export async function updateUser(env: Env, uid: string, input: UserUpdateInput): Promise<void> {
  const conflict = await getUserByDiscordId(env, input.discordId);
  if (conflict && conflict.uid !== uid) {
    throw new UserValidationError("이미 다른 유저가 쓰고 있는 Discord ID입니다.");
  }

  await env.CONTENT_DB.prepare(
    `UPDATE users SET discord_id=?2, name=?3, email=?4, student_id=?5, phone=?6, solved_ac=?7, codeforces=?8, atcoder=?9, nickname=?10, updated_at=datetime('now')
     WHERE uid=?1`,
  )
    .bind(
      uid,
      input.discordId,
      input.name,
      input.email,
      input.studentId,
      input.phone,
      input.solvedAc,
      input.codeforces,
      input.atcoder,
      normalizeNickname(input.nickname),
    )
    .run();
}

// 마이페이지 본인 수정용 — 세션으로 확인된 본인 uid에 대해 닉네임 하나만 고칩니다.
// 빈 문자열도 유효한 값("닉네임 없음")이라 그대로 저장합니다.
export async function updateUserNickname(env: Env, uid: string, rawNickname: string): Promise<void> {
  const nickname = normalizeNickname(rawNickname);
  await env.CONTENT_DB.prepare("UPDATE users SET nickname=?2, updated_at=datetime('now') WHERE uid=?1").bind(uid, nickname).run();
}

export type OwnHandlesInput = { solvedAc: string | null; codeforces: string | null; atcoder: string | null };

// 마이페이지 본인 수정용 — backstage의 updateUser(전체 필드 + discordId 충돌 검사)와
// 달리, 세션으로 이미 확인된 본인 uid에 대해 핸들 3개만 딱 고칩니다. 이름/이메일/
// 학번/Discord ID는 여기서 절대 안 건드립니다(신원 관련 필드라 본인 수정 범위 밖 —
// 그건 계속 backstage 관리자만 고칠 수 있음).
export async function updateUserHandles(env: Env, uid: string, input: OwnHandlesInput): Promise<void> {
  await env.CONTENT_DB.prepare(`UPDATE users SET solved_ac=?2, codeforces=?3, atcoder=?4, updated_at=datetime('now') WHERE uid=?1`)
    .bind(uid, input.solvedAc, input.codeforces, input.atcoder)
    .run();
}

// 로그인 성공 시(routes/auth.ts) 매번 호출해서 아바타를 최신으로 맞춥니다 — Discord
// OAuth 응답에 이미 들어있는 값이라 추가 API 호출 없이 공짜로 갱신됩니다. backstage
// 명단은 이렇게 "로그인할 때마다 갱신"되는 캐시라, 오래 로그인 안 한 사람의 아바타는
// (거의 안 바뀌는 값이라) 다소 오래될 수 있지만 치명적이지 않습니다.
export async function touchUserAvatar(env: Env, discordId: string, avatarUrl: string | null): Promise<void> {
  await env.CONTENT_DB.prepare("UPDATE users SET avatar_url = ?2, updated_at = datetime('now') WHERE discord_id = ?1")
    .bind(discordId, avatarUrl)
    .run();
}

export async function deleteUser(env: Env, uid: string): Promise<void> {
  // FK cascade가 없으므로(이 저장소의 다른 마이그레이션과 같은 관례) 순서대로 지웁니다.
  // runforce_results는 이 유저 본인 행(WHERE uid=?1)만 지우므로, 이 유저가 참가했던
  // 대회의 다른 회원 final_rank/score는 전혀 안 건드립니다(RUNFORCE의 "삭제해도 남의
  // 점수에 영향 없음" 요구사항이 이 스코프만으로 자동 성립 — worker/src/lib/runforce.ts 참고).
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare("DELETE FROM semester_membership WHERE uid = ?1").bind(uid),
    env.CONTENT_DB.prepare("DELETE FROM admins WHERE uid = ?1").bind(uid),
    env.CONTENT_DB.prepare("DELETE FROM honorary_members WHERE uid = ?1").bind(uid),
    env.CONTENT_DB.prepare("DELETE FROM runforce_results WHERE uid = ?1").bind(uid),
    env.CONTENT_DB.prepare("DELETE FROM users WHERE uid = ?1").bind(uid),
  ]);
}

export async function grantAdmin(env: Env, uid: string, grantedByUid: string | null, grantedByName: string | null): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO admins (uid, granted_by_uid, granted_by_name) VALUES (?1, ?2, ?3)
     ON CONFLICT (uid) DO NOTHING`,
  )
    .bind(uid, grantedByUid, grantedByName)
    .run();
}

export async function revokeAdmin(env: Env, uid: string): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM admins WHERE uid = ?1").bind(uid).run();
}

export async function listAdmins(env: Env): Promise<UserRecord[]> {
  // USER_SELECT의 EXISTS() 서브쿼리 안에서도 "admins a"라는 별칭을 쓰므로, 여기 바깥
  // JOIN엔 헷갈리지 않게 다른 별칭(am)을 씁니다(서로 다른 스코프라 실제로 충돌하진
  // 않지만, 굳이 헷갈릴 이유가 없음).
  const { results } = await env.CONTENT_DB.prepare(`${USER_SELECT} JOIN admins am ON am.uid = u.uid ORDER BY am.granted_at ASC`).all<RawUserRow>();
  return results.map(toUserRecord);
}

// admins와 정확히 같은 모양 — 명예회원 지정/해제/목록. 지정은 backstage 유저 수정
// 페이지의 체크박스에서, 해제는 명예회원 탭 목록에서 합니다.
export async function grantHonoraryMember(env: Env, uid: string, grantedByUid: string | null, grantedByName: string | null): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO honorary_members (uid, granted_by_uid, granted_by_name) VALUES (?1, ?2, ?3)
     ON CONFLICT (uid) DO NOTHING`,
  )
    .bind(uid, grantedByUid, grantedByName)
    .run();
}

export async function revokeHonoraryMember(env: Env, uid: string): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM honorary_members WHERE uid = ?1").bind(uid).run();
}

export async function listHonoraryMembers(env: Env): Promise<UserRecord[]> {
  // listAdmins와 같은 이유로 바깥 JOIN 별칭을 hm으로 따로 씁니다.
  const { results } = await env.CONTENT_DB.prepare(
    `${USER_SELECT} JOIN honorary_members hm ON hm.uid = u.uid ORDER BY hm.granted_at ASC`,
  ).all<RawUserRow>();
  return results.map(toUserRecord);
}

// solved.ac/Codeforces/AtCoder 핸들 목록 — 디스코드 봇이 랭킹/문제 풀이 현황을
// 긁어올 때 씁니다(worker/src/routes/bot.ts). 핸들은 별도 테이블이 아니라 users의
// 컬럼 하나씩입니다 — 사이트당 핸들 하나면 충분하고(같은 사람이 여러 계정을 등록할
// 일이 거의 없음), backstage 유저 수정 페이지에서 이미 이 컬럼들을 직접 편집합니다.
export type BotMemberRosterEntry = {
  discordId: string;
  studentId: string | null;
  name: string | null;
  nickname: string | null;
  // 신청만 하고 아직 승인 안 된 학기(status: 'pending')도 함께 나옵니다 — /api/me와 같은
  // 모양입니다(semesters.ts::UserSemesterEntry). 봇이 학기 역할을 부여할 땐 반드시
  // status === 'approved'만 거르세요. 최신 학기가 먼저 옵니다.
  semesters: UserSemesterEntry[];
};

// 디스코드 봇이 주기적으로 전체 회원을 훑을 때 쓰는 최소 명단(worker/src/routes/bot.ts).
// 이메일·전화번호 같은 민감 정보는 굳이 안 내보냅니다 — 봇이 필요한 건 신원 매칭용
// 디스코드 UID와 표시용 학번/이름/닉네임, 그리고 학기 역할 동기화용 소속 학기뿐입니다.
//
// 학기는 유저마다 따로 조회하지 않고(회원 수만큼 쿼리가 늘어남) LEFT JOIN 한 방으로
// 가져와서 메모리에서 묶습니다 — listAllSemesterDiscordIds와 같은 방식입니다. LEFT JOIN이라
// 소속 학기가 하나도 없는 회원도 semesters: []로 빠짐없이 나옵니다.
export async function listBotMemberRoster(env: Env): Promise<BotMemberRosterEntry[]> {
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT u.discord_id, u.student_id, u.name, u.nickname, sm.year, sm.season, sm.status
     FROM users u
     LEFT JOIN semester_membership sm ON sm.uid = u.uid
     ORDER BY u.created_at ASC, sm.year DESC, (CASE sm.season WHEN 'fall' THEN 1 ELSE 0 END) DESC`,
  ).all<{
    discord_id: string;
    student_id: string | null;
    name: string | null;
    nickname: string | null;
    year: number | null;
    season: Season | null;
    status: "pending" | "approved" | null;
  }>();

  const byDiscordId = new Map<string, BotMemberRosterEntry>();
  for (const r of results) {
    if (!byDiscordId.has(r.discord_id)) {
      byDiscordId.set(r.discord_id, {
        discordId: r.discord_id,
        studentId: r.student_id,
        name: r.name,
        nickname: r.nickname,
        semesters: [],
      });
    }
    // 소속 학기가 없는 회원은 학기 컬럼이 전부 NULL인 행 하나로 옵니다(LEFT JOIN).
    if (r.year !== null && r.season !== null && r.status !== null) {
      byDiscordId.get(r.discord_id)!.semesters.push({ year: r.year, season: r.season, status: r.status });
    }
  }
  // Map은 삽입 순서를 유지하므로 위 SQL의 created_at ASC(가입 순)가 그대로 나갑니다.
  return [...byDiscordId.values()];
}

export type HandleSite = "solvedAc" | "codeforces" | "atcoder";
export type HandleEntry = { discordId: string; handle: string };

// 컬럼명은 여기 고정된 매핑에서만 나옵니다 — site는 호출부(bot.ts)가 이 타입으로
// 미리 검증해서 넘기므로, SQL에 사용자 입력이 그대로 흘러들어갈 일이 없습니다.
const HANDLE_COLUMN: Record<HandleSite, string> = { solvedAc: "solved_ac", codeforces: "codeforces", atcoder: "atcoder" };

// "역대 모든 인원"용 — 학기 소속과 무관하게 users 테이블 전체에서 그 사이트
// 핸들이 채워진 사람만 걸러냅니다(핸들이 없으면 목록에서 제외).
export async function listAllTimeHandles(env: Env, site: HandleSite): Promise<HandleEntry[]> {
  const column = HANDLE_COLUMN[site];
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT discord_id, ${column} AS handle FROM users WHERE ${column} IS NOT NULL AND ${column} != ''`,
  ).all<{ discord_id: string; handle: string }>();
  return results.map((r) => ({ discordId: r.discord_id, handle: r.handle }));
}

// "이번 학기 소속"용 — 현재 학기(semesters.is_current=1)에 approved된 사람 중
// 그 사이트 핸들이 채워진 사람만.
export async function listCurrentSemesterHandles(env: Env, site: HandleSite): Promise<HandleEntry[]> {
  const column = HANDLE_COLUMN[site];
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT u.discord_id, u.${column} AS handle
     FROM users u
     JOIN semester_membership sm ON sm.uid = u.uid AND sm.status = 'approved'
     JOIN semesters s ON s.year = sm.year AND s.season = sm.season AND s.is_current = 1
     WHERE u.${column} IS NOT NULL AND u.${column} != ''`,
  ).all<{ discord_id: string; handle: string }>();
  return results.map((r) => ({ discordId: r.discord_id, handle: r.handle }));
}

export type ActiveMemberHandle = { uid: string; name: string | null; avatarUrl: string | null; handle: string | null };

// RUNFORCE 랭킹용(worker/src/lib/runforce.ts) — 이번 학기 활동회원 "전원"을 uid 기준으로
// 돌려줍니다. listCurrentSemesterHandles와 달리 핸들이 없는 사람도 포함합니다 — RUNFORCE는
// 핸들 미등록자도 순위 계산에서 최하위 동점 그룹으로 넣어야 하므로 걸러내면 안 됩니다.
// discordId가 아니라 uid를 반환하는 것도 마찬가지 이유(runforce_results.uid가 이걸 그대로 저장).
export async function listActiveMembersWithHandle(env: Env, site: HandleSite): Promise<ActiveMemberHandle[]> {
  const column = HANDLE_COLUMN[site];
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT u.uid, u.name, u.avatar_url, u.${column} AS handle
     FROM users u
     JOIN semester_membership sm ON sm.uid = u.uid AND sm.status = 'approved'
     JOIN semesters s ON s.year = sm.year AND s.season = sm.season AND s.is_current = 1`,
  ).all<{ uid: string; name: string | null; avatar_url: string | null; handle: string | null }>();
  return results.map((r) => ({ uid: r.uid, name: r.name, avatarUrl: r.avatar_url, handle: r.handle }));
}

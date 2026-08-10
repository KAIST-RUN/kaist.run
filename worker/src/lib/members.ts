import type { Env } from "../types";
import { fetchDiscordAvatarUrl } from "./discord";

// 예전엔 구글 스프레드시트 → MEMBERS(KV) 캐시가 회원 데이터의 원천이었지만, 이제 D1의
// users/admins/semester_membership 테이블이 원천입니다(0012_users.sql). uid는
// discordId 대신 예측 불가능한 crypto.randomUUID()를 PK로 씁니다 — 나중에 Discord가
// 아닌 다른 로그인 수단이 생기거나, discordId 자체가 바뀌어야 하는 상황에서도 다른
// 테이블(semester_membership, admins)이 참조하는 값이 안 흔들리도록.

export class UserValidationError extends Error {}

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
};

// backstage "새 유저" 수동 등록용 — 이미 있는 discordId면 명확한 에러로 거부합니다
// (조용히 덮어쓰면 실수로 다른 사람 정보를 고칠 수 있어서 — 재등록/갱신은
// upsertUserByDiscordId가 따로 담당합니다).
export async function createUser(env: Env, input: UserInput): Promise<UserRecord> {
  const existing = await getUserByDiscordId(env, input.discordId);
  if (existing) throw new UserValidationError("이미 등록된 Discord 계정입니다.");

  const uid = crypto.randomUUID();
  await env.CONTENT_DB.prepare(
    `INSERT INTO users (uid, discord_id, name, email, student_id, phone, solved_ac, codeforces, atcoder, avatar_url)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
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
      input.avatarUrl ?? null,
    )
    .run();

  const created = await getUserByUid(env, uid);
  if (!created) throw new Error("Failed to read back just-created user");
  return created;
}

// 디스코드 봇의 "신규 회원가입"용 — discordId 기준으로 있으면 갱신, 없으면 새로 만듭니다
// (재실행해도 안전한 upsert). 넘어오지 않은(undefined) 필드는 기존 값을 그대로
// 두고, 아바타가 없는 신규 유저는 봇 토큰으로 한 번 best-effort 조회를 시도합니다
// (로그인 전에도 backstage 명단에서 프로필 사진이 보이도록 — 실패해도 등록 자체는
// 막지 않습니다).
export async function upsertUserByDiscordId(
  env: Env,
  discordId: string,
  input: Omit<UserInput, "discordId">,
): Promise<{ uid: string; created: boolean }> {
  const existing = await getUserByDiscordId(env, discordId);

  if (!existing) {
    let avatarUrl = input.avatarUrl ?? null;
    if (avatarUrl === null) {
      try {
        avatarUrl = await fetchDiscordAvatarUrl(env.DISCORD_BOT_TOKEN, discordId);
      } catch (err) {
        console.error(`Failed to fetch Discord avatar for new user ${discordId}`, err);
      }
    }
    const created = await createUser(env, { discordId, ...input, avatarUrl });
    return { uid: created.uid, created: true };
  }

  const next = {
    name: input.name !== undefined ? input.name : existing.name,
    email: input.email !== undefined ? input.email : existing.email,
    studentId: input.studentId !== undefined ? input.studentId : existing.studentId,
    phone: input.phone !== undefined ? input.phone : existing.phone,
    solvedAc: input.solvedAc !== undefined ? input.solvedAc : existing.solvedAc,
    codeforces: input.codeforces !== undefined ? input.codeforces : existing.codeforces,
    atcoder: input.atcoder !== undefined ? input.atcoder : existing.atcoder,
  };
  await env.CONTENT_DB.prepare(
    `UPDATE users SET name=?2, email=?3, student_id=?4, phone=?5, solved_ac=?6, codeforces=?7, atcoder=?8, updated_at=datetime('now')
     WHERE uid=?1`,
  )
    .bind(existing.uid, next.name, next.email, next.studentId, next.phone, next.solvedAc, next.codeforces, next.atcoder)
    .run();
  return { uid: existing.uid, created: false };
}

export type UserUpdateInput = {
  discordId: string;
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
    `UPDATE users SET discord_id=?2, name=?3, email=?4, student_id=?5, phone=?6, solved_ac=?7, codeforces=?8, atcoder=?9, updated_at=datetime('now')
     WHERE uid=?1`,
  )
    .bind(uid, input.discordId, input.name, input.email, input.studentId, input.phone, input.solvedAc, input.codeforces, input.atcoder)
    .run();
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
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare("DELETE FROM semester_membership WHERE uid = ?1").bind(uid),
    env.CONTENT_DB.prepare("DELETE FROM admins WHERE uid = ?1").bind(uid),
    env.CONTENT_DB.prepare("DELETE FROM honorary_members WHERE uid = ?1").bind(uid),
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

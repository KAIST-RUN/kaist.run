import type { Env } from "../types";
import type { Season } from "./content";
import type { CsvColumn } from "./csv";

// "학기별 활동회원" — 신규 회원가입(users 테이블)과 별개로, 각 학기 소속은 승인
// 워크플로를 거칩니다: 디스코드 봇이 requestSemesterMembership으로 pending을
// 만들고, backstage에서 관리자가 approve해야만 "그 학기에 소속됨"으로 칩니다.
// (0012_users.sql: semesters + semester_membership)

export class SemesterError extends Error {}

export type SemesterInfo = { year: number; season: Season; isCurrent: boolean; pendingCount: number };

export async function getCurrentSemester(env: Env): Promise<{ year: number; season: Season } | null> {
  const row = await env.CONTENT_DB.prepare("SELECT year, season FROM semesters WHERE is_current = 1").first<{
    year: number;
    season: Season;
  }>();
  return row ?? null;
}

// 최신 학기가 먼저 오도록 — season은 문자열이라 그냥 정렬하면 "spring" > "fall"이라
// 같은 해 안에서 봄이 가을보다 먼저(더 최신처럼) 나오는 오류가 생겨서, CASE로
// 가을=1/봄=0을 매겨 DESC 정렬합니다.
export async function listSemesters(env: Env): Promise<SemesterInfo[]> {
  // 학기별 명단 탭(/members/semesters)에서 학기명 옆에 대기중인 승인 요청 개수를
  // 바로 보여주기 위해 상관 서브쿼리로 같이 가져옵니다 — 학기가 몇 개든 쿼리 1번.
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT s.year, s.season, s.is_current,
       (SELECT COUNT(*) FROM semester_membership sm
        WHERE sm.year = s.year AND sm.season = s.season AND sm.status = 'pending') AS pending_count
     FROM semesters s
     ORDER BY s.year DESC, (CASE s.season WHEN 'fall' THEN 1 ELSE 0 END) DESC`,
  ).all<{ year: number; season: Season; is_current: number; pending_count: number }>();
  return results.map((r) => ({ year: r.year, season: r.season, isCurrent: !!r.is_current, pendingCount: r.pending_count }));
}

// 새 학기를 엽니다(이미 있으면 존재 확인만). makeCurrent면 기존 "현재 학기"를 내리고
// 이 학기를 올립니다 — batch()로 한 트랜잭션에 묶어서, 항상 최대 하나만 현재 학기인
// 상태(부분 유니크 인덱스가 최후 방어선)가 중간 상태 없이 유지되게 합니다.
export async function openSemester(env: Env, year: number, season: Season, makeCurrent: boolean): Promise<void> {
  const statements = [
    env.CONTENT_DB.prepare("INSERT INTO semesters (year, season, is_current) VALUES (?1, ?2, 0) ON CONFLICT (year, season) DO NOTHING").bind(
      year,
      season,
    ),
  ];
  if (makeCurrent) {
    statements.push(env.CONTENT_DB.prepare("UPDATE semesters SET is_current = 0 WHERE is_current = 1"));
    statements.push(env.CONTENT_DB.prepare("UPDATE semesters SET is_current = 1 WHERE year = ?1 AND season = ?2").bind(year, season));
  }
  await env.CONTENT_DB.batch(statements);
}

// 학기를 통째로 지웁니다 — 그 학기의 소속/승인 기록(semester_membership)도 함께
// 지웁니다. 안 지우면 나중에 같은 (year, season)을 다시 열었을 때 예전 기록이
// 그대로 되살아나 버립니다. is_current였던 학기를 지워도(=아무도 현재 학기가
// 아니게 됨) 별문제 없습니다 — users.status 계산은 "현재 학기에 approved됐는지"를
// EXISTS로 보는 거라, is_current인 행이 아예 없으면 그냥 전원 그 조건이 거짓이 될
// 뿐입니다(members.ts의 USER_SELECT 참고).
export async function deleteSemester(env: Env, year: number, season: Season): Promise<void> {
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare("DELETE FROM semester_membership WHERE year = ?1 AND season = ?2").bind(year, season),
    env.CONTENT_DB.prepare("DELETE FROM semesters WHERE year = ?1 AND season = ?2").bind(year, season),
  ]);
}

export type SemesterMembershipResult = { status: "pending" | "already_pending" | "already_approved" };

// 디스코드 봇의 "학기별 활동회원 등록". year/season을 생략하면 현재 학기로 등록합니다
// (봇이 학기 문자열을 하드코딩/추측하지 않게). 대상 학기가 아직 안 열려있으면 명확한
// 에러 — 봇이 오타/구버전 값으로 쓰레기 행을 만드는 걸 막는 안전장치입니다.
export async function requestSemesterMembership(env: Env, uid: string, year?: number, season?: Season): Promise<SemesterMembershipResult> {
  let targetYear = year;
  let targetSeason = season;

  if (targetYear === undefined || targetSeason === undefined) {
    const current = await getCurrentSemester(env);
    if (!current) throw new SemesterError("아직 열린 학기가 없습니다. backstage에서 먼저 학기를 열어주세요.");
    targetYear = current.year;
    targetSeason = current.season;
  } else {
    const exists = await env.CONTENT_DB.prepare("SELECT 1 FROM semesters WHERE year = ?1 AND season = ?2").bind(targetYear, targetSeason).first();
    if (!exists) throw new SemesterError(`${targetYear} ${targetSeason} 학기는 아직 열리지 않았습니다.`);
  }

  const existing = await env.CONTENT_DB.prepare("SELECT status FROM semester_membership WHERE uid = ?1 AND year = ?2 AND season = ?3")
    .bind(uid, targetYear, targetSeason)
    .first<{ status: "pending" | "approved" }>();
  if (existing) return { status: existing.status === "approved" ? "already_approved" : "already_pending" };

  // ON CONFLICT DO NOTHING: 위 확인과 이 INSERT 사이에 같은 사람의 요청이 동시에 끼면
  // (모집 기간 봇 재시도 등) 둘 다 확인을 통과합니다. PK(uid, year, season) 덕에 중복 행은
  // 어차피 못 생기지만, 예전엔 진 쪽이 constraint 에러(=500)로 터졌습니다. 이제 0행
  // 삽입이 되고, 그 경우 상대가 만든 행의 상태를 다시 읽어 정상 응답으로 돌려줍니다.
  const result = await env.CONTENT_DB.prepare(
    `INSERT INTO semester_membership (uid, year, season, status) VALUES (?1, ?2, ?3, 'pending')
     ON CONFLICT (uid, year, season) DO NOTHING`,
  )
    .bind(uid, targetYear, targetSeason)
    .run();
  if (result.meta.changes === 0) {
    const raced = await env.CONTENT_DB.prepare("SELECT status FROM semester_membership WHERE uid = ?1 AND year = ?2 AND season = ?3")
      .bind(uid, targetYear, targetSeason)
      .first<{ status: "pending" | "approved" }>();
    if (raced) return { status: raced.status === "approved" ? "already_approved" : "already_pending" };
    // 충돌이 났는데 재조회하니 행이 없다 = 그 찰나에 관리자가 거부/취소로 지운 경우.
    // "요청했다"고 답해놓고 실제로는 아무 행도 없으면 안 되니 한 번만 다시 삽입합니다.
    // 이것도 충돌하면 그새 또 다른 요청이 만든 것이므로 already_pending이 맞습니다.
    const retry = await env.CONTENT_DB.prepare(
      `INSERT INTO semester_membership (uid, year, season, status) VALUES (?1, ?2, ?3, 'pending')
       ON CONFLICT (uid, year, season) DO NOTHING`,
    )
      .bind(uid, targetYear, targetSeason)
      .run();
    if (retry.meta.changes === 0) return { status: "already_pending" };
  }
  return { status: "pending" };
}

export async function approveSemesterMembership(
  env: Env,
  uid: string,
  year: number,
  season: Season,
  adminUid: string | null,
  adminName: string | null,
): Promise<void> {
  await env.CONTENT_DB.prepare(
    `UPDATE semester_membership SET status='approved', approved_by_uid=?4, approved_by_name=?5, approved_at=datetime('now')
     WHERE uid=?1 AND year=?2 AND season=?3`,
  )
    .bind(uid, year, season, adminUid, adminName)
    .run();
}

// 승인 대기 중인 요청을 거부합니다(행을 그냥 지움 — 거부 이력을 남기는 기능은 필요해지면
// 나중에 status='rejected'를 추가하는 식으로 확장 가능).
export async function rejectSemesterMembership(env: Env, uid: string, year: number, season: Season): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM semester_membership WHERE uid=?1 AND year=?2 AND season=?3 AND status='pending'")
    .bind(uid, year, season)
    .run();
}

// 이미 승인된 소속을 취소합니다(예: 잘못 승인함).
export async function revokeSemesterMembership(env: Env, uid: string, year: number, season: Season): Promise<void> {
  await env.CONTENT_DB.prepare("DELETE FROM semester_membership WHERE uid=?1 AND year=?2 AND season=?3").bind(uid, year, season).run();
}

// backstage에서 관리자가 봇을 거치지 않고 기존 유저를 곧바로 그 학기에 추가(=즉시 승인)합니다.
export async function addSemesterMember(
  env: Env,
  uid: string,
  year: number,
  season: Season,
  adminUid: string | null,
  adminName: string | null,
): Promise<void> {
  await env.CONTENT_DB.prepare(
    `INSERT INTO semester_membership (uid, year, season, status, approved_by_uid, approved_by_name, approved_at)
     VALUES (?1, ?2, ?3, 'approved', ?4, ?5, datetime('now'))
     ON CONFLICT (uid, year, season) DO UPDATE SET
       status = 'approved', approved_by_uid = excluded.approved_by_uid,
       approved_by_name = excluded.approved_by_name, approved_at = excluded.approved_at`,
  )
    .bind(uid, year, season, adminUid, adminName)
    .run();
}

export type SemesterMemberRow = {
  uid: string;
  name: string | null;
  discordId: string;
  avatarUrl: string | null;
  studentId: string | null;
  email: string | null;
  status: "pending" | "approved";
  requestedAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
};

// backstage 학기별 명단 CSV 내보내기(/members/semesters/:year/:season/export.csv)의
// 열 정의 — MEMBER_EXPORT_COLUMNS(members.ts)와 같은 방식으로 라우트/렌더가 공유합니다.
export const SEMESTER_EXPORT_COLUMNS: CsvColumn<SemesterMemberRow>[] = [
  { key: "uid", label: "UID", value: (m) => m.uid },
  { key: "name", label: "이름", value: (m) => m.name },
  { key: "studentId", label: "학번", value: (m) => m.studentId },
  { key: "email", label: "이메일", value: (m) => m.email },
  { key: "discordId", label: "Discord ID", value: (m) => m.discordId },
  { key: "status", label: "상태", value: (m) => m.status },
  { key: "approvedByName", label: "승인자", value: (m) => m.approvedByName },
  { key: "approvedAt", label: "승인일시", value: (m) => m.approvedAt },
  { key: "requestedAt", label: "신청일시", value: (m) => m.requestedAt },
];

// 학기별 명단 backstage 페이지용 — pending/approved 둘 다 같이 내려주고, 화면에서
// 섹션을 나눕니다.
export async function listSemesterMembers(env: Env, year: number, season: Season): Promise<SemesterMemberRow[]> {
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT u.uid, u.name, u.discord_id, u.avatar_url, u.student_id, u.email,
            sm.status, sm.requested_at, sm.approved_by_name, sm.approved_at
     FROM semester_membership sm
     JOIN users u ON u.uid = sm.uid
     WHERE sm.year = ?1 AND sm.season = ?2`,
  )
    .bind(year, season)
    .all<{
      uid: string;
      name: string | null;
      discord_id: string;
      avatar_url: string | null;
      student_id: string | null;
      email: string | null;
      status: "pending" | "approved";
      requested_at: string;
      approved_by_name: string | null;
      approved_at: string | null;
    }>();

  const rows: SemesterMemberRow[] = results.map((r) => ({
    uid: r.uid,
    name: r.name,
    discordId: r.discord_id,
    avatarUrl: r.avatar_url,
    studentId: r.student_id,
    email: r.email,
    status: r.status,
    requestedAt: r.requested_at,
    approvedByName: r.approved_by_name,
    approvedAt: r.approved_at,
  }));
  rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  return rows;
}

export type UserSemesterEntry = { year: number; season: Season; status: "pending" | "approved" };

// /api/me용 — 이 유저가 신청했거나 소속된 학기 전부(최신순).
export async function getUserSemesters(env: Env, uid: string): Promise<UserSemesterEntry[]> {
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT year, season, status FROM semester_membership WHERE uid = ?1
     ORDER BY year DESC, (CASE season WHEN 'fall' THEN 1 ELSE 0 END) DESC`,
  )
    .bind(uid)
    .all<UserSemesterEntry>();
  return results;
}

export type SemesterDiscordIds = { year: number; season: Season; isCurrent: boolean; discordIds: string[] };

// 디스코드 봇용 — "모든 학기의 각 학기 소속 디스코드 ID 목록"(worker/src/routes/bot.ts).
// LEFT JOIN이라 아직 승인된 사람이 하나도 없는(막 연) 학기도 discordIds: []로 나옵니다
// (조용히 빠지는 대신 존재는 알 수 있게).
export async function listAllSemesterDiscordIds(env: Env): Promise<SemesterDiscordIds[]> {
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT s.year, s.season, s.is_current, u.discord_id
     FROM semesters s
     LEFT JOIN semester_membership sm ON sm.year = s.year AND sm.season = s.season AND sm.status = 'approved'
     LEFT JOIN users u ON u.uid = sm.uid
     ORDER BY s.year DESC, (CASE s.season WHEN 'fall' THEN 1 ELSE 0 END) DESC`,
  ).all<{ year: number; season: Season; is_current: number; discord_id: string | null }>();

  const bySemester = new Map<string, SemesterDiscordIds>();
  for (const r of results) {
    const key = `${r.year}-${r.season}`;
    if (!bySemester.has(key)) bySemester.set(key, { year: r.year, season: r.season, isCurrent: !!r.is_current, discordIds: [] });
    if (r.discord_id) bySemester.get(key)!.discordIds.push(r.discord_id);
  }
  // Map은 삽입 순서를 유지하므로, 위 SQL의 ORDER BY(최신순) 그대로 나갑니다.
  return [...bySemester.values()];
}

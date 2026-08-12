import type { Env } from "../types";
import { listActiveMembersWithHandle } from "./members";
import {
  fetchCodeforcesContestMeta,
  fetchCodeforcesContestRatingChanges,
  isCodeforcesContestRated,
  listCodeforcesContestsInRange,
} from "./codeforces";
import { fetchAtCoderContestMeta, fetchAtCoderStandings, isAtCoderContestRated, listAtCoderContestsInRange } from "./atcoder";

// RUNFORCE: 활동회원의 Codeforces/AtCoder 대회 성적을 다른 활동회원과 상대평가해 포인트로
// 환산하는 기능입니다 (worker/migrations/0018_runforce.sql 참고). 핵심 불변식은 "한 번
// 계산된 대회는 삭제 후 재추가하지 않는 한 절대 재계산되지 않는다"입니다 — 아래
// addTargetContest가 이 계약의 유일한 진입점입니다.

export class RunforceError extends Error {}

export type RunforcePlatform = "codeforces" | "atcoder";

// ---------- 설정 (싱글턴) ----------

export type RunforceConfig = {
  autoDiscoveryEnabled: boolean;
  rangeStartDate: string | null; // 'YYYY-MM-DD'
  rangeEndDate: string | null;
  updatedAt: string;
};

type RawConfigRow = { auto_discovery_enabled: number; range_start_date: string | null; range_end_date: string | null; updated_at: string };

export async function getRunforceConfig(env: Env): Promise<RunforceConfig> {
  const row = await env.CONTENT_DB.prepare(
    "SELECT auto_discovery_enabled, range_start_date, range_end_date, updated_at FROM runforce_config WHERE id = 1",
  ).first<RawConfigRow>();
  // 마이그레이션이 싱글턴 행을 미리 넣어두므로 이 시점엔 항상 있어야 하지만, 방어적으로 기본값을 둡니다.
  if (!row) return { autoDiscoveryEnabled: false, rangeStartDate: null, rangeEndDate: null, updatedAt: new Date().toISOString() };
  return {
    autoDiscoveryEnabled: !!row.auto_discovery_enabled,
    rangeStartDate: row.range_start_date,
    rangeEndDate: row.range_end_date,
    updatedAt: row.updated_at,
  };
}

export async function setRunforceConfig(
  env: Env,
  input: { autoDiscoveryEnabled: boolean; rangeStartDate: string | null; rangeEndDate: string | null },
): Promise<void> {
  if (input.autoDiscoveryEnabled && (!input.rangeStartDate || !input.rangeEndDate)) {
    throw new RunforceError("자동 탐색을 켜려면 시작일과 종료일을 모두 입력해야 합니다.");
  }
  await env.CONTENT_DB.prepare(
    `UPDATE runforce_config SET auto_discovery_enabled=?1, range_start_date=?2, range_end_date=?3, updated_at=datetime('now') WHERE id=1`,
  )
    .bind(input.autoDiscoveryEnabled ? 1 : 0, input.rangeStartDate, input.rangeEndDate)
    .run();
}

// ---------- 대상 대회 목록 ----------

export type RunforceContestSummary = {
  id: string;
  platform: RunforcePlatform;
  contestId: string;
  contestName: string;
  startTimeMs: number;
  source: "manual" | "auto";
  addedByName: string | null;
  addedAt: string;
  participantCount: number;
};

type RawContestRow = {
  id: string;
  platform: RunforcePlatform;
  contest_id: string;
  contest_name: string;
  start_time_ms: number;
  source: "manual" | "auto";
  added_by_name: string | null;
  added_at: string;
  participant_count_snapshot: number;
};

function toContestSummary(row: RawContestRow): RunforceContestSummary {
  return {
    id: row.id,
    platform: row.platform,
    contestId: row.contest_id,
    contestName: row.contest_name,
    startTimeMs: row.start_time_ms,
    source: row.source,
    addedByName: row.added_by_name,
    addedAt: row.added_at,
    participantCount: row.participant_count_snapshot,
  };
}

const CONTEST_ROW_SELECT =
  "SELECT id, platform, contest_id, contest_name, start_time_ms, source, added_by_name, added_at, participant_count_snapshot FROM runforce_contests";

export async function listTargetContests(env: Env): Promise<RunforceContestSummary[]> {
  const { results } = await env.CONTENT_DB.prepare(`${CONTEST_ROW_SELECT} ORDER BY start_time_ms DESC`).all<RawContestRow>();
  return results.map(toContestSummary);
}

async function getTargetContestByPlatformId(env: Env, platform: RunforcePlatform, contestId: string): Promise<RunforceContestSummary | null> {
  const row = await env.CONTENT_DB.prepare(`${CONTEST_ROW_SELECT} WHERE platform=?1 AND contest_id=?2`).bind(platform, contestId).first<RawContestRow>();
  return row ? toContestSummary(row) : null;
}

async function getTargetContestById(env: Env, rowId: string): Promise<RunforceContestSummary | null> {
  const row = await env.CONTENT_DB.prepare(`${CONTEST_ROW_SELECT} WHERE id=?1`).bind(rowId).first<RawContestRow>();
  return row ? toContestSummary(row) : null;
}

// ---------- 점수 공식 / 랭킹 계산 (순수함수) ----------

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

const SIGMOID_5 = sigmoid(5);
const SIGMOID_NEG5 = sigmoid(-5);

// score(x) = 300000 * (sigmoid(10*(x-0.5)) - sigmoid(-5)) / (sigmoid(5) - sigmoid(-5))
// x=1(1등)이면 정확히 300000점, x→0(최하위)이면 0에 가깝지만 음수는 없음.
// 반환값은 아직 내림 전 원시값입니다 — 대회별로 실제 적용(저장)되는 값은
// computeContestRanking에서 이 값을 내림한 정수입니다.
export function computeRunforceScore(x: number): number {
  const numerator = sigmoid(10 * (x - 0.5)) - SIGMOID_NEG5;
  const denominator = SIGMOID_5 - SIGMOID_NEG5;
  return 300000 * (numerator / denominator);
}

// 화면/CSV에 RUNFORCE 점수를 보여줄 때 공통으로 쓰는 표시 변환입니다. 저장/합산되는
// 실제 값(runforce_results.score, 총점)은 대회별로 내림한 정수 그대로지만, 사람이
// 보기엔 숫자가 너무 커서(최대 300000) 1000으로 나눈 실수로 축약해서 보여줍니다.
// 정수를 1000으로 나누면 소수점 이하가 최대 3자리이므로 toFixed(3)이 항상 정확하게
// 떨어집니다(부동소수점 표시 오차 걱정 없음).
export function formatRunforceDisplay(rawScore: number): string {
  return (rawScore / 1000).toFixed(3);
}

// crypto.getRandomValues 기반 진짜 난수(Math.random 아님) — 실제 배포 시 무작위 동점
// 처리에 씁니다. 테스트에서만 결정론적 rng를 주입합니다(computeContestRanking의 rng 인자).
function defaultRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export type RunforceRankInput = { uid: string; name: string | null; avatarUrl: string | null; handle: string | null };

export type RunforceRankedRow = {
  uid: string;
  name: string | null;
  avatarUrl: string | null;
  handle: string | null; // handle_snapshot — 계산 시점 핸들(참가 여부와 무관하게 등록돼 있었다면 그대로 저장)
  platformRank: number | null; // 미참가자(핸들 없음 또는 이 대회에 없음)는 null
  finalRank: number; // 0-indexed, 동점 무작위 처리 확정 후
  x: number;
  score: number;
};

// members: 이번 학기 활동회원 전원(핸들 없는 사람도 포함). platformRanks: 대회 원본
// 순위표를 handle(trim + 소문자 정규화)→rank로 만든 Map.
//
// 알고리즘:
//  1) total = members.length. 0이면 에러.
//  2) participants = handle이 있고 platformRanks에 있는 회원, platformRank 오름차순.
//     nonParticipants = 나머지 전부(핸들 없음 OR 그 대회에 없음).
//  3) participants를 platformRank가 같은 값끼리 버킷으로 묶고, 버킷 내부(2명 이상)만 셔플.
//     nonParticipants 그룹 전체도 하나의 동점 묶음으로 셔플.
//  4) [셔플된 버킷들을 rank 오름차순으로 이어붙임] + [셔플된 nonParticipants] 순서로 concat
//     → 이 순서의 인덱스가 그대로 0-indexed final_rank.
//  5) x = 1 - finalRank/total; score = floor(computeRunforceScore(x)) — 대회별로 내림한
//     정수를 "적용값"으로 저장합니다. 총점은 이 내림한 정수들의 합(= 대회마다 내림 후
//     합산)이지, 합산 후 한 번에 내림하는 게 아닙니다 — getRunforceLeaderboard/
//     getMemberRunforce의 SUM(score)이 이미 내림된 값들을 더하는 것이므로 자연히 그렇게 됩니다.
export function computeContestRanking(
  members: RunforceRankInput[],
  platformRanks: Map<string, number>,
  rng: () => number = defaultRng,
): RunforceRankedRow[] {
  const total = members.length;
  if (total === 0) throw new RunforceError("활동회원이 없어 랭킹을 계산할 수 없습니다.");

  type Working = RunforceRankInput & { platformRank: number | null };
  const working: Working[] = members.map((m) => {
    const key = m.handle ? m.handle.trim().toLowerCase() : null;
    const rank = key ? (platformRanks.get(key) ?? null) : null;
    return { ...m, platformRank: rank };
  });

  const participants = working.filter((w): w is Working & { platformRank: number } => w.platformRank !== null);
  const nonParticipants = working.filter((w) => w.platformRank === null);
  participants.sort((a, b) => a.platformRank - b.platformRank);

  const orderedParticipants: Working[] = [];
  let i = 0;
  while (i < participants.length) {
    let j = i;
    while (j < participants.length && participants[j].platformRank === participants[i].platformRank) j++;
    const bucket = participants.slice(i, j);
    if (bucket.length > 1) shuffleInPlace(bucket, rng);
    orderedParticipants.push(...bucket);
    i = j;
  }

  const shuffledNonParticipants = [...nonParticipants];
  if (shuffledNonParticipants.length > 1) shuffleInPlace(shuffledNonParticipants, rng);

  const finalOrder = [...orderedParticipants, ...shuffledNonParticipants];

  return finalOrder.map((w, idx) => {
    const x = 1 - idx / total;
    return {
      uid: w.uid,
      name: w.name,
      avatarUrl: w.avatarUrl,
      handle: w.handle,
      platformRank: w.platformRank,
      finalRank: idx,
      x,
      score: Math.floor(computeRunforceScore(x)),
    };
  });
}

// ---------- 대상 대회 추가/삭제 ----------

// 수동 추가(backstage POST)와 자동탐색(cron)이 공유하는 단일 원자적 흐름입니다. 이미
// 등록된 대회는 manual이면 에러, auto면 조용히 기존 값을 반환(재계산 절대 금지 —
// UNIQUE(platform, contest_id) 인덱스와 함께 이중 안전장치).
export async function addTargetContest(
  env: Env,
  platform: RunforcePlatform,
  contestIdRaw: string,
  addedBy: { uid: string | null; name: string | null },
  source: "manual" | "auto",
): Promise<RunforceContestSummary> {
  const contestId = contestIdRaw.trim();
  if (!contestId) throw new RunforceError("대회 ID를 입력해 주세요.");

  const existing = await getTargetContestByPlatformId(env, platform, contestId);
  if (existing) {
    if (source === "manual") throw new RunforceError("이미 등록된 대회입니다.");
    return existing;
  }

  const isRated = platform === "codeforces" ? await isCodeforcesContestRated(contestId) : await isAtCoderContestRated(contestId);
  if (!isRated) throw new RunforceError("rated 대회가 아니거나 아직 레이팅이 반영되지 않았습니다.");

  const meta = platform === "codeforces" ? await fetchCodeforcesContestMeta(contestId) : await fetchAtCoderContestMeta(contestId);
  if (!meta) throw new RunforceError("대회 정보를 찾을 수 없습니다. 대회 ID를 확인해 주세요.");

  const rankEntries =
    platform === "codeforces" ? await fetchCodeforcesContestRatingChanges(contestId) : await fetchAtCoderStandings(contestId);
  const platformRanks = new Map<string, number>();
  for (const entry of rankEntries) {
    const key = entry.handle.trim().toLowerCase();
    // 같은 핸들이 여러 번 나오면(있을 수 없지만 방어적으로) 더 좋은(작은) 순위를 우선.
    const current = platformRanks.get(key);
    if (current === undefined || entry.rank < current) platformRanks.set(key, entry.rank);
  }

  const members = await listActiveMembersWithHandle(env, platform);
  const ranked = computeContestRanking(members, platformRanks);

  const rowId = crypto.randomUUID();
  const statements = [
    env.CONTENT_DB.prepare(
      `INSERT INTO runforce_contests
         (id, platform, contest_id, contest_name, start_time_ms, source, added_by_uid, added_by_name, participant_count_snapshot)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    ).bind(rowId, platform, contestId, meta.name, meta.startTimeMs, source, addedBy.uid, addedBy.name, ranked.length),
    ...ranked.map((r) =>
      env.CONTENT_DB.prepare(
        `INSERT INTO runforce_results (contest_id, uid, handle_snapshot, platform_rank, final_rank, x, score)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      ).bind(rowId, r.uid, r.handle, r.platformRank, r.finalRank, r.x, r.score),
    ),
  ];
  await env.CONTENT_DB.batch(statements);

  const created = await getTargetContestById(env, rowId);
  if (!created) throw new Error("Failed to read back just-created RUNFORCE contest");
  return created;
}

// runforce_results → runforce_contests 순서로 지웁니다(같은 batch). 이게 그 대회의 무작위
// 동점 처리를 "다시 섞을 수 있는" 유일한 방법입니다 — 지운 뒤 addTargetContest로 같은
// (platform, contestId)를 다시 추가하면 새 UUID로 완전히 새로 계산됩니다.
export async function removeTargetContest(env: Env, contestRowId: string): Promise<void> {
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare("DELETE FROM runforce_results WHERE contest_id = ?1").bind(contestRowId),
    env.CONTENT_DB.prepare("DELETE FROM runforce_contests WHERE id = ?1").bind(contestRowId),
  ]);
}

// ---------- 조회 API (backstage 상세/리더보드, /api/me) ----------

export type RunforceContestDetail = RunforceContestSummary & { rows: RunforceRankedRow[] };

// live 회원 정보(이름/아바타)를 조인해서 보여줍니다 — handle_snapshot/final_rank/score는
// 저장된 스냅샷 그대로, 삭제된 유저는 users 테이블에 없어 LEFT JOIN 결과 이름/아바타가
// null로만 나오고(행 자체는 남아있음 — 다른 회원 순위에 영향 없음), 그마저도 uid만으로
// 식별 가능하니 참고용으로 표시합니다.
export async function getTargetContestDetail(env: Env, contestRowId: string): Promise<RunforceContestDetail | null> {
  const contest = await getTargetContestById(env, contestRowId);
  if (!contest) return null;

  const { results } = await env.CONTENT_DB.prepare(
    `SELECT r.uid, u.name, u.avatar_url, r.handle_snapshot, r.platform_rank, r.final_rank, r.x, r.score
     FROM runforce_results r
     LEFT JOIN users u ON u.uid = r.uid
     WHERE r.contest_id = ?1
     ORDER BY r.final_rank ASC`,
  )
    .bind(contestRowId)
    .all<{
      uid: string;
      name: string | null;
      avatar_url: string | null;
      handle_snapshot: string | null;
      platform_rank: number | null;
      final_rank: number;
      x: number;
      score: number;
    }>();

  const rows: RunforceRankedRow[] = results.map((r) => ({
    uid: r.uid,
    name: r.name,
    avatarUrl: r.avatar_url,
    handle: r.handle_snapshot,
    platformRank: r.platform_rank,
    finalRank: r.final_rank,
    x: r.x,
    score: r.score,
  }));

  return { ...contest, rows };
}

export type RunforceLeaderboardEntry = {
  uid: string;
  name: string | null;
  avatarUrl: string | null;
  totalScore: number;
  contestsCounted: number;
};

// 이번 학기 활동회원 전원 대상, SUM(score) DESC. 점수 행이 하나도 없는 활동회원도
// 총점 0으로 포함합니다(시상 대상 명단 전체를 봐야 하므로 — LEFT JOIN).
export async function getRunforceLeaderboard(env: Env): Promise<RunforceLeaderboardEntry[]> {
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT u.uid, u.name, u.avatar_url,
            COALESCE(SUM(r.score), 0) AS total_score,
            COUNT(r.contest_id) AS contests_counted
     FROM users u
     JOIN semester_membership sm ON sm.uid = u.uid AND sm.status = 'approved'
     JOIN semesters s ON s.year = sm.year AND s.season = sm.season AND s.is_current = 1
     LEFT JOIN runforce_results r ON r.uid = u.uid
     GROUP BY u.uid
     ORDER BY total_score DESC`,
  ).all<{ uid: string; name: string | null; avatar_url: string | null; total_score: number; contests_counted: number }>();

  return results.map((r) => ({ uid: r.uid, name: r.name, avatarUrl: r.avatar_url, totalScore: r.total_score, contestsCounted: r.contests_counted }));
}

export type RunforceMemberBreakdownRow = {
  contestId: string;
  platform: RunforcePlatform;
  contestName: string;
  startTimeMs: number;
  finalRank: number;
  participantCount: number;
  score: number;
};

// /api/me용. SUM(score) + 대회별 행 목록(최신순). 점수 행이 없으면 total=0, breakdown=[].
export async function getMemberRunforce(env: Env, uid: string): Promise<{ total: number; breakdown: RunforceMemberBreakdownRow[] }> {
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT c.id AS contest_id, c.platform, c.contest_name, c.start_time_ms, c.participant_count_snapshot,
            r.final_rank, r.score
     FROM runforce_results r
     JOIN runforce_contests c ON c.id = r.contest_id
     WHERE r.uid = ?1
     ORDER BY c.start_time_ms DESC`,
  )
    .bind(uid)
    .all<{
      contest_id: string;
      platform: RunforcePlatform;
      contest_name: string;
      start_time_ms: number;
      participant_count_snapshot: number;
      final_rank: number;
      score: number;
    }>();

  const breakdown: RunforceMemberBreakdownRow[] = results.map((r) => ({
    contestId: r.contest_id,
    platform: r.platform,
    contestName: r.contest_name,
    startTimeMs: r.start_time_ms,
    finalRank: r.final_rank,
    participantCount: r.participant_count_snapshot,
    score: r.score,
  }));
  const total = breakdown.reduce((sum, b) => sum + b.score, 0);
  return { total, breakdown };
}

// ---------- 자동탐색 (크론이 호출) ----------

// 한 번의 cron tick에서 처리할 "새로 추가되는" 대회 수 상한 — 첫 활성화 직후처럼 범위
// 안에 밀린 대회가 많아도 한 틱이 오래 걸리지 않게 합니다. 나머지는 다음 시간에 이어서 처리.
const MAX_NEW_CONTESTS_PER_TICK = 5;

export async function refreshAutoDiscoveredContests(env: Env): Promise<void> {
  const config = await getRunforceConfig(env);
  if (!config.autoDiscoveryEnabled || !config.rangeStartDate || !config.rangeEndDate) return;

  const [cfCandidates, acCandidates] = await Promise.all([
    listCodeforcesContestsInRange(config.rangeStartDate, config.rangeEndDate).catch((err) => {
      console.error("RUNFORCE: Codeforces 대회 목록 조회 실패", err);
      return [];
    }),
    listAtCoderContestsInRange(config.rangeStartDate, config.rangeEndDate).catch((err) => {
      console.error("RUNFORCE: AtCoder 대회 목록 조회 실패", err);
      return [];
    }),
  ]);

  const candidates: { platform: RunforcePlatform; contestId: string; startTimeMs: number }[] = [
    ...cfCandidates.map((c) => ({ platform: "codeforces" as const, contestId: c.id, startTimeMs: c.startTimeMs })),
    ...acCandidates.map((c) => ({ platform: "atcoder" as const, contestId: c.id, startTimeMs: c.startTimeMs })),
  ];
  candidates.sort((a, b) => a.startTimeMs - b.startTimeMs);

  let processed = 0;
  for (const candidate of candidates) {
    if (processed >= MAX_NEW_CONTESTS_PER_TICK) break;
    const existing = await getTargetContestByPlatformId(env, candidate.platform, candidate.contestId);
    if (existing) continue; // 이미 등록됨 — 재계산 금지, 스킵

    try {
      await addTargetContest(env, candidate.platform, candidate.contestId, { uid: null, name: null }, "auto");
    } catch (err) {
      // 하나 실패해도 나머지는 계속 진행 — 실패한 건 다음 시간에 자동으로 재시도됨
      // (existing 체크에서 여전히 없을 것이므로).
      console.error(`RUNFORCE: 자동탐색 대회 추가 실패 (${candidate.platform}:${candidate.contestId})`, err);
      continue;
    }
    processed++;
  }
}

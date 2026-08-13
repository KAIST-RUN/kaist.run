import type { Env } from "../types";
import { listActiveMembersWithHandle } from "./members";
import {
  fetchCodeforcesContestMeta,
  fetchCodeforcesContestRatingChanges,
  isCodeforcesContestRated,
  isCodeforcesOutOfCompetitionParticipant,
  listCodeforcesContestsInRange,
} from "./codeforces";
import {
  fetchAtCoderContestMeta,
  isAtCoderContestRated,
  listAtCoderContestsInRange,
  type AtCoderRankEntry,
} from "./atcoder";

// RUNFORCE: 활동회원의 Codeforces/AtCoder 대회 성적을 다른 활동회원과 상대평가해 포인트로
// 환산하는 기능입니다 (worker/migrations/0018_runforce.sql 참고). 핵심 불변식은 "한 번
// 계산된 대회는 삭제 후 재추가하지 않는 한 절대 재계산되지 않는다"입니다 — 아래
// addTargetContest가 이 계약의 유일한 진입점입니다.

export class RunforceError extends Error {}

export type RunforcePlatform = "codeforces" | "atcoder";

// Codeforces Div1/Div2 분리 라운드 페어링용 (아래 "---------- Div1/Div2 페어링 ----------" 참고).
export type RunforceDivision = "div1" | "div2";

// 대회 이름에서 Div1/Div2 여부를 판별합니다. "Div. 1 + Div. 2"처럼 합쳐진 라운드는
// 애초에 별개 contest_id로 쪼개진 게 아니라서 페어링 대상이 아니므로 null을 반환합니다
// (두 마커가 동시에 매치되면 합쳐진 라운드로 취급). AtCoder에는 이런 분리 패턴이 없어서
// 호출부(addTargetContest)는 platform==="codeforces"일 때만 이 함수를 씁니다.
function detectCodeforcesDivision(contestName: string): RunforceDivision | null {
  const hasDiv1 = /\bdiv\.?\s*1\b/i.test(contestName);
  const hasDiv2 = /\bdiv\.?\s*2\b/i.test(contestName);
  if (hasDiv1 && hasDiv2) return null;
  if (hasDiv1) return "div1";
  if (hasDiv2) return "div2";
  return null;
}

// "레이팅 상한이 있는" 라운드인지 — 상한을 넘는 사람은 실시간 참가해도 unrated
// (OUT_OF_COMPETITION) 처리되고, 그 경우 별도 점수 규칙을 적용합니다(computeContestRanking).
// 실측(2026-08, contest.ratingChanges의 최고 oldRating): Div.2=2171, Div.3=1599, Div.4=1406으로
// 셋 다 상한이 있습니다. 반대로 제외하는 경우:
//  - Div.1 단독: 상한이 아니라 하한이 있는 구조라, 여기 out-of-competition으로 참가한 회원은
//    "너무 강해서"가 아니라 "아직 약해서"입니다 — rated 참가자 중앙값을 주면 과한 보상이 됩니다.
//  - "Div. 1 + Div. 2" 합본: 상한 없이 사실상 전원 rated라 애초에 이 현상이 없습니다.
// Educational 라운드("Rated for Div. 2")는 div2 패턴에 걸려서 정상적으로 포함됩니다.
function isCodeforcesRatingCappedRound(contestName: string): boolean {
  if (/\bdiv\.?\s*1\b/i.test(contestName)) return false;
  return /\bdiv\.?\s*[234]\b/i.test(contestName);
}

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

// 자동 탐색 기간 상한 — 실수로 몇 년짜리 범위를 넣으면 그 안의 모든 rated 대회가 산정
// 대상으로 쓸려 들어오고(한 틱에 5개씩이라 되돌리기도 번거로움), 외부 API 호출도 그만큼
// 불어납니다. 집중훈련 이벤트가 보통 몇 주 단위라 6개월이면 충분히 넉넉한 안전선입니다.
const MAX_RANGE_MONTHS = 6;

// 'YYYY-MM-DD'에 개월을 더한 시각(UTC). Date.UTC가 월 넘침을 알아서 처리합니다
// (예: 8/31 + 6개월 → 2/31 → 3/3) — 경계에서 아주 살짝 관대해지는 정도라 괜찮습니다.
function addMonthsUtc(dateStr: string, months: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1 + months, d);
}

export async function setRunforceConfig(
  env: Env,
  input: { autoDiscoveryEnabled: boolean; rangeStartDate: string | null; rangeEndDate: string | null },
): Promise<void> {
  if (input.autoDiscoveryEnabled && (!input.rangeStartDate || !input.rangeEndDate)) {
    throw new RunforceError("자동 탐색을 켜려면 시작일과 종료일을 모두 입력해야 합니다.");
  }

  // 두 날짜가 다 들어왔으면 자동 탐색 on/off와 무관하게 검사합니다 — 꺼둔 상태로 잘못된
  // 범위를 저장해두고 나중에 켜면서 놓치는 걸 막기 위해.
  if (input.rangeStartDate && input.rangeEndDate) {
    const start = Date.parse(`${input.rangeStartDate}T00:00:00Z`);
    const end = Date.parse(`${input.rangeEndDate}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) throw new RunforceError("날짜 형식이 올바르지 않습니다.");
    if (end < start) throw new RunforceError("종료일이 시작일보다 빠를 수 없습니다.");
    if (end > addMonthsUtc(input.rangeStartDate, MAX_RANGE_MONTHS)) {
      throw new RunforceError(`자동 탐색 기간은 ${MAX_RANGE_MONTHS}개월을 넘을 수 없습니다.`);
    }
  }
  await env.CONTENT_DB.prepare(
    `UPDATE runforce_config SET auto_discovery_enabled=?1, range_start_date=?2, range_end_date=?3, updated_at=datetime('now') WHERE id=1`,
  )
    .bind(input.autoDiscoveryEnabled ? 1 : 0, input.rangeStartDate, input.rangeEndDate)
    .run();
}

// ---------- 대상 대회 목록 ----------

// DB 한 행을 그대로 매핑한 타입. 가중치는 "지금 등록된 대회 전체의 개최 순서"에서 나오므로
// 행 하나만 봐서는 알 수 없습니다 — 가중치가 붙은 건 아래 RunforceContestSummary입니다.
export type RunforceContestRow = {
  id: string;
  platform: RunforcePlatform;
  contestId: string;
  contestName: string;
  startTimeMs: number;
  source: "manual" | "auto";
  addedByName: string | null;
  addedAt: string;
  participantCount: number;
  // Div1/Div2 분리 라운드 페어링용 (아래 "---------- Div1/Div2 페어링 ----------" 참고).
  // AtCoder거나 판별 불가/합쳐진 라운드면 division은 항상 null.
  division: RunforceDivision | null;
  pairedContestId: string | null; // 짝지어진 다른 runforce_contests.id, 없으면 null
};

// 개최 순서 가중치가 붙은 대회. weightIndex는 "지금 등록된 대회들을 개최 시각 순으로 줄
// 세웠을 때 몇 번째 라운드인가"(1부터)이고, weightMultiplier = 1.05^(weightIndex-1)입니다.
// 저장된 점수(runforce_results.score)는 항상 만점 300000 기준이고, 여기에 이 배수를 곱한
// 값이 실제로 반영되는 점수입니다 — 그래서 나중에 과거 대회를 추가하면 그 뒤 라운드들의
// 번호가 밀리면서 총점도 다시 계산됩니다(의도된 동작).
export type RunforceContestSummary = RunforceContestRow & {
  weightIndex: number;
  weightMultiplier: number;
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
  division: RunforceDivision | null;
  paired_contest_id: string | null;
};

function toContestRow(row: RawContestRow): RunforceContestRow {
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
    division: row.division,
    pairedContestId: row.paired_contest_id,
  };
}

const CONTEST_ROW_SELECT =
  "SELECT id, platform, contest_id, contest_name, start_time_ms, source, added_by_name, added_at, participant_count_snapshot, division, paired_contest_id FROM runforce_contests";

// 목록은 항상 개최 순서 가중치가 붙은 상태로 나갑니다(화면/집계 양쪽 다 이걸 씁니다).
export async function listTargetContests(env: Env): Promise<RunforceContestSummary[]> {
  const { results } = await env.CONTENT_DB.prepare(`${CONTEST_ROW_SELECT} ORDER BY start_time_ms DESC`).all<RawContestRow>();
  return assignWeights(results.map(toContestRow));
}

async function getTargetContestByPlatformId(env: Env, platform: RunforcePlatform, contestId: string): Promise<RunforceContestRow | null> {
  const row = await env.CONTENT_DB.prepare(`${CONTEST_ROW_SELECT} WHERE platform=?1 AND contest_id=?2`).bind(platform, contestId).first<RawContestRow>();
  return row ? toContestRow(row) : null;
}

async function getTargetContestById(env: Env, rowId: string): Promise<RunforceContestRow | null> {
  const row = await env.CONTENT_DB.prepare(`${CONTEST_ROW_SELECT} WHERE id=?1`).bind(rowId).first<RawContestRow>();
  return row ? toContestRow(row) : null;
}

// ---------- 점수 공식 / 랭킹 계산 (순수함수) ----------

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

const SIGMOID_5 = sigmoid(5);
const SIGMOID_NEG5 = sigmoid(-5);

// ---------- 대회별 가중치(만점) ----------
// 후반 대회일수록 만점이 점진적으로 커집니다: i번째로 집계된 대회의 만점은
// BASE_MAX_SCORE * WEIGHT_GROWTH^(i-1). i는 "개최 순서"이고, 저장된 값이 아니라 조회할
// 때마다 지금 등록된 대회 전체를 개최 시각 순으로 줄 세워 다시 매깁니다(assignWeights).
const BASE_MAX_SCORE = 300000;
const WEIGHT_GROWTH = 1.05;

export function runforceWeightMultiplier(weightIndex: number): number {
  return WEIGHT_GROWTH ** (weightIndex - 1);
}

// 그 순번의 대회에서 1등이 받는 점수(= 만점). 저장값은 항상 BASE_MAX_SCORE 기준이고
// 여기에 배수를 곱한 값이 실제 반영 점수라, 화면에 "이 대회 만점"을 보여줄 때 씁니다.
export function runforceMaxScoreFor(weightIndex: number): number {
  return BASE_MAX_SCORE * runforceWeightMultiplier(weightIndex);
}

// 등록된 대회들에 "개최 순서" 가중치를 매깁니다 — 저장 시점이 아니라 조회할 때마다 지금
// 등록된 목록 전체를 보고 다시 계산하므로, 과거 대회를 나중에 추가하면 그 뒤 라운드들의
// 번호가 자연스럽게 한 칸씩 밀립니다(그게 이 방식의 목적입니다).
//
// 순번은 대회 행이 아니라 "라운드" 단위로 매깁니다 — Div1/Div2 짝은 한 라운드라 같은 번호를
// 공유합니다. 정렬은 개최 시각 오름차순이고, 시각이 완전히 같은 서로 다른 라운드가 있으면
// (드물지만 플랫폼이 달라 짝이 아닌 경우) id로 안정적으로 갈라서 조회할 때마다 결과가
// 흔들리지 않게 합니다.
function assignWeights(rows: RunforceContestRow[]): RunforceContestSummary[] {
  const groups = groupContests(rows);
  const anchorOf = (g: ContestGroupOf<RunforceContestRow>) =>
    "single" in g ? g.single : g.div1.id < g.div2.id ? g.div1 : g.div2;

  const ordered = [...groups].sort((a, b) => {
    const x = anchorOf(a);
    const y = anchorOf(b);
    return x.startTimeMs - y.startTimeMs || x.id.localeCompare(y.id);
  });

  const weightByContestId = new Map<string, number>();
  ordered.forEach((g, i) => {
    const index = i + 1;
    if ("single" in g) weightByContestId.set(g.single.id, index);
    else {
      weightByContestId.set(g.div1.id, index);
      weightByContestId.set(g.div2.id, index);
    }
  });

  return rows.map((r) => {
    const weightIndex = weightByContestId.get(r.id) ?? 1;
    return { ...r, weightIndex, weightMultiplier: runforceWeightMultiplier(weightIndex) };
  });
}

// score(x) = 300000 * (sigmoid(10*(x-0.5)) - sigmoid(-5)) / (sigmoid(5) - sigmoid(-5))
// x=1(1등)이면 정확히 300000, x→0(최하위)이면 0에 가깝지만 음수는 없음. 개최 순서 가중치는
// 여기 안 들어갑니다 — 집계할 때 곱합니다(assignWeights).
// 반환값은 아직 내림 전 원시값입니다 — 대회별로 실제 적용(저장)되는 값은
// computeContestRanking에서 이 값을 내림한 정수입니다.
export function computeRunforceScore(x: number): number {
  const numerator = sigmoid(10 * (x - 0.5)) - SIGMOID_NEG5;
  const denominator = SIGMOID_5 - SIGMOID_NEG5;
  return BASE_MAX_SCORE * (numerator / denominator);
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
  platformRank: number | null; // 미참가자(핸들 없음 또는 이 대회에 없음)는 null. unrated 참가자도 null(진짜 CF 순위를 알 방법이 없음)
  finalRank: number; // 0-indexed, 동점 무작위 처리 확정 후
  x: number;
  score: number;
  // 레이팅 상한이 있는 라운드(Div.2/Div.3/Div.4)에서 상한 초과로 실시간 참가했지만
  // unrated(OUT_OF_COMPETITION) 처리된 회원 — score는 일반 공식이 아니라 별도 규칙(아래
  // computeContestRanking 참고)으로 직접 계산됩니다. 이 필드가 없으면(false) score는
  // 언제나 x로부터 공식으로 유도된 값입니다.
  isUnratedParticipant: boolean;
};

// members: 이번 학기 활동회원 전원(핸들 없는 사람도 포함). platformRanks: 대회 원본
// 순위표를 handle(trim + 소문자 정규화)→rank로 만든 Map. unratedParticipantUids: 단독
// Div.2 라운드에서 레이팅 상한 초과로 실시간 참가했지만 unrated 처리된 회원의 uid
// 집합(addTargetContest가 isCodeforcesOutOfCompetitionParticipant로 미리 판정해서
// 넘겨줌) — AtCoder거나 Div1/Div2 분리 라운드, 또는 그냥 일반 대회면 항상 undefined.
//
// 알고리즘:
//  1) total = members.length. 0이면 에러.
//  2) participants = handle이 있고 platformRanks에 있는 회원(=공식 rated 참가자),
//     platformRank 오름차순. unratedGroup = unratedParticipantUids에 속하면서
//     platformRank가 없는 회원. nonParticipants = 나머지 전부(핸들 없음, 이 대회에 없음,
//     또는 unrated 판정 대상이 아닌 미참가자).
//  3) participants를 platformRank가 같은 값끼리 버킷으로 묶고, 버킷 내부(2명 이상)만 셔플.
//     unratedGroup 전체, nonParticipants 전체도 각각 하나의 동점 묶음으로 셔플.
//  4) [셔플된 participants 버킷들을 rank 오름차순으로 이어붙임] + [셔플된 unratedGroup]
//     + [셔플된 nonParticipants] 순서로 concat → 이 순서의 인덱스가 그대로 0-indexed
//     final_rank. unratedGroup을 participants "바로 뒤"(nonParticipants보다는 앞)에 두는
//     건 "실시간으로 실제 참가했다"는 사실이 아예 미참가보다는 낫다고 보는 게 자연스러워서
//     — participants 각자의 final_rank/score 계산에는 영향 없습니다(항상 맨 앞 블록이라
//     unratedGroup/nonParticipants가 몇 명이든 무관).
//  5) participants/nonParticipants: x = 1 - finalRank/total; score = floor(computeRunforceScore(x)).
//     여기서 나오는 점수는 항상 "만점 300000 기준"입니다 — 개최 순서 가중치(1.05^i)는 저장
//     시점이 아니라 집계/표시할 때 곱합니다(assignWeights 참고). 그래야 나중에 과거 대회가
//     추가돼도 저장값은 그대로 두고 순서만 다시 매기면 됩니다.
//     unratedGroup: score는 공식으로 안 구하고 직접 대입합니다 — rated 참가자(=participants)가
//     한 명도 없으면 1등에 해당하는 점수(=BASE_MAX_SCORE), 있으면 rated 참가자들의 score(이미 위 공식으로 계산된 값) 중 중앙값(개수가 짝수면 두
//     중앙값의 평균, 그 결과를 다시 내림)을 그대로 적용합니다. x는 표시상 의미만 있고
//     (디버깅/기록용) 실제 score와 무관하게 자기 위치 기준 그대로 둡니다.
//     총점은 대회마다 이렇게 내림/직접대입된 정수들의 합이지, 합산 후 한 번에 내림하는 게
//     아닙니다 — getRunforceLeaderboard/getMemberRunforce의 SUM이 이미 이 정수들을 더하는
//     것이므로 자연히 그렇게 됩니다.
export function computeContestRanking(
  members: RunforceRankInput[],
  platformRanks: Map<string, number>,
  rng: () => number = defaultRng,
  unratedParticipantUids?: Set<string>,
): RunforceRankedRow[] {
  const total = members.length;
  if (total === 0) throw new RunforceError("활동회원이 없어 랭킹을 계산할 수 없습니다.");

  type Working = RunforceRankInput & { platformRank: number | null; isUnratedParticipant: boolean };
  const working: Working[] = members.map((m) => {
    const key = m.handle ? m.handle.trim().toLowerCase() : null;
    const rank = key ? (platformRanks.get(key) ?? null) : null;
    const isUnratedParticipant = rank === null && !!unratedParticipantUids?.has(m.uid);
    return { ...m, platformRank: rank, isUnratedParticipant };
  });

  const participants = working.filter((w): w is Working & { platformRank: number } => w.platformRank !== null);
  const unratedGroup = working.filter((w) => w.platformRank === null && w.isUnratedParticipant);
  const nonParticipants = working.filter((w) => w.platformRank === null && !w.isUnratedParticipant);
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

  const shuffledUnratedGroup = [...unratedGroup];
  if (shuffledUnratedGroup.length > 1) shuffleInPlace(shuffledUnratedGroup, rng);

  const shuffledNonParticipants = [...nonParticipants];
  if (shuffledNonParticipants.length > 1) shuffleInPlace(shuffledNonParticipants, rng);

  const finalOrder = [...orderedParticipants, ...shuffledUnratedGroup, ...shuffledNonParticipants];

  // unratedGroup에게 적용할 점수 — orderedParticipants는 항상 맨 앞 블록이라(4번 참고)
  // 이 시점에 이미 최종 확정된 값과 동일하게 계산할 수 있습니다.
  let unratedOverrideScore = 0;
  if (shuffledUnratedGroup.length > 0) {
    if (orderedParticipants.length === 0) {
      // rated 참가자가 없으면 1등에 해당하는 점수(기준 만점). 개최 순서 가중치는 집계할 때
      // 곱해지므로, 여기서는 다른 점수들과 마찬가지로 300000 기준 값을 넣습니다.
      unratedOverrideScore = BASE_MAX_SCORE;
    } else {
      const ratedScores = orderedParticipants
        .map((w, idx) => Math.floor(computeRunforceScore(1 - idx / total)))
        .sort((a, b) => a - b);
      const mid = Math.floor(ratedScores.length / 2);
      const median = ratedScores.length % 2 === 0 ? (ratedScores[mid - 1] + ratedScores[mid]) / 2 : ratedScores[mid];
      unratedOverrideScore = Math.floor(median);
    }
  }

  return finalOrder.map((w, idx) => {
    const x = 1 - idx / total;
    const score = w.isUnratedParticipant ? unratedOverrideScore : Math.floor(computeRunforceScore(x));
    return {
      uid: w.uid,
      name: w.name,
      avatarUrl: w.avatarUrl,
      handle: w.handle,
      platformRank: w.platformRank,
      finalRank: idx,
      x,
      score,
      isUnratedParticipant: w.isUnratedParticipant,
    };
  });
}

// ---------- 대상 대회 추가/삭제 ----------

// 수동 추가(backstage POST)와 자동탐색(cron)이 공유하는 단일 원자적 흐름입니다. 이미
// 등록된 대회는 manual이면 에러, auto면 조용히 기존 값을 반환(재계산 절대 금지 —
// UNIQUE(platform, contest_id) 인덱스와 함께 이중 안전장치).
//
// prefetchedAtCoderStandings: atcoder.jp/contests/{id}/results/json은 이 Worker(Cloudflare)
// 발신 IP에서 403으로 막혀 있어(atcoder.ts 상단 주석) platform==='atcoder'일 땐 이 Worker가
// 직접 순위표를 못 가져옵니다. 그래서 순위표는 항상 runBot이 대신 가져와 넘겨준 값을 씁니다
// — 값이 없으면 이 함수를 부르지 말고 enqueueAtCoderPending으로 대기열에 넣으세요
// (completeAtCoderContest가 그 값을 채워 이 함수를 호출하는 유일한 경로입니다).
// Codeforces는 지금처럼 이 함수 안에서 직접 fetch합니다(막혀있지 않으므로).
export async function addTargetContest(
  env: Env,
  platform: RunforcePlatform,
  contestIdRaw: string,
  addedBy: { uid: string | null; name: string | null },
  source: "manual" | "auto",
  prefetchedAtCoderStandings?: AtCoderRankEntry[],
): Promise<RunforceContestRow> {
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

  let rankEntries: AtCoderRankEntry[];
  if (platform === "codeforces") {
    rankEntries = await fetchCodeforcesContestRatingChanges(contestId);
  } else {
    if (!prefetchedAtCoderStandings) {
      throw new RunforceError("AtCoder 순위표가 아직 없습니다 — enqueueAtCoderPending으로 대기열에 등록하세요.");
    }
    rankEntries = prefetchedAtCoderStandings;
  }
  const platformRanks = new Map<string, number>();
  for (const entry of rankEntries) {
    const key = entry.handle.trim().toLowerCase();
    // 같은 핸들이 여러 번 나오면(있을 수 없지만 방어적으로) 더 좋은(작은) 순위를 우선.
    const current = platformRanks.get(key);
    if (current === undefined || entry.rank < current) platformRanks.set(key, entry.rank);
  }

  // Div1/Div2 분리 라운드 감지 — AtCoder는 이 패턴이 없으므로 codeforces일 때만.
  const division = platform === "codeforces" ? detectCodeforcesDivision(meta.name) : null;
  const rowId = crypto.randomUUID();

  const members = await listActiveMembersWithHandle(env, platform);

  // 레이팅 상한이 있는 라운드(Div.2/Div.3/Div.4 — isCodeforcesRatingCappedRound 참고)에서
  // 상한 초과로 unrated 처리된 채로 실시간 참가한 회원을 찾습니다. rated 참가자로 이미
  // 잡힌(=platformRanks에 핸들이 있는) 회원은 애초에 확인할 필요가 없습니다.
  // 단, Div.2는 같은 시작 시각에 짝지어질 Div.1이 있으면 건너뜁니다 — 그런 분리 라운드에선
  // 상한을 넘는 회원이 Div.1 쪽에서 rated로 잡히고, 합산도 페어링 규칙이 처리하니까요.
  // Div.3/Div.4는 애초에 짝 개념이 없어서 항상 검사합니다.
  let unratedParticipantUids: Set<string> | undefined;
  if (platform === "codeforces" && isCodeforcesRatingCappedRound(meta.name)) {
    const div1Partner = division === "div2" ? await findUnpairedCodeforcesPartner(env, "div1", meta.startTimeMs, rowId) : null;
    if (!div1Partner) {
      const candidates = members.filter((m) => m.handle && !platformRanks.has(m.handle.trim().toLowerCase()));
      if (candidates.length > 0) {
        unratedParticipantUids = new Set();
        const contestStartSeconds = Math.floor(meta.startTimeMs / 1000);
        for (const m of candidates) {
          try {
            const isOutOfCompetition = await isCodeforcesOutOfCompetitionParticipant(m.handle!, contestId, contestStartSeconds);
            if (isOutOfCompetition) unratedParticipantUids.add(m.uid);
          } catch (err) {
            // 핸들 하나 확인이 실패해도(오타로 존재하지 않는 핸들 등) 전체 대회 추가를
            // 막지 않습니다 — 그냥 그 사람은 미참가자로 취급됩니다.
            console.error(`RUNFORCE: unrated 참가자 확인 실패 (handle=${m.handle})`, err);
          }
        }
      }
    }
  }

  // 저장되는 점수는 항상 만점 300000 기준입니다 — 개최 순서 가중치는 집계/표시할 때
  // 곱합니다(assignWeights). 그래서 나중에 과거 대회가 끼어들어도 이 값들은 안 건드립니다.
  const ranked = computeContestRanking(members, platformRanks, undefined, unratedParticipantUids);

  const statements = [
    env.CONTENT_DB.prepare(
      `INSERT INTO runforce_contests
         (id, platform, contest_id, contest_name, start_time_ms, source, added_by_uid, added_by_name, participant_count_snapshot, division)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    ).bind(rowId, platform, contestId, meta.name, meta.startTimeMs, source, addedBy.uid, addedBy.name, ranked.length, division),
    ...ranked.map((r) =>
      env.CONTENT_DB.prepare(
        `INSERT INTO runforce_results (contest_id, uid, handle_snapshot, platform_rank, final_rank, x, score, is_unrated_participant)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(rowId, r.uid, r.handle, r.platformRank, r.finalRank, r.x, r.score, r.isUnratedParticipant ? 1 : 0),
    ),
  ];
  await env.CONTENT_DB.batch(statements);

  // 같은 시작 시각의 반대 division 대회가 이미 등록돼 있으면 자동으로 짝짓습니다(둘 다
  // 아직 미페어링 상태일 때만 — 이미 다른 대회와 짝지어진 건 건드리지 않음). 순서 무관:
  // Div1을 먼저 추가하고 나중에 Div2를 추가해도, 반대 순서여도 똑같이 동작합니다.
  if (division) {
    await tryAutoPairCodeforcesDivisions(env, rowId, division, meta.startTimeMs);
  }

  const created = await getTargetContestById(env, rowId);
  if (!created) throw new Error("Failed to read back just-created RUNFORCE contest");
  return created;
}

// ---------- AtCoder 순위표 대기열 (봇 중계) ----------
// atcoder.jp 순위표 fetch가 이 Worker에서 막혀 있어(addTargetContest 주석 참고), AtCoder
// 대회는 바로 계산하는 대신 여기 대기열에 등록만 해두고 runBot이 폴링해서 채웁니다.
// 대회 메타는 저장하지 않습니다 — kenkoooo.com 쪽은 안 막혀 있어서 필요할 때(완료 시점)
// addTargetContest가 다시 가져오면 그만이라, 대기 중에 따로 캐싱해 둘 이유가 없습니다.

export type AtCoderPendingEntry = {
  contestId: string;
  source: "manual" | "auto";
  addedByUid: string | null;
  addedByName: string | null;
  requestedAt: string;
};

// 멱등 — 이미 대기 중이면 조용히 무시합니다(ON CONFLICT DO NOTHING). 이미 runforce_contests에
// 있는 대회를 여기 넣는 것도 딱히 해롭진 않지만(완료 시점에 addTargetContest의 existing 체크가
// 잡아냄), 호출부(backstage 라우트/cron)가 먼저 그쪽을 확인하는 게 정상 경로입니다.
export async function enqueueAtCoderPending(
  env: Env,
  contestIdRaw: string,
  addedBy: { uid: string | null; name: string | null },
  source: "manual" | "auto",
): Promise<void> {
  const contestId = contestIdRaw.trim();
  if (!contestId) throw new RunforceError("대회 ID를 입력해 주세요.");

  await env.CONTENT_DB.prepare(
    `INSERT INTO runforce_atcoder_pending (contest_id, source, added_by_uid, added_by_name)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (contest_id) DO NOTHING`,
  )
    .bind(contestId, source, addedBy.uid, addedBy.name)
    .run();
}

export async function listPendingAtCoderContests(env: Env): Promise<AtCoderPendingEntry[]> {
  const { results } = await env.CONTENT_DB.prepare(
    "SELECT contest_id, source, added_by_uid, added_by_name, requested_at FROM runforce_atcoder_pending ORDER BY requested_at ASC",
  ).all<{ contest_id: string; source: "manual" | "auto"; added_by_uid: string | null; added_by_name: string | null; requested_at: string }>();
  return results.map((r) => ({
    contestId: r.contest_id,
    source: r.source,
    addedByUid: r.added_by_uid,
    addedByName: r.added_by_name,
    requestedAt: r.requested_at,
  }));
}

// 봇이 대기열의 한 건을 채워서 넘겨줄 때 부르는 함수 — addTargetContest에 실제 계산을
// 맡기고, 성공하면 대기열에서 지웁니다. 대기열에 없는 contestId로 불려도(레이스 등) 그냥
// source='auto'/addedBy=null로 처리합니다 — 계산 자체는 막을 이유가 없습니다.
export async function completeAtCoderContest(
  env: Env,
  contestIdRaw: string,
  entries: AtCoderRankEntry[],
): Promise<RunforceContestRow> {
  const contestId = contestIdRaw.trim();
  const pending = await env.CONTENT_DB.prepare(
    "SELECT source, added_by_uid, added_by_name FROM runforce_atcoder_pending WHERE contest_id=?1",
  )
    .bind(contestId)
    .first<{ source: "manual" | "auto"; added_by_uid: string | null; added_by_name: string | null }>();

  const source = pending?.source ?? "auto";
  const addedBy = { uid: pending?.added_by_uid ?? null, name: pending?.added_by_name ?? null };

  const contest = await addTargetContest(env, "atcoder", contestId, addedBy, source, entries);
  await env.CONTENT_DB.prepare("DELETE FROM runforce_atcoder_pending WHERE contest_id=?1").bind(contestId).run();
  return contest;
}

// ---------- Div1/Div2 페어링 ----------

// division의 짝(반대 division)이 될 수 있는, 아직 미페어링 상태인 대회를 같은 시작 시각
// 기준으로 찾습니다. 자동 페어링(tryAutoPairCodeforcesDivisions)과, "이 Div2 라운드가
// 단독인가"(=짝지어질 Div1이 없는가) 판정(addTargetContest의 unrated 참가자 처리 여부
// 결정) 양쪽에서 재사용합니다.
async function findUnpairedCodeforcesPartner(
  env: Env,
  wantedDivision: RunforceDivision,
  startTimeMs: number,
  excludeContestId: string,
): Promise<{ id: string } | null> {
  const candidate = await env.CONTENT_DB.prepare(
    `SELECT id FROM runforce_contests
     WHERE platform='codeforces' AND division=?1 AND start_time_ms=?2 AND paired_contest_id IS NULL AND id != ?3
     LIMIT 1`,
  )
    .bind(wantedDivision, startTimeMs, excludeContestId)
    .first<{ id: string }>();
  return candidate ?? null;
}

async function tryAutoPairCodeforcesDivisions(env: Env, newContestId: string, division: RunforceDivision, startTimeMs: number): Promise<void> {
  const wantedDivision: RunforceDivision = division === "div1" ? "div2" : "div1";
  const candidate = await findUnpairedCodeforcesPartner(env, wantedDivision, startTimeMs, newContestId);
  if (!candidate) return;

  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare("UPDATE runforce_contests SET paired_contest_id=?1 WHERE id=?2").bind(candidate.id, newContestId),
    env.CONTENT_DB.prepare("UPDATE runforce_contests SET paired_contest_id=?1 WHERE id=?2").bind(newContestId, candidate.id),
  ]);
}

// backstage에서 자동 페어링이 실패한(예: 시작 시각이 API마다 미묘하게 달라서, 또는
// division 컬럼/판별 로직이 추가되기 전에 이미 등록됐던 대회라서 division이 비어있는
// 경우) 상황을 위한 수동 안전장치입니다. division이 비어있으면 여기서 이름으로 다시
// 판별을 시도해 채워 넣습니다(runforce_results는 전혀 안 건드리므로 이미 계산된
// 순위/점수/동점 셔플에는 영향 없음 — division은 순수 메타데이터). 그래도 둘 다
// division이 있어야 하고(이름에서 Div1/Div2 판별 가능) 서로 달라야 합니다 — 그래야
// "실제 참가한 쪽" 규칙을 적용할 때 어느 쪽이 Div1인지 헷갈리지 않습니다.
export async function pairContests(env: Env, contestId: string, otherContestId: string): Promise<void> {
  if (contestId === otherContestId) throw new RunforceError("같은 대회는 짝지을 수 없습니다.");
  const [a, b] = await Promise.all([getTargetContestById(env, contestId), getTargetContestById(env, otherContestId)]);
  if (!a || !b) throw new RunforceError("대회를 찾을 수 없습니다.");

  const divisionA = a.division ?? (a.platform === "codeforces" ? detectCodeforcesDivision(a.contestName) : null);
  const divisionB = b.division ?? (b.platform === "codeforces" ? detectCodeforcesDivision(b.contestName) : null);
  if (!divisionA || !divisionB) throw new RunforceError("두 대회 모두 이름에서 Div1/Div2를 판별할 수 있어야 짝지을 수 있습니다.");
  if (divisionA === divisionB) throw new RunforceError("같은 Division끼리는 짝지을 수 없습니다.");

  const statements = [];
  if (a.division !== divisionA) statements.push(env.CONTENT_DB.prepare("UPDATE runforce_contests SET division=?1 WHERE id=?2").bind(divisionA, a.id));
  if (b.division !== divisionB) statements.push(env.CONTENT_DB.prepare("UPDATE runforce_contests SET division=?1 WHERE id=?2").bind(divisionB, b.id));
  statements.push(env.CONTENT_DB.prepare("UPDATE runforce_contests SET paired_contest_id=?1 WHERE id=?2").bind(b.id, a.id));
  statements.push(env.CONTENT_DB.prepare("UPDATE runforce_contests SET paired_contest_id=?1 WHERE id=?2").bind(a.id, b.id));
  await env.CONTENT_DB.batch(statements);
}

export async function unpairContest(env: Env, contestId: string): Promise<void> {
  const contest = await getTargetContestById(env, contestId);
  if (!contest?.pairedContestId) return;
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare("UPDATE runforce_contests SET paired_contest_id=NULL WHERE id=?1").bind(contest.id),
    env.CONTENT_DB.prepare("UPDATE runforce_contests SET paired_contest_id=NULL WHERE id=?1").bind(contest.pairedContestId),
  ]);
}

// runforce_results → runforce_contests 순서로 지웁니다(같은 batch). 이게 그 대회의 무작위
// 동점 처리를 "다시 섞을 수 있는" 유일한 방법입니다 — 지운 뒤 addTargetContest로 같은
// (platform, contestId)를 다시 추가하면 새 UUID로 완전히 새로 계산됩니다. 짝지어진
// 대회였다면(Div1/Div2), 남은 짝의 paired_contest_id도 같이 풀어줍니다 — 안 그러면
// 존재하지 않는 대회 id를 계속 참조하게 됩니다.
export async function removeTargetContest(env: Env, contestRowId: string): Promise<void> {
  const contest = await getTargetContestById(env, contestRowId);
  const statements = [
    env.CONTENT_DB.prepare("DELETE FROM runforce_results WHERE contest_id = ?1").bind(contestRowId),
    env.CONTENT_DB.prepare("DELETE FROM runforce_contests WHERE id = ?1").bind(contestRowId),
  ];
  if (contest?.pairedContestId) {
    statements.push(env.CONTENT_DB.prepare("UPDATE runforce_contests SET paired_contest_id=NULL WHERE id=?1").bind(contest.pairedContestId));
  }
  await env.CONTENT_DB.batch(statements);
}

// 등록된 대회 전체를 지웁니다(runforce_results → runforce_contests 순서, removeTargetContest와
// 같은 방식) — 페어링 해제도 애초에 필요 없습니다, 어차피 다 지우므로. 자동탐색 설정
// (runforce_config)은 안 건드립니다: 켜져 있었다면 다음 크론 때 그 날짜범위 안의 rated
// 대회들을 처음부터 다시 수집합니다. 완전히 새로 시작하고 싶을 때(오추가/설정 실수를
// 정리하고 다시 계산하고 싶을 때) 쓰는 되돌릴 수 없는 작업입니다.
export async function resetAllTargetContests(env: Env): Promise<void> {
  await env.CONTENT_DB.batch([
    env.CONTENT_DB.prepare("DELETE FROM runforce_results"),
    env.CONTENT_DB.prepare("DELETE FROM runforce_contests"),
  ]);
}

// ---------- 조회 API (backstage 상세/리더보드, /api/me) ----------

// pairedContest: 짝지어진 대회가 있으면 그 요약(렌더링에서 링크/이름 표시용). backstage
// 상세 페이지가 이걸 보여줘야 관리자가 "왜 이 대회의 합계가 리더보드 총점과 안 맞는지"
// (Div1/Div2 페어링 때문)를 바로 이해할 수 있습니다.
export type RunforceContestDetail = RunforceContestSummary & { rows: RunforceRankedRow[]; pairedContest: RunforceContestSummary | null };

// live 회원 정보(이름/아바타)를 조인해서 보여줍니다 — handle_snapshot/final_rank/score는
// 저장된 스냅샷 그대로, 삭제된 유저는 users 테이블에 없어 LEFT JOIN 결과 이름/아바타가
// null로만 나오고(행 자체는 남아있음 — 다른 회원 순위에 영향 없음), 그마저도 uid만으로
// 식별 가능하니 참고용으로 표시합니다.
export async function getTargetContestDetail(env: Env, contestRowId: string): Promise<RunforceContestDetail | null> {
  // 가중치는 "지금 등록된 대회 전체의 개최 순서"에서 나오므로 이 대회 한 행만 읽어선
  // 알 수 없습니다 — 목록을 통째로 가져와서 그 안에서 찾습니다.
  const contests = await listTargetContests(env);
  const contest = contests.find((c) => c.id === contestRowId);
  if (!contest) return null;

  const { results } = await env.CONTENT_DB.prepare(
    `SELECT r.uid, u.name, u.avatar_url, r.handle_snapshot, r.platform_rank, r.final_rank, r.x, r.score, r.is_unrated_participant
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
      is_unrated_participant: number;
    }>();

  const rows: RunforceRankedRow[] = results.map((r) => ({
    uid: r.uid,
    name: r.name,
    avatarUrl: r.avatar_url,
    handle: r.handle_snapshot,
    platformRank: r.platform_rank,
    finalRank: r.final_rank,
    x: r.x,
    // 표에 보이는 점수도 가중치가 반영된 값이어야 리더보드/마이페이지와 아귀가 맞습니다.
    score: applyRunforceWeight(r.score, contest.weightMultiplier, isNonParticipant({ platformRank: r.platform_rank, isUnratedParticipant: !!r.is_unrated_participant })),
    isUnratedParticipant: !!r.is_unrated_participant,
  }));

  const pairedContest = contest.pairedContestId ? (contests.find((c) => c.id === contest.pairedContestId) ?? null) : null;

  return { ...contest, rows, pairedContest };
}

export type RunforceMemberBreakdownRow = {
  contestId: string;
  platform: RunforcePlatform;
  contestName: string;
  startTimeMs: number;
  finalRank: number;
  participantCount: number;
  score: number;
  isUnratedParticipant: boolean;
};

// ---------- 합산(총점) 계산 — Div1/Div2 페어링 반영 ----------
// 짝지어지지 않은 대회는 예전처럼 그대로 반영되지만, Div1/Div2로 짝지어진 대회 쌍은
// 회원 한 명당 딱 하나의 breakdown 행만 만듭니다: Div1에 실제로 참가(platform_rank가
// 있음)했으면 Div1 대회의 행을, 아니면(Div2 참가 또는 둘 다 미참가) Div2 대회의 행을.

type StoredResultRow = { uid: string; platformRank: number | null; finalRank: number; score: number; isUnratedParticipant: boolean };

async function getContestResultRows(env: Env, contestId: string, uid?: string): Promise<StoredResultRow[]> {
  const query = uid
    ? env.CONTENT_DB.prepare("SELECT uid, platform_rank, final_rank, score, is_unrated_participant FROM runforce_results WHERE contest_id=?1 AND uid=?2").bind(contestId, uid)
    : env.CONTENT_DB.prepare("SELECT uid, platform_rank, final_rank, score, is_unrated_participant FROM runforce_results WHERE contest_id=?1").bind(contestId);
  const { results } = await query.all<{ uid: string; platform_rank: number | null; final_rank: number; score: number; is_unrated_participant: number }>();
  return results.map((r) => ({
    uid: r.uid,
    platformRank: r.platform_rank,
    finalRank: r.final_rank,
    score: r.score,
    isUnratedParticipant: !!r.is_unrated_participant,
  }));
}

// 미참가 인원은 집계할 때 0.2배만 반영합니다. "미참가"는 platform_rank가 없고 unrated
// 참가자도 아닌 경우 — 즉 핸들이 없거나, 핸들은 있지만 그 대회에 아예 참가하지 않은 회원
// 입니다. unrated 참가자는 (레이팅이 안 붙었을 뿐) 실시간으로 실제 참가한 사람이라 여기
// 해당하지 않고 감점 없이 그대로 반영됩니다.
const NON_PARTICIPANT_MULTIPLIER = 0.2;

function isNonParticipant(row: { platformRank: number | null; isUnratedParticipant: boolean }): boolean {
  return row.platformRank === null && !row.isUnratedParticipant;
}

// 저장값(만점 300000 기준)에 개최 순서 가중치와 미참가 감점을 곱한 값이 실제 반영 점수입니다.
// 대회마다 곱한 뒤 내림해서 정수로 맞추고, 총점은 그 정수들의 합입니다 — 기존 "대회별로
// 내림 후 합산" 규칙 그대로라 표시(1000으로 나눠 소수점 3자리)도 정확히 떨어집니다.
export function applyRunforceWeight(baseScore: number, weightMultiplier: number, nonParticipant: boolean): number {
  return Math.floor(baseScore * weightMultiplier * (nonParticipant ? NON_PARTICIPANT_MULTIPLIER : 1));
}

function toBreakdownRow(contest: RunforceContestSummary, row: StoredResultRow): RunforceMemberBreakdownRow {
  return {
    contestId: contest.id,
    platform: contest.platform,
    contestName: contest.contestName,
    startTimeMs: contest.startTimeMs,
    finalRank: row.finalRank,
    participantCount: contest.participantCount,
    score: applyRunforceWeight(row.score, contest.weightMultiplier, isNonParticipant(row)),
    isUnratedParticipant: row.isUnratedParticipant,
  };
}

// 짝짓기/가중치 계산에 필요한 최소 필드 — 가중치가 붙기 전(RunforceContestRow)과 붙은 뒤
// (RunforceContestSummary) 양쪽에 똑같이 쓸 수 있게 제네릭으로 둡니다.
type PairableContest = { id: string; pairedContestId: string | null; division: RunforceDivision | null; startTimeMs: number };

export type ContestGroupOf<T> = { div1: T; div2: T } | { single: T };
export type ContestGroup = ContestGroupOf<RunforceContestSummary>;

// 대상 대회 목록을 "짝지어진 쌍"과 "단독 대회"로 나눕니다. 배열 순서와 무관하게(Div1이
// 먼저 나오든 Div2가 먼저 나오든) 항상 같은 결과가 나오도록 각 대회를 한 번씩만 방문합니다.
export function groupContests<T extends PairableContest>(contests: T[]): ContestGroupOf<T>[] {
  const byId = new Map(contests.map((c) => [c.id, c]));
  const visited = new Set<string>();
  const groups: ContestGroupOf<T>[] = [];

  for (const c of contests) {
    if (visited.has(c.id)) continue;
    visited.add(c.id);

    const partner = c.pairedContestId ? byId.get(c.pairedContestId) : undefined;
    if (partner && !visited.has(partner.id) && c.division && partner.division && c.division !== partner.division) {
      visited.add(partner.id);
      const div1 = c.division === "div1" ? c : partner;
      const div2 = c.division === "div1" ? partner : c;
      groups.push({ div1, div2 });
    } else {
      groups.push({ single: c });
    }
  }
  return groups;
}

// uid를 지정하면(마이페이지 등 회원 한 명만 필요할 때) 그 회원 행만 조회해서 훨씬
// 가볍게 계산합니다. 생략하면(리더보드용) 전체 회원의 breakdown을 한 번에 계산합니다.
async function computeEffectiveBreakdown(env: Env, filterUid?: string): Promise<Map<string, RunforceMemberBreakdownRow[]>> {
  const contests = await listTargetContests(env);
  const groups = groupContests(contests);
  const breakdownByUid = new Map<string, RunforceMemberBreakdownRow[]>();
  const addRow = (uid: string, row: RunforceMemberBreakdownRow) => {
    if (!breakdownByUid.has(uid)) breakdownByUid.set(uid, []);
    breakdownByUid.get(uid)!.push(row);
  };

  for (const group of groups) {
    if ("single" in group) {
      const rows = await getContestResultRows(env, group.single.id, filterUid);
      for (const r of rows) addRow(r.uid, toBreakdownRow(group.single, r));
      continue;
    }

    const { div1, div2 } = group;
    const [div1Rows, div2Rows] = await Promise.all([
      getContestResultRows(env, div1.id, filterUid),
      getContestResultRows(env, div2.id, filterUid),
    ]);
    const div2ByUid = new Map(div2Rows.map((r) => [r.uid, r]));
    const seenUids = new Set<string>();

    for (const d1 of div1Rows) {
      seenUids.add(d1.uid);
      if (d1.platformRank !== null) {
        // Div1에 실제로 참가 → Div1 점수를 씀.
        addRow(d1.uid, toBreakdownRow(div1, d1));
      } else {
        const d2 = div2ByUid.get(d1.uid);
        if (d2) addRow(d1.uid, toBreakdownRow(div2, d2));
        // Div2 스냅샷에도 이 회원 행이 없으면(둘 중 하나가 계산될 때 아직 활동회원이
        // 아니었던 경우 등) 이 쌍에서는 기여가 없는 게 맞습니다 — 다른 대회의 기존
        // "새 활동회원은 과거 대회 0점" 규칙과 같은 결.
      }
    }
    // Div1 스냅샷 시점엔 없었지만(그새 새로 활동회원이 됨) Div2 스냅샷엔 있는 회원 —
    // Div1에 참가했을 리 없으니 그대로 Div2 점수를 씁니다.
    for (const d2 of div2Rows) {
      if (!seenUids.has(d2.uid)) addRow(d2.uid, toBreakdownRow(div2, d2));
    }
  }

  return breakdownByUid;
}

export type RunforceLeaderboardEntry = {
  uid: string;
  name: string | null;
  avatarUrl: string | null;
  totalScore: number;
  contestsCounted: number;
};

// 이번 학기 활동회원 전원 대상, 총점 DESC. 점수 행이 하나도 없는 활동회원도
// 총점 0으로 포함합니다(시상 대상 명단 전체를 봐야 하므로).
export async function getRunforceLeaderboard(env: Env): Promise<RunforceLeaderboardEntry[]> {
  const { results } = await env.CONTENT_DB.prepare(
    `SELECT u.uid, u.name, u.avatar_url
     FROM users u
     JOIN semester_membership sm ON sm.uid = u.uid AND sm.status = 'approved'
     JOIN semesters s ON s.year = sm.year AND s.season = sm.season AND s.is_current = 1`,
  ).all<{ uid: string; name: string | null; avatar_url: string | null }>();

  const breakdownByUid = await computeEffectiveBreakdown(env);

  const entries: RunforceLeaderboardEntry[] = results.map((u) => {
    const rows = breakdownByUid.get(u.uid) ?? [];
    return {
      uid: u.uid,
      name: u.name,
      avatarUrl: u.avatar_url,
      totalScore: rows.reduce((sum, r) => sum + r.score, 0),
      contestsCounted: rows.length,
    };
  });
  entries.sort((a, b) => b.totalScore - a.totalScore);
  return entries;
}

// /api/me용. 총점 + 대회별 행 목록(최신순). 점수 행이 없으면 total=0, breakdown=[].
export async function getMemberRunforce(env: Env, uid: string): Promise<{ total: number; breakdown: RunforceMemberBreakdownRow[] }> {
  const breakdownByUid = await computeEffectiveBreakdown(env, uid);
  const breakdown = (breakdownByUid.get(uid) ?? []).sort((a, b) => b.startTimeMs - a.startTimeMs);
  const total = breakdown.reduce((sum, b) => sum + b.score, 0);
  return { total, breakdown };
}

// ---------- 자동탐색 큐 (크론이 호출) ----------
// "후보 목록 조회"(가벼움 — 플랫폼당 API 호출 한 번)와 "실제 계산"(무거움 — rated
// 확인·순위표 조회·unrated 참가자 확인까지 대회당 여러 API 호출)을 분리합니다.
// enqueueDiscoveredContests(매시 정각 + 저장 직후)가 후보를 찾자마자 전부
// runforce_discovery_queue에 넣고, processDiscoveryQueue(1분 간격 크론)가 큐에서 몇 개씩
// 꺼내 실제로 계산합니다 — 예전엔 한 틱에 최대 5개만 처리해서 밀린 대회가 많으면 다
// 채워지기까지 몇 시간씩 걸렸는데, 이제 몇 분이면 끝납니다.

export type RunforceDiscoveryQueueEntry = {
  id: string;
  platform: RunforcePlatform;
  contestId: string;
  contestName: string;
  startTimeMs: number;
  queuedAt: string;
};

// 한 번에 큐에서 꺼내 처리하는 개수 — 1분 안에 무리 없이 끝나도록 작게 잡습니다.
const QUEUE_BATCH_SIZE = 3;

export async function enqueueDiscoveredContests(env: Env): Promise<void> {
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

  const candidates: { platform: RunforcePlatform; contestId: string; contestName: string; startTimeMs: number }[] = [
    ...cfCandidates.map((c) => ({ platform: "codeforces" as const, contestId: c.id, contestName: c.name, startTimeMs: c.startTimeMs })),
    ...acCandidates.map((c) => ({ platform: "atcoder" as const, contestId: c.id, contestName: c.name, startTimeMs: c.startTimeMs })),
  ];

  // AtCoder는 이미 봇 대기열(runforce_atcoder_pending)에 올라간 것도 건너뜁니다 — 안 그러면
  // 매번 이 큐에도 새로 들어가서 processDiscoveryQueue가 같은 걸 계속 재확인하게 됩니다.
  const alreadyPendingIds = new Set((await listPendingAtCoderContests(env)).map((p) => p.contestId));

  for (const c of candidates) {
    if (c.platform === "atcoder" && alreadyPendingIds.has(c.contestId)) continue;
    const existing = await getTargetContestByPlatformId(env, c.platform, c.contestId);
    if (existing) continue; // 이미 등록됨 — 재계산 금지, 스킵

    await env.CONTENT_DB.prepare(
      `INSERT INTO runforce_discovery_queue (id, platform, contest_id, contest_name, start_time_ms)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (platform, contest_id) DO NOTHING`,
    )
      .bind(crypto.randomUUID(), c.platform, c.contestId, c.contestName, c.startTimeMs)
      .run();
  }
}

// 1분 크론이 부릅니다 — 큐에서 오래된 순으로 몇 개 꺼내 실제로 계산합니다. 먼저 큐에서
// 지운 뒤 계산하므로, 계산이 실패해도 이 항목이 큐에 무한히 남아 매분 재시도되진
// 않습니다(대신 다음 enqueueDiscoveredContests 때 아직 없으면 다시 큐에 들어옵니다).
export async function processDiscoveryQueue(env: Env): Promise<void> {
  const { results } = await env.CONTENT_DB.prepare(
    "SELECT id, platform, contest_id FROM runforce_discovery_queue ORDER BY queued_at ASC LIMIT ?1",
  )
    .bind(QUEUE_BATCH_SIZE)
    .all<{ id: string; platform: RunforcePlatform; contest_id: string }>();

  for (const row of results) {
    await env.CONTENT_DB.prepare("DELETE FROM runforce_discovery_queue WHERE id=?1").bind(row.id).run();

    const existing = await getTargetContestByPlatformId(env, row.platform, row.contest_id);
    if (existing) continue;

    try {
      if (row.platform === "atcoder") {
        await enqueueAtCoderPending(env, row.contest_id, { uid: null, name: null }, "auto");
      } else {
        await addTargetContest(env, row.platform, row.contest_id, { uid: null, name: null }, "auto");
      }
    } catch (err) {
      console.error(`RUNFORCE: 큐 처리 실패 (${row.platform}:${row.contest_id})`, err);
    }
  }
}

export async function listDiscoveryQueue(env: Env): Promise<RunforceDiscoveryQueueEntry[]> {
  const { results } = await env.CONTENT_DB.prepare(
    "SELECT id, platform, contest_id, contest_name, start_time_ms, queued_at FROM runforce_discovery_queue ORDER BY queued_at ASC",
  ).all<{ id: string; platform: RunforcePlatform; contest_id: string; contest_name: string; start_time_ms: number; queued_at: string }>();
  return results.map((r) => ({
    id: r.id,
    platform: r.platform,
    contestId: r.contest_id,
    contestName: r.contest_name,
    startTimeMs: r.start_time_ms,
    queuedAt: r.queued_at,
  }));
}

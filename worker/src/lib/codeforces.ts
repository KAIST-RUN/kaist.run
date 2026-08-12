// Codeforces 공식 공개 API(codeforces.com/api/*) — 인증 불필요. RUNFORCE의 대회
// 목록 자동탐색/rated 판정/순위 조회에 씁니다 (worker/src/lib/runforce.ts에서만 호출).

export class CodeforcesApiError extends Error {}

type CfApiResponse<T> = { status: "OK"; result: T } | { status: "FAILED"; comment: string };

// discord.ts::fetchDiscordAvatarUrl과 같은 관례: 429는 Retry-After만큼 대기 후 딱 한 번만
// 재시도, 나머지 비정상 응답은 바로 예외.
async function fetchCfApi<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get("Retry-After")) || 2;
      await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
      continue;
    }
    if (!res.ok) throw new CodeforcesApiError(`Codeforces API request failed: ${url} → ${res.status}`);
    const data = (await res.json()) as CfApiResponse<T>;
    if (data.status !== "OK") throw new CodeforcesApiError(`Codeforces API returned FAILED: ${url} → ${data.comment}`);
    return data.result;
  }
  throw new CodeforcesApiError(`Codeforces API rate-limited after retry: ${url}`);
}

export type CodeforcesContestSummary = {
  id: string; // Codeforces numeric contestId, stringified (플랫폼 ID를 항상 TEXT로 통일하는 관례 — runforce_contests.contest_id)
  name: string;
  startTimeMs: number;
};

type CfContestListEntry = {
  id: number;
  name: string;
  phase: string; // "BEFORE" | "CODING" | "PENDING_SYSTEM_TEST" | "SYSTEM_TEST" | "FINISHED"
  startTimeSeconds?: number;
};

let contestListCache: { fetchedAtMs: number; entries: CfContestListEntry[] } | null = null;
const CONTEST_LIST_CACHE_TTL_MS = 5 * 60 * 1000; // 전체 대회 목록(수천 건)을 한 번의 cron tick 안에서 여러 번 다시 받지 않도록 짧게 캐싱 (atcoder.ts::listAllKenkoooContests와 같은 이유)

async function listAllCodeforcesContests(): Promise<CfContestListEntry[]> {
  if (contestListCache && Date.now() - contestListCache.fetchedAtMs < CONTEST_LIST_CACHE_TTL_MS) return contestListCache.entries;
  // gym 대회는 클럽 내부 랭킹과 무관하므로 제외.
  const entries = await fetchCfApi<CfContestListEntry[]>("https://codeforces.com/api/contest.list?gym=false");
  contestListCache = { fetchedAtMs: Date.now(), entries };
  return entries;
}

// phase==='FINISHED'만, startTimeSeconds가 [startDate 00:00 KST, endDate 23:59:59 KST]
// 범위인 것만 남깁니다. "rated 여부"는 여기서 안 가립니다 — 공식 API가 대회 목록에 rated
// 여부를 별도 필드로 안 주므로, 실제 판정은 fetchCodeforcesContestRatingChanges가 빈
// 배열인지로 합니다.
export async function listCodeforcesContestsInRange(startDate: string, endDate: string): Promise<CodeforcesContestSummary[]> {
  const contests = await listAllCodeforcesContests();

  // KST(UTC+9) 기준 날짜 범위를 UTC epoch 초 경계로 변환.
  const rangeStartSec = Date.parse(`${startDate}T00:00:00+09:00`) / 1000;
  const rangeEndSec = Date.parse(`${endDate}T23:59:59+09:00`) / 1000;

  return contests
    .filter((c) => c.phase === "FINISHED" && typeof c.startTimeSeconds === "number")
    .filter((c) => c.startTimeSeconds! >= rangeStartSec && c.startTimeSeconds! <= rangeEndSec)
    .map((c) => ({ id: String(c.id), name: c.name, startTimeMs: c.startTimeSeconds! * 1000 }));
}

// 수동 추가(backstage) 시 대회 이름/시작시각 표시용 — contest.list를 재사용해서 해당
// contestId 하나만 찾습니다(전용 메타데이터 API가 따로 없고, contest.standings로 개별
// 조회하면 수천 행짜리 순위표 전체를 받아와야 해서 낭비). 못 찾으면 null(존재하지 않는
// ID이거나 아직 목록에 안 뜬 경우 — 호출부가 "대회를 찾을 수 없습니다" 에러로 처리).
export async function fetchCodeforcesContestMeta(contestId: string): Promise<CodeforcesContestSummary | null> {
  const contests = await listAllCodeforcesContests();
  const found = contests.find((c) => String(c.id) === contestId);
  if (!found || typeof found.startTimeSeconds !== "number") return null;
  return { id: String(found.id), name: found.name, startTimeMs: found.startTimeSeconds * 1000 };
}

export type CodeforcesRankEntry = { handle: string; rank: number };

type CfRatingChangeEntry = { handle: string; rank: number };

// GET /api/contest.ratingChanges?contestId={id} — 이 한 호출로 "그 대회의 모든 rated
// 참가자 → 순위" 매핑을 한 번에 얻습니다(페이지네이션이 필요한 contest.standings 대신
// 이걸 씁니다). 빈 배열이면 unrated 대회이거나 아직 레이팅 반영 전이라는 뜻 — 두 경우
// 다 "산정 대상 아님"으로 취급합니다. 존재하지 않는 contestId는 Codeforces API가
// status:"FAILED"로 응답하므로 fetchCfApi가 CodeforcesApiError를 던집니다.
export async function fetchCodeforcesContestRatingChanges(contestId: string): Promise<CodeforcesRankEntry[]> {
  const changes = await fetchCfApi<CfRatingChangeEntry[]>(
    `https://codeforces.com/api/contest.ratingChanges?contestId=${encodeURIComponent(contestId)}`,
  );
  return changes.map((c) => ({ handle: c.handle, rank: c.rank }));
}

// 수동 추가 시 rated 검증용 — ratingChanges가 비어있지 않은지만 봅니다.
export async function isCodeforcesContestRated(contestId: string): Promise<boolean> {
  const changes = await fetchCodeforcesContestRatingChanges(contestId);
  return changes.length > 0;
}

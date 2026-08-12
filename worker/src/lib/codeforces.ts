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

// ---------- unrated(OUT_OF_COMPETITION) 참가자 판정 ----------
// contest.standings API는 익명 요청에 showUnofficial 같은 추가 파라미터를 아예 거부합니다
// ("Non-gym contest standings for non-admin users are available only via anonymous GET
// requests with no extra parameters" — 직접 호출해서 확인함) — 즉 이 API로는 레이팅 상한
// 초과로 unrated 처리된 실시간 참가자를 못 봅니다(비인증 요청 결과엔 애초에 안 실림).
// 대신 user.status(특정 핸들의 제출 기록, 파라미터 제약 없음)의 각 제출에 딸린
// author.participantType으로 우회합니다: "CONTESTANT"=공식 rated 참가, "VIRTUAL"=가상
// 참가, "PRACTICE"=대회 종료 후 연습, "OUT_OF_COMPETITION"=실시간 참가했지만 unrated —
// 바로 이게 필요한 값입니다. 우리는 club 멤버 핸들만 확인하면 되므로(전체 참가자를 다
// 훑을 필요 없음) 이 방식으로 충분합니다.

type CfSubmission = { contestId?: number; creationTimeSeconds: number; author: { participantType: string } };

const USER_STATUS_PAGE_SIZE = 200;
// 최근 제출부터 최대 이만큼(200*5=1000개)만 훑습니다 — 대회 추가는 보통 대회가 끝난 직후
// 이루어지므로 이 정도면 충분하고, 한도 없이 훑으면 아주 활동적인 유저 한 명 때문에 대회
// 추가 요청 전체가 오래 걸릴 수 있어서 상한을 둡니다. 못 찾으면 안전하게 "확인 안 됨"으로
// 처리하고 그냥 미참가자 취급합니다(런타임 실패가 아니라 조용한 근사치).
const USER_STATUS_MAX_PAGES = 5;

// handle이 contestId에 실시간으로 참가했지만(virtual/practice 아님) unrated
// (OUT_OF_COMPETITION) 처리됐는지 확인합니다. contestStartSeconds는 "이 대회보다 오래된
// 제출까지 왔으면 더 찾을 필요 없다"는 조기 종료 조건에 씁니다(user.status는 최신 제출부터
// 역순으로 내려줌).
export async function isCodeforcesOutOfCompetitionParticipant(
  handle: string,
  contestId: string,
  contestStartSeconds: number,
): Promise<boolean> {
  const contestIdNum = Number(contestId);
  let from = 1;
  for (let page = 0; page < USER_STATUS_MAX_PAGES; page++) {
    const submissions = await fetchCfApi<CfSubmission[]>(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${USER_STATUS_PAGE_SIZE}`,
    );
    if (submissions.length === 0) return false; // 제출 기록이 더 없음

    for (const s of submissions) {
      if (s.contestId === contestIdNum) return s.author.participantType === "OUT_OF_COMPETITION";
    }

    const oldest = submissions[submissions.length - 1];
    if (oldest.creationTimeSeconds < contestStartSeconds) return false; // 이 대회보다 오래된 제출까지 왔는데 못 찾음 = 제출 자체가 없었음
    from += USER_STATUS_PAGE_SIZE;
  }
  return false; // USER_STATUS_MAX_PAGES 안에서 못 찾음 — 매우 활동적인 유저, 포기하고 미참가 취급
}

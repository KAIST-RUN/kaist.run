// AtCoder는 Codeforces와 달리 공식 공개 API가 없습니다. RUNFORCE는 두 개의 비공식/
// 커뮤니티 엔드포인트를 조합해 씁니다:
//   - kenkoooo AtCoder Problems API(contests.json)   — 대회 목록 + rated 여부 판정
//   - atcoder.jp/contests/{id}/results/json          — 대회별 참가자 순위(핸들→등수)
//
// ⚠️ 2026-08 실측: atcoder.jp 도메인 전체(이 API뿐 아니라 일반 대회 페이지까지)가
// Cloudflare Workers에서 나가는 요청을 403으로 차단합니다 — 같은 코드에서 같은 방식으로
// 호출하는 kenkoooo.com(다른 도메인, 마찬가지로 CloudFront 뒤에 있음)과 codeforces.com은
// 멀쩡히 응답하는데 atcoder.jp만 막히는 것까지 직접 확인했습니다. User-Agent를 바꿔봐도
// 안 뚫립니다 — 헤더 핑거프린팅이 아니라 발신 IP 대역(Cloudflare Workers egress) 자체를
// 막는 것으로 보입니다. 즉 fetchAtCoderStandings(순위 조회)는 지금 이 Worker 안에서는
// 원천적으로 안 됩니다 — 우회하려면 Cloudflare 밖의 다른 서버를 거치는 중계가 필요합니다.
// listAllKenkoooContests(대회 목록/rated 판정)는 다른 도메인이라 영향 없이 정상 동작합니다.

export class AtCoderApiError extends Error {}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new AtCoderApiError(`AtCoder API request failed: ${url} → ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new AtCoderApiError(`AtCoder API returned non-JSON: ${url} (${err instanceof Error ? err.message : String(err)})`);
  }
}

export type AtCoderContestSummary = {
  id: string; // 예: "abc300"
  name: string;
  startTimeMs: number;
};

type KenkoooContestEntry = {
  id: string;
  start_epoch_second: number;
  duration_second: number;
  title: string;
  rate_change: string; // "-"=unrated, "All"/"~ 1999"/"1200 ~ 2799" 등이면 rated
};

let contestsCache: { fetchedAtMs: number; entries: KenkoooContestEntry[] } | null = null;
const CONTESTS_CACHE_TTL_MS = 5 * 60 * 1000; // 전체 대회를 한 번에 내려주는 무거운 응답(수천 건)이라, 한 번의 cron tick 안에서 여러 번 다시 받지 않도록 짧게 캐싱

// contests.json은 전체 대회를 한 번에 내려주는 단일 JSON입니다(페이지네이션 없음).
async function listAllKenkoooContests(): Promise<KenkoooContestEntry[]> {
  if (contestsCache && Date.now() - contestsCache.fetchedAtMs < CONTESTS_CACHE_TTL_MS) return contestsCache.entries;
  const entries = await fetchJson<KenkoooContestEntry[]>("https://kenkoooo.com/atcoder/resources/contests.json");
  contestsCache = { fetchedAtMs: Date.now(), entries };
  return entries;
}

// start_epoch_second가 [startDate 00:00 KST, endDate 23:59:59 KST] 범위 안이고,
// rate_change !== "-"(unrated 제외 — AHC 등 마라톤형 대회는 대개 이걸로 걸러짐)이고,
// 이미 끝난(종료 시각이 현재보다 과거) 대회만 남깁니다.
// AHC(AtCoder Heuristic Contest)는 RUNFORCE 산정 대상이 아닙니다 — 알고리즘 레이팅과
// 완전히 별개인 휴리스틱 레이팅 대회이고, 보통 1~2주짜리 마라톤이라 "대회 한 판의 상대
// 등수"라는 이 시스템의 전제와도 안 맞습니다.
//
// ⚠️ rate_change로는 못 거릅니다: 실측(2026-08) 결과 AHC 69개가 전부 rate_change="All"이라
// unrated 필터를 그대로 통과합니다(예전 주석이 "AHC는 대개 '-'라 걸러진다"고 했는데 틀렸음).
// id 접두사와 제목 둘 중 하나만 맞아도 제외합니다 — 실측상 69개 전부 두 조건을 동시에
// 만족하지만, 둘 다 봐야 한쪽 표기가 바뀌어도 안전합니다.
// (참고: AHC 명명 이전의 마라톤 대회 몇 개 — future-contest-*, rcl-contest-*-long 등 —
//  는 이 패턴에 안 걸리지만 전부 2021~2023년 대회라, 자동 탐색 기간이 최대 6개월인 지금
//  구조에서는 사실상 범위에 들어올 일이 없습니다.)
export function isAtCoderHeuristicContest(contestId: string, title?: string): boolean {
  if (/^ahc\d/i.test(contestId.trim())) return true;
  return title !== undefined && /atcoder heuristic contest/i.test(title);
}

export async function listAtCoderContestsInRange(startDate: string, endDate: string): Promise<AtCoderContestSummary[]> {
  const contests = await listAllKenkoooContests();
  const rangeStartSec = Date.parse(`${startDate}T00:00:00+09:00`) / 1000;
  const rangeEndSec = Date.parse(`${endDate}T23:59:59+09:00`) / 1000;
  const nowSec = Date.now() / 1000;

  return contests
    .filter((c) => c.rate_change !== "-")
    .filter((c) => !isAtCoderHeuristicContest(c.id, c.title))
    .filter((c) => c.start_epoch_second >= rangeStartSec && c.start_epoch_second <= rangeEndSec)
    .filter((c) => c.start_epoch_second + c.duration_second <= nowSec)
    .map((c) => ({ id: c.id, name: c.title, startTimeMs: c.start_epoch_second * 1000 }));
}

// 수동 추가 시 rated 검증용 — 자동탐색과 동일한 기준(rate_change !== "-")을 재사용합니다.
export async function isAtCoderContestRated(contestId: string): Promise<boolean> {
  const contests = await listAllKenkoooContests();
  const found = contests.find((c) => c.id === contestId);
  if (!found) throw new AtCoderApiError(`AtCoder contest not found: ${contestId}`);
  return found.rate_change !== "-";
}

// 수동 추가(backstage) 시 대회 이름/시작시각 표시용 — codeforces.ts::fetchCodeforcesContestMeta와
// 같은 목적. contests.json 캐시를 재사용하므로 추가 API 호출이 없습니다.
export async function fetchAtCoderContestMeta(contestId: string): Promise<AtCoderContestSummary | null> {
  const contests = await listAllKenkoooContests();
  const found = contests.find((c) => c.id === contestId);
  if (!found) return null;
  return { id: found.id, name: found.title, startTimeMs: found.start_epoch_second * 1000 };
}

export type AtCoderRankEntry = { handle: string; rank: number };

type AtCoderResultEntry = { Place: number; UserScreenName: string };

// GET atcoder.jp/contests/{id}/results/json — 그 대회에 참가 등록한 전원(별도 로그인
// 불필요, 대회 종료 후 공개)을 Place(순위, 1-indexed) 기준으로 내려줍니다. Codeforces의
// contest.ratingChanges와 달리 IsRated=false인 참가자(레이팅 상한 초과 등으로 본인 레이팅은
// 안 바뀐 경우)도 포함되는데, 이 대회 자체는 이미 isAtCoderContestRated로 rated임을
// 확인했으므로 실제 대회 순위인 Place를 그대로 랭킹에 씁니다(레이팅 변동 여부와 무관하게
// 등수 자체는 유효한 성적).
export async function fetchAtCoderStandings(contestId: string): Promise<AtCoderRankEntry[]> {
  const results = await fetchJson<AtCoderResultEntry[]>(`https://atcoder.jp/contests/${encodeURIComponent(contestId)}/results/json`);
  return results.map((r) => ({ handle: r.UserScreenName, rank: r.Place }));
}

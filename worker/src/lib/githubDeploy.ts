import type { Env } from "../types";

// backstage에서 콘텐츠를 저장/삭제한 뒤 정적 사이트를 다시 빌드/배포하도록
// 기존 GitHub Actions 워크플로(.github/workflows/deploy.yml)를 재실행시킵니다.
// GITHUB_ACTIONS_TOKEN은 이 저장소의 "Actions: write" 권한만 있으면 되고,
// 코드/콘텐츠 파일을 직접 건드리지 않습니다 (컨텐츠는 D1이 원본).
export async function triggerRebuild(env: Env): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/deploy.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "kaist-run-backstage",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (!res.ok) {
    console.error(`Failed to trigger rebuild: ${res.status} ${await res.text()}`);
  }

  return { ok: res.ok, status: res.status };
}

// backstage 홈에 "마지막 배포 시각"을 보여주기 위한 조회입니다. 성공적으로 끝난 가장
// 최근 실행 하나만 있으면 되므로 per_page=1로 최소한만 가져옵니다. 실패해도(레이트리밋,
// 토큰 만료 등) 홈 화면 자체를 막을 이유는 없어서 null을 돌려주고 호출부가 조용히
// 숨기게 합니다.
export async function getLastDeployTime(env: Env): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/deploy.yml/runs?status=success&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "kaist-run-backstage",
        },
      },
    );
    if (!res.ok) {
      console.error(`Failed to fetch last deploy time: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json<{ workflow_runs: { updated_at: string }[] }>();
    return data.workflow_runs[0]?.updated_at ?? null;
  } catch (err) {
    console.error("Failed to fetch last deploy time", err);
    return null;
  }
}

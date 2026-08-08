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

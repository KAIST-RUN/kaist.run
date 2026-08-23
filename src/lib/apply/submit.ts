// 예전엔 브라우저가 구글 폼에 <iframe target>으로 크로스 오리진 제출을 했는데,
// CORS 때문에 응답을 전혀 읽을 수 없어서 400이 나도 화면엔 "제출 완료"가 떴습니다
// (worker/src/lib/applyForm.ts의 submitApplyForm 주석 참고). 이제 이 Worker
// 엔드포인트를 거쳐서 제출하고, 실제 성공/실패를 돌려받습니다.
//
// account/api.ts와 같은 이유로 상대경로 "/api/..."를 씁니다 — 프로덕션은 같은
// origin(kaist.run)이라 그대로 동작하고, 로컬 개발 중에만
// NEXT_PUBLIC_API_BASE_URL(.env.development.local)로 다른 포트의 Worker를 가리킵니다.
function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

// FormData를 그대로 넘기면 됩니다 — 체크박스처럼 같은 name이 여러 번 나오는 필드도
// URLSearchParams가 그대로 반복 키로 보존합니다.
export async function submitApplyForm(formData: FormData): Promise<boolean> {
  try {
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") params.append(key, value);
    }

    const res = await fetch(`${getApiBase()}/api/apply-form/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

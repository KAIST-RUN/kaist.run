// 화면에 RUNFORCE 점수를 보여줄 때 공통으로 쓰는 표시 변환 — worker/src/lib/runforce.ts의
// formatRunforceDisplay와 정확히 같은 규칙(원시 저장값은 대회별로 내림한 정수 그대로,
// 화면에는 1000으로 나눈 실수로 축약). 정수를 1000으로 나누면 소수점 이하 최대 3자리라
// toFixed(3)이 항상 정확히 떨어집니다. 프런트/워커가 별도 패키지라 이 규칙만 양쪽에
// 복제해두고, 프런트 안에서는(프로필 카드 총점 + 회원 정보 카드 대회별 내역) 여기서만 씁니다.
export function formatRunforceDisplay(rawScore: number): string {
  return (rawScore / 1000).toFixed(3);
}

// 총점을 "정수부는 크게, 소수부는 기본 크기"로 나눠 그리기 위한 분해 (UserProfileCard).
// 소수부는 점을 포함해서 돌려줍니다 — 렌더링 쪽에서 문자열을 다시 조합할 필요가 없도록.
export function splitRunforceDisplay(rawScore: number): { integerPart: string; fractionPart: string } {
  const [integerPart, fraction] = formatRunforceDisplay(rawScore).split(".");
  return { integerPart, fractionPart: `.${fraction}` };
}

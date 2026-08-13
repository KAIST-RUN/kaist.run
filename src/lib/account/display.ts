import type { CurrentUser } from "@/types/account";

// 프로필 사진이 없을 때 그 자리에 대신 넣는 이니셜 한 글자입니다.
// 헤더의 작은 원(AccountButton)과 마이페이지의 큰 원(UserProfileCard) 두 군데가 쓰는데,
// 둘이 서로 다른 글자를 보여주면 같은 사람인지 헷갈리므로 규칙을 여기 한 곳에 둡니다.
// 실명 → Discord 표시 이름 → Discord 사용자명 순으로, 셋 다 비어 있으면 "?"입니다.
// (닉네임은 일부러 안 씁니다 — 비워둘 수 있는 값이라 이니셜 근거로는 불안정합니다.)
export function avatarInitial(user: CurrentUser): string {
  const source = user.name ?? user.discordDisplayName ?? user.discordUsername;
  return source.trim().charAt(0).toUpperCase() || "?";
}

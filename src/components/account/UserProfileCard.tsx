import { useTranslations } from "next-intl";
import type { CurrentUser } from "@/types/account";

function Avatar({ user }: { user: CurrentUser }) {
  const initial = (user.name ?? user.discordDisplayName ?? user.discordUsername)
    .trim()
    .charAt(0)
    .toUpperCase();

  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        className="h-16 w-16 shrink-0 rounded-full border border-black/10 object-cover sm:h-20 sm:w-20 dark:border-white/15"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-black/10 bg-black/[.03] text-xl font-bold opacity-60 sm:h-20 sm:w-20 sm:text-2xl dark:border-white/15 dark:bg-white/[.05]"
    >
      {initial || "?"}
    </div>
  );
}

// 명예회원 지정이 학기 소속 승인보다 우선(별개 절차로 붙는 자격이라 활동 여부와
// 무관하게 항상 명예회원으로 보여줌), 그다음 이번 학기 소속 여부(=status==="member"
// — /api/me가 이미 "현재 학기에 approved됐는지"로 계산해서 내려줌)로 활동/휴회원을
// 가릅니다. status==="applicant"(한 번도 승인된 적 없음)도 여기선 휴회원과 같이
// 묶습니다 — 대기 중인 신청은 UserInfoCard의 소속 학기 목록에 "(승인 대기)"로 이미
// 따로 표시되니, 이 배지에서 또 구분할 필요가 없습니다.
function memberStatusLabel(user: CurrentUser, t: (key: string) => string): string {
  if (user.isHonoraryMember) return t("status.honorary");
  if (user.status === "member") return t("status.active");
  return t("status.inactive");
}

export default function UserProfileCard({ user }: { user: CurrentUser }) {
  const t = useTranslations("account");

  const displayName = user.name ?? user.discordDisplayName ?? `@${user.discordUsername}`;
  const discordHandle = user.discordDisplayName
    ? `${user.discordDisplayName} (@${user.discordUsername})`
    : `@${user.discordUsername}`;

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/10 p-6 text-center sm:flex-row sm:gap-6 sm:p-8 sm:text-left dark:border-white/15">
      <Avatar user={user} />
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <h2 className="text-xl font-bold sm:text-2xl">{displayName}</h2>
          <p className="text-sm opacity-60">{discordHandle}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold dark:border-white/15">
            {memberStatusLabel(user, t)}
          </span>
          {user.role === "admin" && (
            <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent-foreground)]">
              {t("adminBadge")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

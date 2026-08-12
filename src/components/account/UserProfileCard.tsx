import { useTranslations } from "next-intl";
import type { CurrentUser } from "@/types/account";
import { splitRunforceDisplay } from "@/lib/account/runforce";

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
// — /api/me가 이미 "현재 학기에 approved됐는지"로 계산해서 내려줌)로 활동회원을
// 가립니다. 남은 두 경우는 "한 번도 승인된 적 없음"(status==="applicant")이면
// 신규회원, 아니면(과거엔 승인됐었지만 이번 학기는 아님) 휴회원입니다.
function memberStatusLabel(user: CurrentUser, t: (key: string) => string): string {
  if (user.isHonoraryMember) return t("status.honorary");
  if (user.status === "member") return t("status.active");
  if (user.status === "applicant") return t("status.newMember");
  return t("status.inactive");
}

// 프로필 카드 오른쪽(모바일에선 아래)에 붙는 RUNFORCE 총점 블록 — 초록색 라벨 + 짧은
// 초록색 구분선 + 기본 텍스트 색 수치. 수치는 정수부만 크게 키우고 소수부는 기본 크기로
// 둡니다(자릿수가 늘어나도 한 줄에 안정적으로 들어가고, 눈이 정수부에 먼저 가도록).
// 대회별 내역은 여기 말고 회원 정보 카드(UserInfoCard의 RunforceRow)에 그대로 있습니다.
function RunforceStat({ user }: { user: CurrentUser }) {
  const t = useTranslations("account.runforce");
  const { integerPart, fractionPart } = splitRunforceDisplay(user.runforceTotal);

  // 블록 자체는 오른쪽 끝(sm:ml-auto)에 붙지만 안쪽 요소들은 항상 가운데 정렬입니다.
  // 구분선은 w-full이라 블록 폭 전체를 차지하고, 라벨에 px-3을 줘서 블록 폭이 라벨 글자
  // 폭보다 항상 넓어지게 만듭니다 — 덕분에 수치가 짧든(0.000) 길든 구분선이 "RUNFORCE"
  // 글자보다 확실히 깁니다.
  return (
    <div className="flex flex-col items-center gap-1.5 sm:ml-auto">
      <span className="px-3 text-sm font-bold tracking-wide text-[var(--accent)]">{t("label")}</span>
      <span aria-hidden="true" className="h-0.5 w-full rounded-full bg-[var(--accent)]" />
      <span className="font-bold tabular-nums">
        <span className="text-2xl sm:text-3xl">{integerPart}</span>
        <span className="text-base">{fractionPart}</span>
      </span>
    </div>
  );
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
      <RunforceStat user={user} />
    </div>
  );
}

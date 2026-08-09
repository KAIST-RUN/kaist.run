import { useTranslations } from "next-intl";
import type { CurrentUser } from "@/types/account";

// 최신순 정렬 — season은 문자열이라 그냥 비교하면 "spring" > "fall"이라 같은 해
// 안에서 순서가 뒤집히므로, 가을을 더 큰 값으로 취급해서 비교합니다.
function seasonRank(season: "spring" | "fall"): number {
  return season === "fall" ? 1 : 0;
}

// 회원 정보를 읽기 전용으로 보여주는 카드입니다. 수정 기능은 아직 없지만,
// 나중에 추가하기 쉽도록 페이지 본문과 분리된 컴포넌트로 둡니다.
// 보안: discordId(내부 식별자) 원문은 여기서도 절대 노출하지 않습니다.
export default function UserInfoCard({ user }: { user: CurrentUser }) {
  const t = useTranslations("account.memberInfo");

  const discordAccount = user.discordDisplayName
    ? `${user.discordDisplayName} (@${user.discordUsername})`
    : `@${user.discordUsername}`;

  const semesters = [...user.semesters].sort((a, b) => b.year - a.year || seasonRank(b.season) - seasonRank(a.season));

  const rows: { label: string; content: React.ReactNode }[] = [
    { label: t("name"), content: user.name ?? t("notRegistered") },
    { label: t("email"), content: user.email ?? "-" },
    { label: t("studentId"), content: user.studentId ?? "-" },
    {
      label: t("semesters"),
      content:
        semesters.length === 0 ? (
          "-"
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {semesters.map((s) => (
              <span
                key={`${s.year}-${s.season}`}
                className="rounded-full border border-black/10 px-2.5 py-0.5 text-xs font-semibold dark:border-white/15"
              >
                {t("semesterLabel", { year: s.year, season: t(`season.${s.season}`) })}
                {s.status === "pending" ? ` · ${t("pendingBadge")}` : ""}
              </span>
            ))}
          </div>
        ),
    },
    { label: t("discordAccount"), content: discordAccount },
  ];

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/10 p-6 dark:border-white/15 sm:p-8">
      <h2 className="text-lg font-bold sm:text-xl">{t("title")}</h2>
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="w-28 shrink-0 text-sm font-bold opacity-60">{row.label}</dt>
            <dd className="text-sm sm:text-base">{row.content}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

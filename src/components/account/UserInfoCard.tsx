import { useTranslations } from "next-intl";
import type { CurrentUser } from "@/types/account";

// 회원 정보를 읽기 전용으로 보여주는 카드입니다. 수정 기능은 아직 없지만,
// 나중에 추가하기 쉽도록 페이지 본문과 분리된 컴포넌트로 둡니다.
// 보안: discordId(내부 식별자) 원문은 여기서도 절대 노출하지 않습니다.
export default function UserInfoCard({ user }: { user: CurrentUser }) {
  const t = useTranslations("account.memberInfo");

  const discordAccount = user.discordDisplayName
    ? `${user.discordDisplayName} (@${user.discordUsername})`
    : `@${user.discordUsername}`;

  const rows: { label: string; value: string }[] = [
    { label: t("name"), value: user.name ?? t("notRegistered") },
    { label: t("email"), value: user.email ?? "-" },
    { label: t("studentId"), value: user.studentId ?? "-" },
    {
      label: t("joinedYear"),
      value: user.joinedYear != null ? t("joinedYearValue", { year: user.joinedYear }) : "-",
    },
    { label: t("discordAccount"), value: discordAccount },
  ];

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/10 p-6 dark:border-white/15 sm:p-8">
      <h2 className="text-lg font-bold sm:text-xl">{t("title")}</h2>
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="w-28 shrink-0 text-sm font-bold opacity-60">{row.label}</dt>
            <dd className="text-sm sm:text-base">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

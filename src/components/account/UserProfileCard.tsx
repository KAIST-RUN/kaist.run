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
            {t(`status.${user.status}`)}
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

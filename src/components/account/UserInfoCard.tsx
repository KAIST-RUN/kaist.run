"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CurrentUser } from "@/types/account";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { updateHandles } from "@/lib/account/api";

// 최신순 정렬 — season은 문자열이라 그냥 비교하면 "spring" > "fall"이라 같은 해
// 안에서 순서가 뒤집히므로, 가을을 더 큰 값으로 취급해서 비교합니다.
function seasonRank(season: "spring" | "fall"): number {
  return season === "fall" ? 1 : 0;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12.4 4.2l3.4 3.4-8.4 8.4-4 1 1-4 8-8.4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M10.8 5.8l3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

type HandleKey = "solvedAc" | "codeforces" | "atcoder";

// solved.ac/Codeforces/AtCoder 핸들 — 본인이 직접 볼 수도, 연필 아이콘으로 바로
// 고칠 수도 있습니다(이름/이메일/학번과 달리 신원 정보가 아니라서 본인 수정 허용 —
// worker/src/routes/me.ts의 POST /handles 참고). 저장 성공 시 useCurrentUser().refetch()로
// 카드 전체(마이페이지 공유 상태)를 최신화합니다.
function HandlesRow({ user }: { user: CurrentUser }) {
  const t = useTranslations("account.memberInfo.handles");
  const { refetch } = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({
    solvedAc: user.solvedAc ?? "",
    codeforces: user.codeforces ?? "",
    atcoder: user.atcoder ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const platforms: { key: HandleKey; label: string }[] = [
    { key: "solvedAc", label: t("solvedAc") },
    { key: "codeforces", label: t("codeforces") },
    { key: "atcoder", label: t("atcoder") },
  ];

  function startEdit() {
    setValues({ solvedAc: user.solvedAc ?? "", codeforces: user.codeforces ?? "", atcoder: user.atcoder ?? "" });
    setError(false);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(false);
    const ok = await updateHandles(values);
    setSaving(false);
    if (!ok) {
      setError(true);
      return;
    }
    setEditing(false);
    refetch();
  }

  if (editing) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        {platforms.map((p) => (
          <div key={p.key} className="flex items-center gap-2">
            <label className="w-20 shrink-0 text-xs opacity-60" htmlFor={`handle-${p.key}`}>
              {p.label}
            </label>
            <input
              id={`handle-${p.key}`}
              type="text"
              value={values[p.key]}
              onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
              placeholder={t("placeholder")}
              disabled={saving}
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-black/30 disabled:opacity-50 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>
        ))}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{t("saveError")}</p>}
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {saving ? t("saving") : t("save")}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-50 dark:border-white/15"
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    );
  }

  const filled = platforms.filter((p) => user[p.key]);

  return (
    <div className="flex items-start justify-between gap-3">
      {filled.length === 0 ? (
        <span className="text-sm sm:text-base">{t("empty")}</span>
      ) : (
        <div className="flex flex-col gap-1 text-sm sm:text-base">
          {filled.map((p) => (
            <span key={p.key}>
              <span className="opacity-60">{p.label}</span> {user[p.key]}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={startEdit}
        aria-label={t("edit")}
        className="shrink-0 rounded-full p-1.5 opacity-50 transition-opacity hover:opacity-100"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

const PLATFORM_LABEL: Record<"codeforces" | "atcoder", string> = { codeforces: "Codeforces", atcoder: "AtCoder" };

// 화면에 RUNFORCE 점수를 보여줄 때 공통으로 쓰는 표시 변환 — worker/src/lib/runforce.ts의
// formatRunforceDisplay와 정확히 같은 규칙(원시 저장값은 대회별로 내림한 정수 그대로,
// 화면에는 1000으로 나눈 실수로 축약). 정수를 1000으로 나누면 소수점 이하 최대 3자리라
// toFixed(3)이 항상 정확히 떨어집니다. 프런트/워커가 별도 패키지라 이 한 줄을 공유할
// 방법이 없어 그대로 복제합니다.
function formatRunforceDisplay(rawScore: number): string {
  return (rawScore / 1000).toFixed(3);
}

// RUNFORCE 총점 + 대회별 내역(접었다 폈다). 읽기 전용 — HandlesRow와 달리 본인이
// 고칠 수 있는 값이 아니라 별도 fetch 없이 이미 /api/me 페이로드에 실려 온 값을
// 그대로 보여주기만 합니다.
function RunforceRow({ user }: { user: CurrentUser }) {
  const t = useTranslations("account.memberInfo.runforce");
  const [expanded, setExpanded] = useState(false);

  // 집계된 대회가 하나도 없어도 총점(0.000)과 펼치기 버튼은 그대로 보여줍니다 — 점수가
  // 0인 것과 기능이 없는 것을 구분해서, 펼쳤을 때 "대상 대회가 아직 없다"는 안내를 봅니다.
  const breakdown = [...user.runforceBreakdown].sort((a, b) => b.startTimeMs - a.startTimeMs);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold sm:text-base">{t("total", { score: formatRunforceDisplay(user.runforceTotal) })}</span>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-fit text-xs underline opacity-60 transition-opacity hover:opacity-100"
      >
        {expanded ? t("hideBreakdown") : t("showBreakdown")}
      </button>
      {expanded &&
        (breakdown.length === 0 ? (
          <p className="text-xs opacity-70 sm:text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs sm:text-sm">
            {breakdown.map((b) => (
              <li key={b.contestId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span>
                  <span className="opacity-60">[{PLATFORM_LABEL[b.platform]}]</span> {b.contestName}
                </span>
                <span className="whitespace-nowrap opacity-70">
                  {t("rankOf", { rank: b.finalRank + 1, total: b.participantCount })}
                  {b.isUnratedParticipant ? ` ${t("unratedNote")}` : ""} · {formatRunforceDisplay(b.score)}
                  {t("pointsSuffix")}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

// 회원 정보를 보여주는 카드입니다. 대부분 읽기 전용이지만, 핸들 행만은 본인이
// 직접 고칠 수 있습니다(위 HandlesRow).
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
    { label: t("handles.label"), content: <HandlesRow user={user} /> },
    { label: t("runforce.label"), content: <RunforceRow user={user} /> },
    { label: t("discordAccount"), content: discordAccount },
  ];

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/10 p-6 dark:border-white/15 sm:p-8">
      <h2 className="text-lg font-bold sm:text-xl">{t("title")}</h2>
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="w-28 shrink-0 text-sm font-bold opacity-60">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-sm sm:text-base">{row.content}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

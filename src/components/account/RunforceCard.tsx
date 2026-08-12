"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CurrentUser } from "@/types/account";
import { formatRunforceDisplay } from "@/lib/account/runforce";

// RUNFORCE 대회별 내역 카드 — 회원 정보 카드 아래에 독립 카드로 놓습니다. 총점 자체는
// 프로필 카드(UserProfileCard의 RunforceStat)가 크게 보여주므로 여기선 안 반복하고,
// 펼치면 집계된 대회 전체 목록을 보여줍니다. 읽기 전용이라 별도 fetch 없이 이미
// /api/me 페이로드에 실려 온 값만 씁니다.
export default function RunforceCard({ user }: { user: CurrentUser }) {
  const t = useTranslations("account.runforce");
  const [expanded, setExpanded] = useState(false);

  // 최신 대회가 위로. 집계된 대회가 하나도 없어도 카드와 펼치기 버튼은 그대로 두고,
  // 펼쳤을 때 "대상 대회가 아직 없다"는 안내를 보여줍니다.
  const breakdown = [...user.runforceBreakdown].sort((a, b) => b.startTimeMs - a.startTimeMs);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 sm:p-8 dark:border-white/15">
      <h2 className="text-lg font-bold sm:text-xl">{t("title")}</h2>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-fit cursor-pointer text-xs underline opacity-60 transition-opacity hover:opacity-100"
      >
        {expanded ? t("hideBreakdown") : t("showBreakdown")}
      </button>

      {expanded &&
        (breakdown.length === 0 ? (
          <p className="text-xs opacity-70 sm:text-sm">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {breakdown.map((b) => (
              <li key={b.contestId} className="flex flex-col gap-0.5">
                <span className="text-xs opacity-60 sm:text-sm">{b.contestName}</span>
                {/* unrated 참가는 등수 자체가 의미 없어서(공식 순위표에 안 잡힘) #N 대신
                    "Unrated"로 대체합니다 — 점수는 별도 규칙으로 계산된 값 그대로 표시. */}
                <span className="text-sm font-semibold tabular-nums sm:text-base">
                  +{formatRunforceDisplay(b.score)} · {b.isUnratedParticipant ? t("unratedLabel") : `#${b.finalRank + 1}`}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

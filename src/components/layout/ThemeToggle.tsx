"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

export default function ThemeToggle() {
  const t = useTranslations("theme");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("toggle")}
      title={t("toggle")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-sm transition-opacity hover:opacity-70 dark:border-white/10"
    >
      {!mounted ? null : isDark ? "🌙" : "☀️"}
    </button>
  );
}

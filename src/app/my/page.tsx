"use client";

import { useEffect } from "react";
import { routing } from "@/i18n/routing";
import { withBasePath } from "@/lib/basePath";

export default function MyPageRedirect() {
  useEffect(() => {
    const saved = window.localStorage.getItem("NEXT_LOCALE");
    const browserLang = navigator.language.toLowerCase();
    const target =
      saved && (routing.locales as readonly string[]).includes(saved)
        ? saved
        : browserLang.startsWith("en")
          ? "en"
          : routing.defaultLocale;

    window.location.replace(withBasePath(`/${target}/my/`));
  }, []);

  return (
    <noscript>
      <p>
        <a href={withBasePath("/ko/my/")}>한국어</a> ·{" "}
        <a href={withBasePath("/en/my/")}>English</a>
      </p>
    </noscript>
  );
}

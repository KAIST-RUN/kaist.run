"use client";

import { useEffect } from "react";
import { RECRUIT_FORM_URL } from "@/lib/recruit";

export default function RecruitRedirect() {
  useEffect(() => {
    window.location.replace(RECRUIT_FORM_URL);
  }, []);

  return (
    <noscript>
      <p>
        <a href={RECRUIT_FORM_URL}>{RECRUIT_FORM_URL}</a>
      </p>
    </noscript>
  );
}

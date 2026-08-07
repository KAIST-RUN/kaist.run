"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { NAV_ITEMS } from "./nav-items";
import ScrollTopLink from "./ScrollTopLink";

export default function MobileNav() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        className="flex h-9 w-9 shrink-0 translate-y-1 items-center justify-center transition-opacity hover:opacity-70"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
          <path
            d="M2.5 5.5h15M2.5 10h15M2.5 14.5h15"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ease-in-out ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col gap-1 bg-[var(--background)] px-6 py-5 shadow-xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        inert={!open}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("closeMenu")}
          className="mb-2 flex h-9 w-9 shrink-0 items-center justify-center self-end transition-opacity hover:opacity-70"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {NAV_ITEMS.map((item) => {
          const ItemLink = item.href === "/" ? ScrollTopLink : Link;
          return (
            <ItemLink
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2.5 text-base opacity-80 transition-opacity hover:opacity-100"
            >
              {t(item.key)}
            </ItemLink>
          );
        })}
      </div>
    </div>
  );
}

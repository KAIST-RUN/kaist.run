"use client";

import type { ComponentProps, MouseEvent } from "react";
import { usePathname, Link } from "@/i18n/navigation";

export default function ScrollTopLink({
  href,
  onClick,
  ...props
}: ComponentProps<typeof Link>) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (pathname === href) {
          document.getElementById("main-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      {...props}
    />
  );
}

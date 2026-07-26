import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Locale } from "@/i18n/routing";

const CONTACT_DIR = path.join(process.cwd(), "content", "contact");

export type ContactInfoLine = {
  text: string;
  href?: string;
};

export type ContactInfoRow = {
  label: string;
  lines: ContactInfoLine[];
};

export type ContactSocial = {
  platform: "instagram" | "github" | "discord" | "email" | "x";
  label: string;
  url: string;
};

export type ContactFrontmatter = {
  title: string;
  info?: ContactInfoRow[];
  socials?: ContactSocial[];
};

export type Contact = ContactFrontmatter & { content: string };

export function getContact(locale: Locale): Contact | null {
  const filePath = path.join(CONTACT_DIR, `${locale}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return { content, ...(data as ContactFrontmatter) };
}

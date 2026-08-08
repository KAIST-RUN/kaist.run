import type { Locale } from "@/i18n/routing";
import { fetchContentJson } from "./api";

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

type ApiContact = {
  title: string;
  info: ContactInfoRow[];
  socials: ContactSocial[];
  content: string;
};

export async function getContact(locale: Locale): Promise<Contact | null> {
  return fetchContentJson<ApiContact>(`/contact/${locale}`);
}

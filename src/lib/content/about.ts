import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Locale } from "@/i18n/routing";

const ABOUT_DIR = path.join(process.cwd(), "content", "about");

export type AboutFrontmatter = {
  title: string;
};

export type About = AboutFrontmatter & { content: string };

export function getAbout(locale: Locale): About | null {
  const filePath = path.join(ABOUT_DIR, `${locale}.md`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  return { content, ...(data as AboutFrontmatter) };
}

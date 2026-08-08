// content/ 마크다운 파일들을 읽어서 worker/migrations/0002_seed.sql을 생성합니다.
// 한 번만 실행하는 마이그레이션용 스크립트입니다 (D1로 옮긴 뒤에는 backstage가
// 콘텐츠를 직접 관리하므로 다시 실행할 일이 없습니다).
//
// 실행: node scripts/generate-d1-seed.mjs
// 적용: cd worker && npx wrangler d1 execute kaist-run-content --remote --file=migrations/0002_seed.sql

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const OUT_FILE = path.join(ROOT, "worker", "migrations", "0002_seed.sql");
const LOCALES = ["ko", "en"];
const SEASONS = ["spring", "fall"];

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const statements = [];

// ---------- notices ----------
for (const locale of LOCALES) {
  const dir = path.join(CONTENT_DIR, "notices", locale);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const slug = file.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const { data, content } = matter(raw);
    statements.push(
      `INSERT INTO notices (slug, locale, title, date, pinned, content) VALUES (${sqlString(slug)}, ${sqlString(locale)}, ${sqlString(data.title)}, ${sqlString(data.date)}, ${data.pinned ? 1 : 0}, ${sqlString(content.trim())});`,
    );
  }
}

// ---------- archive ----------
for (const season of SEASONS) {
  const seasonDir = path.join(CONTENT_DIR, "archive", season);
  if (!fs.existsSync(seasonDir)) continue;
  for (const slug of fs.readdirSync(seasonDir)) {
    const entryDir = path.join(seasonDir, slug);
    if (!fs.statSync(entryDir).isDirectory()) continue;
    for (const locale of LOCALES) {
      const filePath = path.join(entryDir, `${locale}.md`);
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf8");
      const { data, content } = matter(raw);
      statements.push(
        `INSERT INTO archive_entries (slug, season, locale, title, year, date, resources, judges, content) VALUES (${sqlString(slug)}, ${sqlString(season)}, ${sqlString(locale)}, ${sqlString(data.title)}, ${data.year}, ${sqlString(data.date)}, ${sqlString(JSON.stringify(data.resources ?? []))}, ${sqlString(JSON.stringify(data.judges ?? []))}, ${sqlString(content.trim())});`,
      );
    }
  }
}

// ---------- contact ----------
for (const locale of LOCALES) {
  const filePath = path.join(CONTENT_DIR, "contact", `${locale}.md`);
  if (!fs.existsSync(filePath)) continue;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  statements.push(
    `INSERT INTO contact_page (locale, title, info, socials, content) VALUES (${sqlString(locale)}, ${sqlString(data.title)}, ${sqlString(JSON.stringify(data.info ?? []))}, ${sqlString(JSON.stringify(data.socials ?? []))}, ${sqlString(content.trim())});`,
  );
}

fs.writeFileSync(OUT_FILE, statements.join("\n") + "\n", "utf8");
console.log(`[generate-d1-seed] Wrote ${statements.length} INSERT statements to ${path.relative(ROOT, OUT_FILE)}`);

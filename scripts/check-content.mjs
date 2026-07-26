import fs from "node:fs";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "content");
const LOCALES = ["ko", "en"];
const SEASONS = ["spring", "fall"];

let hasError = false;

function fail(message) {
  console.error(`[check-content] ${message}`);
  hasError = true;
}

function listMarkdownSlugs(dir) {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, "")),
  );
}

function checkNotices() {
  const dirs = LOCALES.map((locale) => path.join(CONTENT_DIR, "notices", locale));
  const [koSlugs, enSlugs] = dirs.map(listMarkdownSlugs);

  for (const slug of koSlugs) {
    if (!enSlugs.has(slug)) {
      fail(`notices: missing content/notices/en/${slug}.md (found ko version)`);
    }
  }
  for (const slug of enSlugs) {
    if (!koSlugs.has(slug)) {
      fail(`notices: missing content/notices/ko/${slug}.md (found en version)`);
    }
  }
}

function checkArchive() {
  for (const season of SEASONS) {
    const seasonDir = path.join(CONTENT_DIR, "archive", season);
    if (!fs.existsSync(seasonDir)) continue;

    for (const slug of fs.readdirSync(seasonDir)) {
      const entryDir = path.join(seasonDir, slug);
      if (!fs.statSync(entryDir).isDirectory()) continue;

      for (const locale of LOCALES) {
        const file = path.join(entryDir, `${locale}.md`);
        if (!fs.existsSync(file)) {
          fail(`archive: missing content/archive/${season}/${slug}/${locale}.md`);
        }
      }
    }
  }
}

function checkSinglePage(name) {
  for (const locale of LOCALES) {
    const file = path.join(CONTENT_DIR, name, `${locale}.md`);
    if (!fs.existsSync(file)) {
      fail(`${name}: missing content/${name}/${locale}.md`);
    }
  }
}

checkNotices();
checkArchive();
checkSinglePage("about");
checkSinglePage("contact");

if (hasError) {
  console.error(
    "[check-content] Content is out of sync between languages. Fix the issues above before building.",
  );
  process.exit(1);
}

console.log("[check-content] OK — notices and archive content are in sync across locales.");

import { Hono } from "hono";
import type { Env } from "../types";
import { requireAdmin } from "../lib/authGuard";
import { clearSessionCookie } from "./auth";
import { triggerRebuild } from "../lib/githubDeploy";
import {
  listNotices,
  getNotice,
  upsertNotice,
  deleteNotice,
  listArchiveEntries,
  getArchiveEntry,
  upsertArchiveEntry,
  deleteArchiveEntry,
  getContact,
  upsertContact,
  type Season,
} from "../lib/content";
import { listUploads, storeUpload, deleteUpload } from "../lib/uploads";
import {
  renderBackstageHome,
  renderNoticeList,
  renderNoticeForm,
  renderArchiveList,
  renderArchiveForm,
  archiveRowsToFormData,
  renderContactForm,
  contactRowsToFormData,
  renderUploadList,
  type NoticeFormData,
} from "../lib/backstageRender";
import { renderErrorPage } from "../lib/emailRender";

// backstage.kaist.run 전용 라우트. wrangler.jsonc의 "backstage.kaist.run/*" 라우트만
// 이 핸들러로 오고, kaist.run 쪽 경로에는 영향이 없습니다 (index.ts에서 app.route("/", backstage)로
// 마운트하지만, kaist.run에는 애초에 "/" 패턴의 Worker 라우트 자체가 없어서 겹치지 않음).
export const backstage = new Hono<{ Bindings: Env }>();

// 모바일 Firefox 등이 주소창에 backstage.kaist.run을 타이핑하는 동안 자동완성으로
// 목적지를 미리 요청(speculative prefetch)하는 경우가 있는데, 이 요청은 쿠키 없이
// 나갑니다. Cache-Control 없이 두면 그때 받은 "로그인 안 됨 → /api/auth/discord로
// 리다이렉트" 302 응답이 브라우저에 캐시됐다가, 바로 뒤의 진짜(쿠키 포함) 요청에도
// 그대로 재사용돼서 실제로는 로그인돼 있어도 계속 Discord 로그인 화면으로 튕기는
// 문제가 있었습니다. 세션에 따라 완전히 달라지는 응답이라 캐시되면 안 됩니다.
backstage.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

function isSeason(value: string | undefined): value is Season {
  return value === "spring" || value === "fall";
}

async function readForm(c: { req: { parseBody(): Promise<Record<string, unknown>> } }) {
  const body = await c.req.parseBody();
  const get = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
  return { body, get };
}

// 자료 목록/온라인 저지 행 UI(backstageRender.ts의 archiveRowsField)가 보내는
// name="...[]" 필드를 읽습니다. hono의 parseBody는 "[]"로 끝나는 키를 값이
// 하나뿐이어도 항상 배열로 묶어줍니다.
function getFormArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

// "이름" / "링크" 두 배열을 같은 인덱스끼리 짝지어, 둘 다 비어 있는 행(빈 채로
// 남겨둔 행)은 건너뜁니다.
function zipRows(names: string[], links: string[]): { name: string; link: string }[] {
  const rows: { name: string; link: string }[] = [];
  const len = Math.max(names.length, links.length);
  for (let i = 0; i < len; i++) {
    const name = (names[i] ?? "").trim();
    const link = (links[i] ?? "").trim();
    if (!name && !link) continue;
    rows.push({ name, link });
  }
  return rows;
}

function readArchiveResources(body: Record<string, unknown>) {
  return zipRows(getFormArray(body, "resourceLabel[]"), getFormArray(body, "resourceFile[]")).map((r) => ({
    file: r.link,
    label: r.name || r.link,
  }));
}

function readArchiveJudges(body: Record<string, unknown>) {
  return zipRows(getFormArray(body, "judgeName[]"), getFormArray(body, "judgeUrl[]")).map((j) => ({
    name: j.name,
    url: j.link,
  }));
}

backstage.get("/", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  return c.html(renderBackstageHome(gate.member));
});

// nav의 로그아웃 버튼(backstageRender.ts의 shell)과 403 페이지의 "로그아웃" 액션이
// 여기로 폼 제출합니다. 로그인 상태 확인 없이 그냥 지우기만 하면 되므로 requireAdmin
// 게이트가 필요 없습니다 — 로그아웃은 항상 허용해도 안전합니다.
backstage.post("/logout", async (c) => {
  await clearSessionCookie(c);
  return c.redirect("/");
});

// ---------- notices ----------

backstage.get("/notices", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const notices = await listNotices(c.env, "ko");
  return c.html(renderNoticeList(notices));
});

backstage.get("/notices/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const empty: NoticeFormData = { slug: "", date: "", pinned: false, titleKo: "", titleEn: "", contentKo: "", contentEn: "" };
  return c.html(renderNoticeForm("new", empty));
});

backstage.post("/notices/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  const data: NoticeFormData = {
    slug: get("slug").trim(),
    date: get("date"),
    pinned: get("pinned") === "on",
    titleKo: get("titleKo"),
    titleEn: get("titleEn"),
    contentKo: get("contentKo"),
    contentEn: get("contentEn"),
  };

  if (!/^[a-z0-9-]+$/.test(data.slug)) {
    return c.html(renderNoticeForm("new", data, "슬러그는 영문 소문자/숫자/하이픈만 가능합니다."), 400);
  }
  if (await getNotice(c.env, "ko", data.slug)) {
    return c.html(renderNoticeForm("new", data, "이미 존재하는 슬러그입니다."), 400);
  }

  await upsertNotice(c.env, data.slug, "ko", { title: data.titleKo, date: data.date, pinned: data.pinned, content: data.contentKo });
  await upsertNotice(c.env, data.slug, "en", { title: data.titleEn, date: data.date, pinned: data.pinned, content: data.contentEn });
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/notices");
});

backstage.get("/notices/:slug/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const slug = c.req.param("slug");
  const [ko, en] = await Promise.all([getNotice(c.env, "ko", slug), getNotice(c.env, "en", slug)]);
  if (!ko && !en) return c.html(renderErrorPage("찾을 수 없습니다", "존재하지 않는 공지입니다."), 404);

  const base = ko ?? en!;
  const data: NoticeFormData = {
    slug,
    date: base.date,
    pinned: base.pinned,
    titleKo: ko?.title ?? "",
    titleEn: en?.title ?? "",
    contentKo: ko?.content ?? "",
    contentEn: en?.content ?? "",
  };
  return c.html(renderNoticeForm("edit", data));
});

backstage.post("/notices/:slug/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const slug = c.req.param("slug");
  const { get } = await readForm(c);
  const data: NoticeFormData = {
    slug,
    date: get("date"),
    pinned: get("pinned") === "on",
    titleKo: get("titleKo"),
    titleEn: get("titleEn"),
    contentKo: get("contentKo"),
    contentEn: get("contentEn"),
  };

  await upsertNotice(c.env, slug, "ko", { title: data.titleKo, date: data.date, pinned: data.pinned, content: data.contentKo });
  await upsertNotice(c.env, slug, "en", { title: data.titleEn, date: data.date, pinned: data.pinned, content: data.contentEn });
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/notices");
});

backstage.post("/notices/:slug/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  await deleteNotice(c.env, c.req.param("slug"));
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/notices");
});

// ---------- archive ----------

// 네비게이션의 "대회 아카이브"는 시즌 없이 그냥 /archive로 가는데, 실제 목록은
// 시즌별로만 있어서 기본값(봄)으로 보내줍니다.
backstage.get("/archive", (c) => c.redirect("/archive/spring"));

backstage.get("/archive/:season", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const season = c.req.param("season");
  if (!isSeason(season)) return c.notFound();

  const entries = await listArchiveEntries(c.env, season, "ko");
  return c.html(renderArchiveList(season, entries));
});

backstage.get("/archive/:season/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const season = c.req.param("season");
  if (!isSeason(season)) return c.notFound();

  const empty = archiveRowsToFormData(season, "", null, null);
  return c.html(renderArchiveForm("new", empty));
});

backstage.post("/archive/:season/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const season = c.req.param("season");
  if (!isSeason(season)) return c.notFound();

  const { body, get } = await readForm(c);
  const slug = get("slug").trim();
  const formData = {
    slug,
    season,
    year: get("year"),
    date: get("date"),
    titleKo: get("titleKo"),
    titleEn: get("titleEn"),
    contentKo: get("contentKo"),
    contentEn: get("contentEn"),
    resources: readArchiveResources(body),
    judges: readArchiveJudges(body),
  };

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return c.html(renderArchiveForm("new", formData, "슬러그는 영문 소문자/숫자/하이픈만 가능합니다."), 400);
  }
  if (await getArchiveEntry(c.env, season, "ko", slug)) {
    return c.html(renderArchiveForm("new", formData, "이미 존재하는 슬러그입니다."), 400);
  }

  const { resources, judges } = formData;
  const year = Number.parseInt(formData.year, 10);

  await upsertArchiveEntry(c.env, slug, season, "ko", { title: formData.titleKo, year, date: formData.date, resources, judges, content: formData.contentKo });
  await upsertArchiveEntry(c.env, slug, season, "en", { title: formData.titleEn, year, date: formData.date, resources, judges, content: formData.contentEn });
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect(`/archive/${season}`);
});

backstage.get("/archive/:season/:slug/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const season = c.req.param("season");
  const slug = c.req.param("slug");
  if (!isSeason(season)) return c.notFound();

  const [ko, en] = await Promise.all([
    getArchiveEntry(c.env, season, "ko", slug),
    getArchiveEntry(c.env, season, "en", slug),
  ]);
  if (!ko && !en) return c.html(renderErrorPage("찾을 수 없습니다", "존재하지 않는 대회입니다."), 404);

  const data = archiveRowsToFormData(season, slug, ko, en);
  return c.html(renderArchiveForm("edit", data));
});

backstage.post("/archive/:season/:slug/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const season = c.req.param("season");
  const slug = c.req.param("slug");
  if (!isSeason(season)) return c.notFound();

  const { body, get } = await readForm(c);
  const resources = readArchiveResources(body);
  const judges = readArchiveJudges(body);
  const year = Number.parseInt(get("year"), 10);
  const date = get("date");

  await upsertArchiveEntry(c.env, slug, season, "ko", { title: get("titleKo"), year, date, resources, judges, content: get("contentKo") });
  await upsertArchiveEntry(c.env, slug, season, "en", { title: get("titleEn"), year, date, resources, judges, content: get("contentEn") });
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect(`/archive/${season}`);
});

backstage.post("/archive/:season/:slug/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const season = c.req.param("season");
  const slug = c.req.param("slug");
  if (!isSeason(season)) return c.notFound();

  await deleteArchiveEntry(c.env, slug, season);
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect(`/archive/${season}`);
});

// ---------- contact ----------

backstage.get("/contact", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const [ko, en] = await Promise.all([getContact(c.env, "ko"), getContact(c.env, "en")]);
  const data = contactRowsToFormData(ko, en);
  return c.html(renderContactForm(data));
});

backstage.post("/contact", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  const phone = get("phone");
  const presidentEmail = get("presidentEmail");
  const clubEmail = get("clubEmail");
  const instagramUrl = get("instagramUrl");
  const githubUrl = get("githubUrl");
  const contentKo = get("extraKo");
  const contentEn = get("extraEn");

  const socials = [
    instagramUrl ? { platform: "instagram", label: "Instagram", url: instagramUrl } : null,
    githubUrl ? { platform: "github", label: "GitHub", url: githubUrl } : null,
  ].filter((s): s is { platform: string; label: string; url: string } => s !== null);

  await upsertContact(c.env, "ko", {
    title: "연락처",
    info: [
      {
        label: "회장",
        lines: [
          { text: get("presidentNameKo") },
          { text: phone },
          { text: presidentEmail, href: `mailto:${presidentEmail}` },
        ],
      },
      { label: "동아리 이메일", lines: [{ text: clubEmail, href: `mailto:${clubEmail}` }] },
    ],
    socials,
    content: contentKo,
  });
  await upsertContact(c.env, "en", {
    title: "Contact",
    info: [
      {
        label: "President",
        lines: [
          { text: get("presidentNameEn") },
          { text: phone },
          { text: presidentEmail, href: `mailto:${presidentEmail}` },
        ],
      },
      { label: "Club email", lines: [{ text: clubEmail, href: `mailto:${clubEmail}` }] },
    ],
    socials,
    content: contentEn,
  });
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/contact");
});

// ---------- uploads ----------
// 공지/아카이브 본문에 넣을 파일(포스터 등)을 올려두는 곳입니다. 이미지로 한정하지
// 않고 아무 파일이나 받습니다. 업로드된 파일은 kaist.run/upload/<key>로 즉시
// 공개되고(별도 재빌드 불필요), 여기서 링크를 복사해 본문에 붙여넣으면 됩니다.

const UPLOADS_PAGE_SIZE = 20;

function paginateUploads(c: { req: { query(key: string): string | undefined } }, files: Awaited<ReturnType<typeof listUploads>>) {
  const q = (c.req.query("q") ?? "").trim();
  const page = Math.max(0, Number.parseInt(c.req.query("page") ?? "0", 10) || 0);

  const filtered = q ? files.filter((f) => f.key.toLowerCase().includes(q.toLowerCase())) : files;
  const start = page * UPLOADS_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + UPLOADS_PAGE_SIZE);

  return {
    pageItems,
    meta: {
      q,
      page,
      hasPrev: page > 0,
      hasNext: start + UPLOADS_PAGE_SIZE < filtered.length,
      total: filtered.length,
    },
  };
}

backstage.get("/uploads", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const files = await listUploads(c.env);
  const { pageItems, meta } = paginateUploads(c, files);
  return c.html(renderUploadList(pageItems, meta));
});

backstage.post("/uploads", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const body = await c.req.parseBody();
  const file = body["file"];
  const desiredName = typeof body["name"] === "string" ? body["name"] : undefined;

  if (!(file instanceof File) || file.size === 0) {
    const files = await listUploads(c.env);
    const { pageItems, meta } = paginateUploads(c, files);
    return c.html(renderUploadList(pageItems, meta, "업로드할 파일을 선택해 주세요."), 400);
  }

  await storeUpload(c.env, file.name, file.type || "application/octet-stream", await file.arrayBuffer(), desiredName);

  return c.redirect("/uploads");
});

backstage.post("/uploads/:key/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  await deleteUpload(c.env, c.req.param("key"));

  return c.redirect("/uploads");
});

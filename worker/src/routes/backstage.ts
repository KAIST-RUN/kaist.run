import { Hono } from "hono";
import type { Env } from "../types";
import { requireAdmin } from "../lib/authGuard";
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
import { parseResourcesText, parseJudgesText, parseInfoText, parseSocialsText } from "../lib/contentForms";
import { listContentImages, storeContentImage, deleteContentImage } from "../lib/contentImages";
import {
  renderBackstageHome,
  renderNoticeList,
  renderNoticeForm,
  renderArchiveList,
  renderArchiveForm,
  archiveRowsToFormData,
  renderContactForm,
  contactRowsToFormData,
  renderImageGallery,
  type NoticeFormData,
} from "../lib/backstageRender";
import { renderErrorPage } from "../lib/emailRender";

// backstage.kaist.run 전용 라우트. wrangler.jsonc의 "backstage.kaist.run/*" 라우트만
// 이 핸들러로 오고, kaist.run 쪽 경로에는 영향이 없습니다 (index.ts에서 app.route("/", backstage)로
// 마운트하지만, kaist.run에는 애초에 "/" 패턴의 Worker 라우트 자체가 없어서 겹치지 않음).
export const backstage = new Hono<{ Bindings: Env }>();

function isSeason(value: string | undefined): value is Season {
  return value === "spring" || value === "fall";
}

async function readForm(c: { req: { parseBody(): Promise<Record<string, unknown>> } }) {
  const body = await c.req.parseBody();
  const get = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
  return { body, get };
}

backstage.get("/", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  return c.html(renderBackstageHome(gate.member));
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

  const { get } = await readForm(c);
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
    resourcesText: get("resourcesText"),
    judgesText: get("judgesText"),
  };

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return c.html(renderArchiveForm("new", formData, "슬러그는 영문 소문자/숫자/하이픈만 가능합니다."), 400);
  }
  if (await getArchiveEntry(c.env, season, "ko", slug)) {
    return c.html(renderArchiveForm("new", formData, "이미 존재하는 슬러그입니다."), 400);
  }

  const resources = parseResourcesText(formData.resourcesText);
  const judges = parseJudgesText(formData.judgesText);
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

  const { get } = await readForm(c);
  const resources = parseResourcesText(get("resourcesText"));
  const judges = parseJudgesText(get("judgesText"));
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
  const info = parseInfoText(get("infoText"));
  const socials = parseSocialsText(get("socialsText"));

  await upsertContact(c.env, "ko", { title: get("titleKo"), info, socials, content: get("contentKo") });
  await upsertContact(c.env, "en", { title: get("titleEn"), info, socials, content: get("contentEn") });
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/contact");
});

// ---------- images ----------
// 공지/아카이브 본문 마크다운에 넣을 이미지(포스터 등)를 올려두는 곳입니다.
// 업로드된 이미지는 kaist.run/content-images/<key>로 즉시 공개되고(별도 재빌드 불필요),
// 여기서 각 이미지의 마크다운 문법을 복사해 본문에 붙여넣으면 됩니다.

backstage.get("/images", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const folder = c.req.query("folder");
  const images = await listContentImages(c.env);
  return c.html(renderImageGallery(images, folder));
});

backstage.post("/images", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const body = await c.req.parseBody();
  const file = body["file"];
  const folder = typeof body["folder"] === "string" ? body["folder"] : undefined;

  if (!(file instanceof File) || file.size === 0) {
    const images = await listContentImages(c.env);
    return c.html(renderImageGallery(images, folder, "업로드할 파일을 선택해 주세요."), 400);
  }
  if (!file.type.startsWith("image/")) {
    const images = await listContentImages(c.env);
    return c.html(renderImageGallery(images, folder, "이미지 파일만 업로드할 수 있습니다."), 400);
  }

  await storeContentImage(c.env, file.name, file.type, await file.arrayBuffer(), folder);

  return c.redirect(folder ? `/images?folder=${encodeURIComponent(folder)}` : "/images");
});

backstage.post("/images/:key/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const body = await c.req.parseBody();
  const folder = typeof body["folder"] === "string" ? body["folder"] : undefined;

  await deleteContentImage(c.env, c.req.param("key"));

  return c.redirect(folder ? `/images?folder=${encodeURIComponent(folder)}` : "/images");
});

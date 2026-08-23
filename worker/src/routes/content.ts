import { Hono } from "hono";
import type { Env } from "../types";
import {
  listNotices,
  getNotice,
  getShortLinkByCode,
  listArchiveEntries,
  getArchiveEntry,
  getContact,
  listBylawsVersions,
  getBylawsVersion,
  getCurrentBylawsVersion,
  type Locale,
  type Season,
} from "../lib/content";
import { getApplyFormConfig } from "../lib/applyForm";

// 공개 읽기 전용 API입니다 — 인증이 전혀 필요 없습니다. 메인 사이트(정적 export)가
// `next build` 시점(GitHub Actions 안에서 실행, 로그인 세션이 있을 수 없음)에
// 이 경로들을 fetch해서 정적 페이지로 구워냅니다. 내용 자체가 원래 공개
// 페이지에 그대로 나가는 것들이라 비공개로 막을 이유도 없습니다.
export const content = new Hono<{ Bindings: Env }>();

function isLocale(value: string): value is Locale {
  return value === "ko" || value === "en";
}

function isSeason(value: string): value is Season {
  return value === "spring" || value === "fall";
}

// 짧은 URL 해석 — kaist.run/<code>(2글자)로 들어온 방문을 정적 사이트의 404 페이지
// 인라인 스크립트가 이 API로 slug로 바꿔 해당 공지로 리다이렉트합니다
// (src/app/not-found.tsx). 존재하지 않는 코드는 404 — 그 페이지는 그냥 404 화면을
// 보여줍니다.
content.get("/short-links/:code", async (c) => {
  const code = c.req.param("code");
  if (!/^[A-Za-z0-9]{2}$/.test(code)) return c.json({ error: "invalid code" }, 400);
  const slug = await getShortLinkByCode(c.env, code);
  if (!slug) return c.notFound();
  return c.json({ slug });
});

content.get("/notices/:locale", async (c) => {
  const locale = c.req.param("locale");
  if (!isLocale(locale)) return c.json({ error: "invalid locale" }, 400);
  return c.json(await listNotices(c.env, locale));
});

content.get("/notices/:locale/:slug", async (c) => {
  const locale = c.req.param("locale");
  if (!isLocale(locale)) return c.json({ error: "invalid locale" }, 400);
  const notice = await getNotice(c.env, locale, c.req.param("slug"));
  if (!notice) return c.notFound();
  return c.json(notice);
});

content.get("/archive/:season/:locale", async (c) => {
  const season = c.req.param("season");
  const locale = c.req.param("locale");
  if (!isSeason(season) || !isLocale(locale)) return c.json({ error: "invalid season/locale" }, 400);
  return c.json(await listArchiveEntries(c.env, season, locale));
});

content.get("/archive/:season/:locale/:slug", async (c) => {
  const season = c.req.param("season");
  const locale = c.req.param("locale");
  if (!isSeason(season) || !isLocale(locale)) return c.json({ error: "invalid season/locale" }, 400);
  const entry = await getArchiveEntry(c.env, season, locale, c.req.param("slug"));
  if (!entry) return c.notFound();
  return c.json(entry);
});

content.get("/contact/:locale", async (c) => {
  const locale = c.req.param("locale");
  if (!isLocale(locale)) return c.json({ error: "invalid locale" }, 400);
  const contact = await getContact(c.env, locale);
  if (!contact) return c.notFound();
  return c.json(contact);
});

// 역대 회칙 — :locale이 없습니다(번역이 없는 한국어 문서라서요, apply-form과 동일 이유).
// "현재 버전"(effective_date 최신)만 보여주는 /bylaws 페이지용, 목록용, 특정
// 버전(과거 버전 포함)용으로 세 개입니다. /bylaws-versions를 먼저 등록해야
// /bylaws/:slug가 "versions"를 slug로 잘못 먹지 않습니다.
content.get("/bylaws", async (c) => {
  const bylaws = await getCurrentBylawsVersion(c.env);
  if (!bylaws) return c.notFound();
  return c.json(bylaws);
});

// listBylawsVersions/getBylawsVersion 자체는 backstage 초안 편집용으로 게시
// 여부와 무관하게 다 돌려주므로, 공개 API에서는 여기서 isPublished로 한 번 더
// 걸러냅니다 — 아직 편집 중인 버전은 목록에도, 직접 링크로도 안 보여야 합니다.
content.get("/bylaws-versions", async (c) => {
  const versions = await listBylawsVersions(c.env);
  return c.json(versions.filter((v) => v.isPublished));
});

content.get("/bylaws/:slug", async (c) => {
  const bylaws = await getBylawsVersion(c.env, c.req.param("slug"));
  if (!bylaws || !bylaws.isPublished) return c.notFound();
  return c.json(bylaws);
});

// notices/archive/contact와 달리 :locale이 없는 단일 엔드포인트입니다 — 문항 구조
// (순서/유형/entry ID/선택지 값)는 로케일과 무관하게 동일하고 라벨(labelKo/labelEn)만
// 언어별로 다르므로, 굳이 두 번 fetch할 이유가 없어서 한 번에 둘 다 내려줍니다.
content.get("/apply-form", async (c) => {
  const config = await getApplyFormConfig(c.env);
  if (!config) return c.notFound();
  return c.json(config);
});

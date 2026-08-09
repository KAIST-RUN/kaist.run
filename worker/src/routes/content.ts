import { Hono } from "hono";
import type { Env } from "../types";
import {
  listNotices,
  getNotice,
  listArchiveEntries,
  getArchiveEntry,
  getContact,
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

// notices/archive/contact와 달리 :locale이 없는 단일 엔드포인트입니다 — 문항 구조
// (순서/유형/entry ID/선택지 값)는 로케일과 무관하게 동일하고 라벨(labelKo/labelEn)만
// 언어별로 다르므로, 굳이 두 번 fetch할 이유가 없어서 한 번에 둘 다 내려줍니다.
content.get("/apply-form", async (c) => {
  const config = await getApplyFormConfig(c.env);
  if (!config) return c.notFound();
  return c.json(config);
});

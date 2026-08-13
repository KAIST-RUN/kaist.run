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
  listBoardPosts,
  getBoardPost,
  upsertBoardPost,
  deleteBoardPost,
  listArchiveEntries,
  getArchiveEntry,
  upsertArchiveEntry,
  deleteArchiveEntry,
  getContact,
  upsertContact,
  listBylawsVersions,
  getBylawsVersion,
  getCurrentBylawsVersion,
  upsertBylawsVersion,
  deleteBylawsVersion,
  type Season,
  type BylawsBlockType,
  type BylawsBlock,
  type BylawsTagKind,
} from "../lib/content";
import { listUploads, storeUpload, deleteUpload } from "../lib/uploads";
import {
  listUsers,
  getUserByUid,
  createUser,
  updateUser,
  deleteUser,
  grantAdmin,
  revokeAdmin,
  listAdmins,
  grantHonoraryMember,
  revokeHonoraryMember,
  listHonoraryMembers,
  UserValidationError,
} from "../lib/members";
import {
  listSemesters,
  openSemester,
  deleteSemester,
  listSemesterMembers,
  approveSemesterMembership,
  rejectSemesterMembership,
  revokeSemesterMembership,
  addSemesterMember,
  getUserSemesters,
} from "../lib/semesters";
import { toCsvDocument } from "../lib/csv";
import { isAtCoderHeuristicContest } from "../lib/atcoder";
import {
  getRunforceConfig,
  setRunforceConfig,
  listTargetContests,
  addTargetContest,
  enqueueAtCoderPending,
  listPendingAtCoderContests,
  listDiscoveryQueue,
  removeTargetContest,
  getTargetContestDetail,
  getRunforceLeaderboard,
  formatRunforceDisplay,
  pairContests,
  unpairContest,
  enqueueDiscoveredContests,
  processDiscoveryQueue,
  resetAllTargetContests,
  RunforceError,
  type RunforcePlatform,
} from "../lib/runforce";
import {
  getApplyFormConfig,
  connectApplyForm,
  saveApplyFormLabels,
  ApplyFormValidationError,
  type SaveQuestionInput,
} from "../lib/applyForm";
import { GoogleFormAccessError, GoogleFormParseError } from "../lib/googleForms";
import {
  renderBackstageHome,
  renderNoticeList,
  renderNoticeForm,
  renderBoardList,
  renderBoardForm,
  renderArchiveList,
  renderArchiveForm,
  archiveRowsToFormData,
  renderMemberList,
  renderUserForm,
  userRowToFormData,
  type UserFormData,
  renderSemesterPicker,
  renderSemesterRoster,
  renderAdminList,
  renderHonoraryMemberList,
  renderContactForm,
  contactRowsToFormData,
  renderBylawsList,
  renderBylawsVersionForm,
  type BylawsVersionFormData,
  renderUploadList,
  renderApplyFormPage,
  renderRunforceSettings,
  renderRunforceContestDetail,
  renderRunforceLeaderboard,
  type NoticeFormData,
  type BoardFormData,
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

// ---------- board ----------
// 공지사항과 완전히 같은 구조입니다 — 관리자만 작성하고, 정적 빌드 시점에 그대로
// 구워집니다(실제 로그인 여부로 접근을 막지는 않습니다).

backstage.get("/board", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const posts = await listBoardPosts(c.env, "ko");
  return c.html(renderBoardList(posts));
});

backstage.get("/board/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const empty: BoardFormData = { slug: "", date: "", pinned: false, titleKo: "", titleEn: "", contentKo: "", contentEn: "" };
  return c.html(renderBoardForm("new", empty));
});

backstage.post("/board/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  const data: BoardFormData = {
    slug: get("slug").trim(),
    date: get("date"),
    pinned: get("pinned") === "on",
    titleKo: get("titleKo"),
    titleEn: get("titleEn"),
    contentKo: get("contentKo"),
    contentEn: get("contentEn"),
  };

  if (!/^[a-z0-9-]+$/.test(data.slug)) {
    return c.html(renderBoardForm("new", data, "슬러그는 영문 소문자/숫자/하이픈만 가능합니다."), 400);
  }
  if (await getBoardPost(c.env, "ko", data.slug)) {
    return c.html(renderBoardForm("new", data, "이미 존재하는 슬러그입니다."), 400);
  }

  await upsertBoardPost(c.env, data.slug, "ko", { title: data.titleKo, date: data.date, pinned: data.pinned, content: data.contentKo });
  await upsertBoardPost(c.env, data.slug, "en", { title: data.titleEn, date: data.date, pinned: data.pinned, content: data.contentEn });
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/board");
});

backstage.get("/board/:slug/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const slug = c.req.param("slug");
  const [ko, en] = await Promise.all([getBoardPost(c.env, "ko", slug), getBoardPost(c.env, "en", slug)]);
  if (!ko && !en) return c.html(renderErrorPage("찾을 수 없습니다", "존재하지 않는 게시글입니다."), 404);

  const base = ko ?? en!;
  const data: BoardFormData = {
    slug,
    date: base.date,
    pinned: base.pinned,
    titleKo: ko?.title ?? "",
    titleEn: en?.title ?? "",
    contentKo: ko?.content ?? "",
    contentEn: en?.content ?? "",
  };
  return c.html(renderBoardForm("edit", data));
});

backstage.post("/board/:slug/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const slug = c.req.param("slug");
  const { get } = await readForm(c);
  const data: BoardFormData = {
    slug,
    date: get("date"),
    pinned: get("pinned") === "on",
    titleKo: get("titleKo"),
    titleEn: get("titleEn"),
    contentKo: get("contentKo"),
    contentEn: get("contentEn"),
  };

  await upsertBoardPost(c.env, slug, "ko", { title: data.titleKo, date: data.date, pinned: data.pinned, content: data.contentKo });
  await upsertBoardPost(c.env, slug, "en", { title: data.titleEn, date: data.date, pinned: data.pinned, content: data.contentEn });
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/board");
});

backstage.post("/board/:slug/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  await deleteBoardPost(c.env, c.req.param("slug"));
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/board");
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

// ---------- members ----------

const MEMBERS_PAGE_SIZE = 30;

function paginateMembers(c: { req: { query(key: string): string | undefined } }, users: Awaited<ReturnType<typeof listUsers>>) {
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const page = Math.max(0, Number.parseInt(c.req.query("page") ?? "0", 10) || 0);

  const filtered = q
    ? users.filter((u) => [u.name, u.studentId, u.email, u.discordId].some((v) => v?.toLowerCase().includes(q)))
    : users;
  const start = page * MEMBERS_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + MEMBERS_PAGE_SIZE);

  return {
    pageItems,
    meta: {
      q,
      page,
      hasPrev: page > 0,
      hasNext: start + MEMBERS_PAGE_SIZE < filtered.length,
      total: filtered.length,
    },
  };
}

backstage.get("/members", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const users = await listUsers(c.env);
  const { pageItems, meta } = paginateMembers(c, users);
  return c.html(renderMemberList(pageItems, meta));
});

backstage.get("/members/export.csv", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const users = await listUsers(c.env);
  const csv = toCsvDocument(
    ["UID", "이름", "학번", "이메일", "전화번호", "Discord ID", "solved.ac", "Codeforces", "AtCoder", "상태", "권한", "명예회원", "생성일"],
    users.map((u) => [
      u.uid,
      u.name,
      u.studentId,
      u.email,
      u.phone,
      u.discordId,
      u.solvedAc,
      u.codeforces,
      u.atcoder,
      u.status,
      u.role,
      u.isHonoraryMember ? "Y" : "N",
      u.createdAt,
    ]),
  );
  const filename = "members.csv";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});

backstage.get("/members/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const empty: UserFormData = {
    uid: "",
    discordId: "",
    name: "",
    email: "",
    studentId: "",
    phone: "",
    solvedAc: "",
    codeforces: "",
    atcoder: "",
    isAdmin: false,
    isHonoraryMember: false,
  };
  return c.html(renderUserForm("new", empty, null));
});

function readUserForm(get: (key: string) => string): Omit<UserFormData, "uid"> {
  return {
    discordId: get("discordId").trim(),
    name: get("name").trim(),
    email: get("email").trim(),
    studentId: get("studentId").trim(),
    phone: get("phone").trim(),
    solvedAc: get("solvedAc").trim(),
    codeforces: get("codeforces").trim(),
    atcoder: get("atcoder").trim(),
    isAdmin: get("isAdmin") === "1",
    isHonoraryMember: get("isHonoraryMember") === "1",
  };
}

backstage.post("/members/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  const input = readUserForm(get);

  try {
    const created = await createUser(c.env, {
      discordId: input.discordId,
      name: input.name || null,
      email: input.email || null,
      studentId: input.studentId || null,
      phone: input.phone || null,
      solvedAc: input.solvedAc || null,
      codeforces: input.codeforces || null,
      atcoder: input.atcoder || null,
    });
    if (input.isAdmin) await grantAdmin(c.env, created.uid, gate.member.uid, gate.member.name);
    if (input.isHonoraryMember) await grantHonoraryMember(c.env, created.uid, gate.member.uid, gate.member.name);
    return c.redirect(`/members/${encodeURIComponent(created.uid)}/edit`);
  } catch (err) {
    const message = err instanceof UserValidationError ? err.message : "저장하지 못했습니다.";
    return c.html(renderUserForm("new", { uid: "", ...input }, null, message), 400);
  }
});

backstage.get("/members/:uid/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const uid = c.req.param("uid");
  const user = await getUserByUid(c.env, uid);
  if (!user) return c.notFound();

  const semesters = await getUserSemesters(c.env, uid);
  return c.html(renderUserForm("edit", userRowToFormData(user), semesters));
});

backstage.post("/members/:uid/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const uid = c.req.param("uid");
  const { get } = await readForm(c);
  const input = readUserForm(get);

  try {
    await updateUser(c.env, uid, {
      discordId: input.discordId,
      name: input.name || null,
      email: input.email || null,
      studentId: input.studentId || null,
      phone: input.phone || null,
      solvedAc: input.solvedAc || null,
      codeforces: input.codeforces || null,
      atcoder: input.atcoder || null,
    });
    if (input.isAdmin) await grantAdmin(c.env, uid, gate.member.uid, gate.member.name);
    else await revokeAdmin(c.env, uid);
    if (input.isHonoraryMember) await grantHonoraryMember(c.env, uid, gate.member.uid, gate.member.name);
    else await revokeHonoraryMember(c.env, uid);
    return c.redirect(`/members/${encodeURIComponent(uid)}/edit`);
  } catch (err) {
    const message = err instanceof UserValidationError ? err.message : "저장하지 못했습니다.";
    const semesters = await getUserSemesters(c.env, uid);
    return c.html(renderUserForm("edit", { uid, ...input }, semesters, message), 400);
  }
});

backstage.post("/members/:uid/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  await deleteUser(c.env, c.req.param("uid"));
  return c.redirect("/members");
});

// ---------- members: 학기별 명단 ----------

backstage.get("/members/semesters", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const semesters = await listSemesters(c.env);
  return c.html(renderSemesterPicker(semesters));
});

backstage.post("/members/semesters/open", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  const year = Number.parseInt(get("year"), 10);
  const season = get("season");
  if (!Number.isFinite(year) || !isSeason(season)) {
    const semesters = await listSemesters(c.env);
    return c.html(renderSemesterPicker(semesters, "연도와 학기를 올바르게 입력해 주세요."), 400);
  }

  await openSemester(c.env, year, season, get("makeCurrent") === "1");
  return c.redirect(`/members/semesters/${year}/${season}`);
});

backstage.get("/members/semesters/:year/:season", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const year = Number.parseInt(c.req.param("year"), 10);
  const season = c.req.param("season");
  if (!Number.isFinite(year) || !isSeason(season)) return c.notFound();

  const [semesters, members] = await Promise.all([listSemesters(c.env), listSemesterMembers(c.env, year, season)]);
  const isCurrent = semesters.some((s) => s.year === year && s.season === season && s.isCurrent);
  if (!semesters.some((s) => s.year === year && s.season === season)) return c.notFound();

  return c.html(renderSemesterRoster(year, season, isCurrent, members));
});

backstage.get("/members/semesters/:year/:season/export.csv", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const year = Number.parseInt(c.req.param("year"), 10);
  const season = c.req.param("season");
  if (!Number.isFinite(year) || !isSeason(season)) return c.notFound();

  const members = await listSemesterMembers(c.env, year, season);
  const csv = toCsvDocument(
    ["UID", "이름", "학번", "이메일", "Discord ID", "상태", "승인자", "승인일시", "신청일시"],
    members.map((m) => [m.uid, m.name, m.studentId, m.email, m.discordId, m.status, m.approvedByName, m.approvedAt, m.requestedAt]),
  );
  const filename = `members-${year}-${season}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});

async function requireOpenSemester(c: { req: { param(key: string): string } }, env: Env) {
  const year = Number.parseInt(c.req.param("year"), 10);
  const season = c.req.param("season");
  if (!Number.isFinite(year) || !isSeason(season)) return null;
  const semesters = await listSemesters(env);
  if (!semesters.some((s) => s.year === year && s.season === season)) return null;
  return { year, season };
}

backstage.post("/members/semesters/:year/:season/approve", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const target = await requireOpenSemester(c, c.env);
  if (!target) return c.notFound();

  const { get } = await readForm(c);
  await approveSemesterMembership(c.env, get("uid"), target.year, target.season, gate.member.uid, gate.member.name);
  return c.redirect(`/members/semesters/${target.year}/${target.season}`);
});

backstage.post("/members/semesters/:year/:season/reject", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const target = await requireOpenSemester(c, c.env);
  if (!target) return c.notFound();

  const { get } = await readForm(c);
  await rejectSemesterMembership(c.env, get("uid"), target.year, target.season);
  return c.redirect(`/members/semesters/${target.year}/${target.season}`);
});

backstage.post("/members/semesters/:year/:season/revoke", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const target = await requireOpenSemester(c, c.env);
  if (!target) return c.notFound();

  const { get } = await readForm(c);
  await revokeSemesterMembership(c.env, get("uid"), target.year, target.season);
  return c.redirect(`/members/semesters/${target.year}/${target.season}`);
});

// openSemester는 "없으면 열고, makeCurrent면 현재 학기로 지정"이 한 함수라 —
// 이미 있는 학기를 대상으로 불러도 INSERT는 그냥 무시되고 현재 학기 지정만
// 일어나서, 여기서 새 함수 없이 그대로 재사용합니다.
backstage.post("/members/semesters/:year/:season/set-current", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const target = await requireOpenSemester(c, c.env);
  if (!target) return c.notFound();

  await openSemester(c.env, target.year, target.season, true);
  return c.redirect(`/members/semesters/${target.year}/${target.season}`);
});

backstage.post("/members/semesters/:year/:season/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const target = await requireOpenSemester(c, c.env);
  if (!target) return c.notFound();

  await deleteSemester(c.env, target.year, target.season);
  return c.redirect("/members/semesters");
});

// 관리자가 봇을 거치지 않고 기존 유저를 이름/Discord ID로 찾아 바로 그 학기에
// 추가(=즉시 승인)합니다. 정확히 일치하는 유저가 하나가 아니면(없거나 이름이
// 겹치면) 에러로 되돌립니다 — Discord ID로 다시 시도하면 항상 유일하게 찾깁니다.
backstage.post("/members/semesters/:year/:season/add", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;
  const target = await requireOpenSemester(c, c.env);
  if (!target) return c.notFound();

  const { get } = await readForm(c);
  const query = get("query").trim();
  const users = await listUsers(c.env);
  const matches = users.filter((u) => u.discordId === query || u.name === query);

  if (matches.length !== 1) {
    const members = await listSemesterMembers(c.env, target.year, target.season);
    const semesters = await listSemesters(c.env);
    const isCurrent = semesters.some((s) => s.year === target.year && s.season === target.season && s.isCurrent);
    const message = matches.length === 0 ? "일치하는 유저를 찾지 못했습니다." : "이름이 여러 명과 겹칩니다 — Discord ID로 다시 시도해 주세요.";
    return c.html(renderSemesterRoster(target.year, target.season, isCurrent, members, message), 400);
  }

  await addSemesterMember(c.env, matches[0].uid, target.year, target.season, gate.member.uid, gate.member.name);
  return c.redirect(`/members/semesters/${target.year}/${target.season}`);
});

// ---------- members: 관리자 ----------

backstage.get("/members/admins", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const admins = await listAdmins(c.env);
  return c.html(renderAdminList(admins));
});

backstage.post("/members/admins/revoke", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  await revokeAdmin(c.env, get("uid"));
  return c.redirect("/members/admins");
});

// ---------- members: 명예회원 ----------

backstage.get("/members/honorary", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const members = await listHonoraryMembers(c.env);
  return c.html(renderHonoraryMemberList(members));
});

backstage.post("/members/honorary/revoke", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  await revokeHonoraryMember(c.env, get("uid"));
  return c.redirect("/members/honorary");
});

// ---------- runforce ----------

function isRunforcePlatform(value: string): value is RunforcePlatform {
  return value === "codeforces" || value === "atcoder";
}

backstage.get("/runforce", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const [config, contests, atcoderPending, discoveryQueue] = await Promise.all([
    getRunforceConfig(c.env),
    listTargetContests(c.env),
    listPendingAtCoderContests(c.env),
    listDiscoveryQueue(c.env),
  ]);
  return c.html(renderRunforceSettings(config, contests, undefined, atcoderPending, discoveryQueue));
});

backstage.post("/runforce/config", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  try {
    await setRunforceConfig(c.env, {
      autoDiscoveryEnabled: get("autoDiscoveryEnabled") === "1",
      rangeStartDate: get("rangeStartDate") || null,
      rangeEndDate: get("rangeEndDate") || null,
      rangeEndAuto: get("rangeEndAuto") === "1",
    });

    // 저장 즉시 큐에 새 후보를 채우고, 첫 배치도 바로 한 번 처리합니다 — 1분 크론을
    // 기다리지 않아도 되도록. 응답을 붙잡아 두는 대신 waitUntil로 뒤에서 이어 돌립니다
    // (triggerRebuild와 같은 관례). 설정이 꺼져 있으면 즉시 반환하므로 그냥 호출해도
    // 안전하고, 크론과 겹쳐 돌아도 이미 등록된 대회는 건너뛰므로 중복 계산되지 않습니다.
    c.executionCtx.waitUntil(
      enqueueDiscoveredContests(c.env)
        .then(() => processDiscoveryQueue(c.env))
        .catch((err) => {
          console.error("RUNFORCE: 저장 직후 자동탐색 갱신 실패", err);
      }),
    );
    return c.redirect("/runforce");
  } catch (err) {
    const message = err instanceof RunforceError ? err.message : "설정을 저장하지 못했습니다.";
    const [config, contests] = await Promise.all([getRunforceConfig(c.env), listTargetContests(c.env)]);
    return c.html(renderRunforceSettings(config, contests, message), 400);
  }
});

backstage.post("/runforce/contests/add", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  const platform = get("platform");
  const contestId = get("contestId");
  if (!isRunforcePlatform(platform)) return c.notFound();

  try {
    // AtCoder는 이 Worker에서 순위표를 직접 못 가져오므로(runforce.ts::addTargetContest
    // 주석 참고) 바로 계산하지 않고 대기열에 등록만 합니다 — runBot이 폴링해서 순위표를
    // 채우면 자동으로 계산되어 아래 목록에 나타납니다.
    if (platform === "atcoder") {
      // AHC는 산정 대상이 아니므로 큐에 들어가기 전에 막습니다(atcoder.ts 참고). 여기서
      // 안 막고 addTargetContest 쪽에서 거절하면, completeAtCoderContest가 성공했을 때만
      // 대기열 행을 지우는 구조라 봇이 같은 대회를 영원히 재시도하게 됩니다.
      if (isAtCoderHeuristicContest(contestId)) {
        const [config, contests] = await Promise.all([getRunforceConfig(c.env), listTargetContests(c.env)]);
        return c.html(
          renderRunforceSettings(config, contests, "AHC(AtCoder Heuristic Contest)는 RUNFORCE 산정 대상이 아닙니다."),
          400,
        );
      }
      await enqueueAtCoderPending(c.env, contestId, { uid: gate.member.uid, name: gate.member.name }, "manual");
      const [config, contests] = await Promise.all([getRunforceConfig(c.env), listTargetContests(c.env)]);
      return c.html(
        renderRunforceSettings(
          config,
          contests,
          `AtCoder 대회 "${contestId}"를 대기열에 등록했습니다 — 봇이 순위표를 가져오면 자동으로 계산되어 아래 목록에 나타납니다.`,
        ),
      );
    }

    const contest = await addTargetContest(c.env, platform, contestId, { uid: gate.member.uid, name: gate.member.name }, "manual");
    return c.redirect(`/runforce/${encodeURIComponent(contest.id)}`);
  } catch (err) {
    const message = err instanceof RunforceError ? err.message : "대회 정보를 가져오지 못했습니다.";
    const [config, contests] = await Promise.all([getRunforceConfig(c.env), listTargetContests(c.env)]);
    return c.html(renderRunforceSettings(config, contests, message), 400);
  }
});

backstage.get("/runforce/leaderboard", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const entries = await getRunforceLeaderboard(c.env);
  return c.html(renderRunforceLeaderboard(entries));
});

backstage.get("/runforce/leaderboard/export.csv", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const entries = await getRunforceLeaderboard(c.env);
  const csv = toCsvDocument(
    ["UID", "이름", "총점", "참가 대회 수"],
    entries.map((e) => [e.uid, e.name, formatRunforceDisplay(e.totalScore), e.contestsCounted]),
  );
  const filename = "runforce-leaderboard.csv";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});

backstage.get("/runforce/:contestId", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const detail = await getTargetContestDetail(c.env, c.req.param("contestId"));
  if (!detail) return c.notFound();
  // 짝지어진 대회면 상대방의 결과표까지 같이 가져와서, 상세 페이지 하나에서 Div1/Div2
  // 둘 다 보여줍니다(따로 페이지를 넘나들 필요 없게).
  const pairedDetail = detail.pairedContest ? await getTargetContestDetail(c.env, detail.pairedContest.id) : null;
  return c.html(renderRunforceContestDetail(detail, undefined, pairedDetail));
});

backstage.get("/runforce/:contestId/export.csv", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const detail = await getTargetContestDetail(c.env, c.req.param("contestId"));
  if (!detail) return c.notFound();

  const csv = toCsvDocument(
    ["순위", "이름", "핸들", "대회 원본 순위", "RUNFORCE"],
    detail.rows.map((r) => [r.finalRank + 1, r.name, r.handle, r.platformRank, formatRunforceDisplay(r.score)]),
  );
  const filename = `runforce-${detail.platform}-${detail.contestId}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});

backstage.post("/runforce/:contestId/pair", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const contestId = c.req.param("contestId");
  const { get } = await readForm(c);
  try {
    await pairContests(c.env, contestId, get("otherContestId"));
    return c.redirect(`/runforce/${encodeURIComponent(contestId)}`);
  } catch (err) {
    const message = err instanceof RunforceError ? err.message : "짝짓기에 실패했습니다.";
    const detail = await getTargetContestDetail(c.env, contestId);
    if (!detail) return c.notFound();
    const pairedDetail = detail.pairedContest ? await getTargetContestDetail(c.env, detail.pairedContest.id) : null;
    return c.html(renderRunforceContestDetail(detail, message, pairedDetail), 400);
  }
});

backstage.post("/runforce/:contestId/unpair", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const contestId = c.req.param("contestId");
  await unpairContest(c.env, contestId);
  return c.redirect(`/runforce/${encodeURIComponent(contestId)}`);
});

backstage.post("/runforce/:contestId/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  await removeTargetContest(c.env, c.req.param("contestId"));
  return c.redirect("/runforce");
});

// 산정 대상 대회를 전부 지웁니다 — 개별 삭제(위)를 일일이 반복하는 대신 한 번에.
// 자동탐색 설정 자체는 안 건드리므로, 켜져 있으면 다음 크론 때 처음부터 다시 수집됩니다.
backstage.post("/runforce/reset", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  await resetAllTargetContests(c.env);
  return c.redirect("/runforce");
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

// ---------- bylaws ----------
// 역대 회칙 — 버전 목록 + 버전별 편집(장/조/항/호/목 행 에디터). effective_date가
// 가장 최신인 버전이 kaist.run/bylaws에 뜹니다(별도 "현재 버전" 플래그 없음).

const BYLAWS_BLOCK_TYPES = new Set<BylawsBlockType>(["chapter", "article", "buchik", "clause", "item", "subitem"]);
const BYLAWS_TAG_KINDS = new Set<BylawsTagKind>(["개정", "신설", "본조신설"]);

// worker/src/lib/backstageRender.ts의 트리 에디터가 제출 직전 트리를 문서 순서대로
// 평평하게 펼쳐서(flatten) blocksJson 히든 인풋 하나에 담아 보냅니다 — 예전처럼
// blockType[]/blockText[] 병렬 배열을 zip하는 게 아니라 그 JSON을 그대로 검증만
// 합니다. 모양이 신뢰 안 되는 값(브라우저 조작 등)은 조용히 걸러냅니다.
function readBylawsBlocks(body: Record<string, unknown>): BylawsBlock[] {
  const raw = typeof body.blocksJson === "string" ? body.blocksJson : "[]";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return [];

  const blocks: BylawsBlock[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { type, text, body: paragraphBody, tags: rawTags } = item as {
      type?: unknown;
      text?: unknown;
      body?: unknown;
      tags?: unknown;
    };
    if (typeof type !== "string" || !BYLAWS_BLOCK_TYPES.has(type as BylawsBlockType)) continue;
    const trimmedText = typeof text === "string" ? text.trim() : "";
    const trimmedBody = typeof paragraphBody === "string" ? paragraphBody.trim() : "";
    if (!trimmedText && !trimmedBody) continue; // 내용 없이 빈 채로 남겨둔 노드는 저장 안 함
    const block: BylawsBlock = { type: type as BylawsBlockType, text: trimmedText };
    if (trimmedBody) block.body = trimmedBody;
    if (Array.isArray(rawTags)) {
      const tags = rawTags
        .filter(
          (t): t is { kind: BylawsTagKind; num: number } =>
            !!t &&
            typeof t === "object" &&
            BYLAWS_TAG_KINDS.has((t as { kind?: unknown }).kind as BylawsTagKind) &&
            Number.isInteger((t as { num?: unknown }).num) &&
            ((t as { num: number }).num as number) > 0,
        )
        .map((t) => ({ kind: t.kind, num: t.num }));
      if (tags.length > 0) block.tags = tags;
    }
    blocks.push(block);
  }
  return blocks;
}

// 개정이력은 날짜만 받습니다 — 첫 항목은 항상 제정, 나머지는 항상 일부개정이라
// 렌더링할 때 순서로 라벨을 계산합니다(worker/src/lib/backstageRender.ts, src/lib/bylaws.ts).
function readBylawsRevisionHistory(body: Record<string, unknown>): string[] {
  return getFormArray(body, "revDate[]")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

backstage.get("/bylaws", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const versions = await listBylawsVersions(c.env);
  return c.html(renderBylawsList(versions));
});

backstage.get("/bylaws/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  // 새 버전은 보통 직전 버전을 그대로 고쳐서 만드는 개정 작업이라, 빈 폼 대신
  // 현재(가장 최신) 버전의 본문/개정이력을 그대로 채워서 시작합니다.
  const current = await getCurrentBylawsVersion(c.env);
  const prefilled: BylawsVersionFormData = {
    slug: "",
    title: current?.title ?? "RUN 회칙",
    versionLabel: "",
    effectiveDate: "",
    isPublished: false,
    revisionHistory: current?.revisionHistory ?? [],
    blocks: current?.blocks ?? [],
  };
  return c.html(renderBylawsVersionForm("new", prefilled));
});

backstage.post("/bylaws/new", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { body, get } = await readForm(c);
  const slug = get("slug").trim();
  const data: BylawsVersionFormData = {
    slug,
    title: get("title"),
    versionLabel: get("versionLabel"),
    effectiveDate: get("effectiveDate"),
    isPublished: get("isPublished") === "on",
    revisionHistory: readBylawsRevisionHistory(body),
    blocks: readBylawsBlocks(body),
  };

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return c.html(renderBylawsVersionForm("new", data, "slug는 영문 소문자/숫자/하이픈만 가능합니다."), 400);
  }
  if (await getBylawsVersion(c.env, slug)) {
    return c.html(renderBylawsVersionForm("new", data, "이미 존재하는 slug입니다."), 400);
  }
  if (data.blocks.length === 0) {
    return c.html(renderBylawsVersionForm("new", data, "본문 내용을 하나 이상 입력해 주세요."), 400);
  }

  await upsertBylawsVersion(c.env, slug, data);
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/bylaws");
});

backstage.get("/bylaws/:slug/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const version = await getBylawsVersion(c.env, c.req.param("slug"));
  if (!version) return c.html(renderErrorPage("찾을 수 없습니다", "존재하지 않는 회칙 버전입니다."), 404);

  return c.html(renderBylawsVersionForm("edit", version));
});

backstage.post("/bylaws/:slug/edit", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const slug = c.req.param("slug");
  const { body, get } = await readForm(c);
  const data: BylawsVersionFormData = {
    slug,
    title: get("title"),
    versionLabel: get("versionLabel"),
    effectiveDate: get("effectiveDate"),
    isPublished: get("isPublished") === "on",
    revisionHistory: readBylawsRevisionHistory(body),
    blocks: readBylawsBlocks(body),
  };

  if (data.blocks.length === 0) {
    return c.html(renderBylawsVersionForm("edit", data, "본문 내용을 하나 이상 입력해 주세요."), 400);
  }

  await upsertBylawsVersion(c.env, slug, data);
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/bylaws");
});

backstage.post("/bylaws/:slug/delete", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  await deleteBylawsVersion(c.env, c.req.param("slug"));
  c.executionCtx.waitUntil(triggerRebuild(c.env));

  return c.redirect("/bylaws");
});

// ---------- apply form ----------
// 지원 폼(/apply)의 문항 구조는 구글 폼에서 가져오고(연결), 화면에 보일 한국어/영어
// 문구만 여기서 편집합니다. 구조(연결)와 라벨(저장)은 별도 POST — 연결 직후엔 새
// 문항 라벨이 비어 있을 수 있어서 그 시점엔 재배포(triggerRebuild)를 안 부릅니다.

backstage.get("/apply", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const config = await getApplyFormConfig(c.env);
  const saved = c.req.query("saved") === "1";
  return c.html(renderApplyFormPage(config, { saved }));
});

backstage.post("/apply/connect", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const { get } = await readForm(c);
  const formInput = get("formUrl").trim();

  try {
    const summary = await connectApplyForm(c.env, formInput);
    const config = await getApplyFormConfig(c.env);
    return c.html(renderApplyFormPage(config, { summary }));
  } catch (err) {
    console.error("Failed to connect apply form", err);
    const config = await getApplyFormConfig(c.env);
    const message =
      err instanceof GoogleFormAccessError || err instanceof GoogleFormParseError
        ? err.message
        : "폼을 연결하지 못했습니다. 링크를 확인하고 잠시 후 다시 시도해 주세요.";
    return c.html(renderApplyFormPage(config, { error: message }), 400);
  }
});

backstage.post("/apply", async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.response;

  const config = await getApplyFormConfig(c.env);
  if (!config) return c.notFound();

  const { get } = await readForm(c);

  const questions: SaveQuestionInput[] = config.questions.map((q) => ({
    entryId: q.entryId,
    labelKo: get(`labelKo__${q.entryId}`).trim(),
    labelEn: get(`labelEn__${q.entryId}`).trim(),
    validationPattern: get(`validationPattern__${q.entryId}`).trim(),
    choices: q.choices.map((choice, i) => ({
      value: choice.value,
      labelKo: get(`choiceKo__${q.entryId}__${i}`).trim(),
      labelEn: get(`choiceEn__${q.entryId}__${i}`).trim(),
    })),
  }));

  try {
    await saveApplyFormLabels(c.env, questions);
  } catch (err) {
    if (err instanceof ApplyFormValidationError) {
      return c.html(renderApplyFormPage(config, { error: err.message }), 400);
    }
    throw err;
  }

  c.executionCtx.waitUntil(triggerRebuild(c.env));
  return c.redirect("/apply?saved=1");
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

import { Hono } from "hono";
import type { Env } from "../types";
import { getApplyFormConfig, submitApplyForm } from "../lib/applyForm";

// 공개, 인증 불필요 — kaist.run/apply의 지원 폼 제출을 대신 받아 구글 폼으로
// 넘겨줍니다(applyForm.ts의 submitApplyForm 주석 참고: 브라우저가 구글 폼에
// 직접 크로스 오리진으로 쏘면 성공/실패를 구분할 방법이 없어서 이 경유가 필요합니다).
export const applyForm = new Hono<{ Bindings: Env }>();

applyForm.post("/submit", async (c) => {
  const config = await getApplyFormConfig(c.env);
  if (!config) return c.json({ ok: false, error: "not_configured" }, 503);

  const incoming = new URLSearchParams(await c.req.text());
  const knownEntryNames = new Set(config.questions.map((q) => `entry.${q.entryId}`));

  const outgoing = new URLSearchParams();
  for (const [key, value] of incoming.entries()) {
    if (knownEntryNames.has(key)) outgoing.append(key, value);
  }

  const result = await submitApplyForm(config.formId, outgoing);
  if (!result.ok) return c.json({ ok: false, error: "google_rejected", status: result.status }, 502);

  return c.json({ ok: true });
});

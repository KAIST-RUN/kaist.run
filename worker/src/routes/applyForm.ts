import { Hono } from "hono";
import type { Env } from "../types";
import { findApplicantEmailQuestion, getApplyFormConfig, submitApplyForm } from "../lib/applyForm";
import { buildApplyReplyEmail, isKaistEmail, sendApplyReply, type ApplyReplyLocale } from "../lib/applyReply";
import { isTurnstileConfigured, verifyTurnstile } from "../lib/turnstile";

// 공개, 인증 불필요 — kaist.run/apply의 지원 폼 제출을 대신 받아 구글 폼으로
// 넘겨줍니다(applyForm.ts의 submitApplyForm 주석 참고: 브라우저가 구글 폼에
// 직접 크로스 오리진으로 쏘면 성공/실패를 구분할 방법이 없어서 이 경유가 필요합니다).
//
// 인증이 없는 대신 Turnstile로 사람인지 확인하고, 제출이 구글에 기록된 뒤에는
// 지원자에게 자동 회신 메일을 보냅니다.
export const applyForm = new Hono<{ Bindings: Env }>();

function parseLocale(value: string | null): ApplyReplyLocale {
  return value === "en" ? "en" : "ko";
}

applyForm.post("/submit", async (c) => {
  const config = await getApplyFormConfig(c.env);
  if (!config) return c.json({ ok: false, error: "not_configured" }, 503);

  const incoming = new URLSearchParams(await c.req.text());

  // 1) 봇 차단. 시크릿이 등록돼 있을 때만 검사합니다 — 로컬 개발이나 키를 아직
  //    등록하지 않은 배포에서 지원 폼 자체가 막히면 안 되므로(turnstile.ts 참고).
  if (isTurnstileConfigured(c.env)) {
    const token = incoming.get("cf-turnstile-response") ?? "";
    const ok = await verifyTurnstile(c.env, token, c.req.header("CF-Connecting-IP") ?? null);
    if (!ok) return c.json({ ok: false, error: "turnstile_failed" }, 403);
  }

  // 2) 지원자 이메일 검증. 문항이 지정돼 있을 때만 봅니다(지정 전이면 기존과
  //    똑같이 그냥 통과). 프런트도 정규식으로 막고 있지만 그건 위조 가능하고,
  //    잘못된 주소로 접수되면 연락이 그대로 끊기므로 여기서 확실히 거릅니다.
  //
  //    값이 아예 안 온 경우: 필수 문항이면 거부합니다. 빈 값을 그냥 통과시키면
  //    필드를 빼고 쏘는 것만으로 검증을 우회할 수 있기 때문입니다. 선택 문항이면
  //    비워 두는 게 정상이므로 통과시키되, 회신은 보내지 않습니다.
  const emailQuestion = findApplicantEmailQuestion(config);
  const applicantEmail = emailQuestion ? (incoming.get(`entry.${emailQuestion.entryId}`) ?? "").trim() : "";
  if (emailQuestion && (applicantEmail !== "" || emailQuestion.required) && !isKaistEmail(applicantEmail)) {
    return c.json({ ok: false, error: "invalid_email" }, 400);
  }

  // 3) 구글 폼에는 알려진 entry.* 키만 넘깁니다 — locale이나 Turnstile 토큰 같은
  //    우리 쪽 필드가 응답 시트에 섞이지 않게.
  const knownEntryNames = new Set(config.questions.map((q) => `entry.${q.entryId}`));
  const outgoing = new URLSearchParams();
  for (const [key, value] of incoming.entries()) {
    if (knownEntryNames.has(key)) outgoing.append(key, value);
  }

  const result = await submitApplyForm(config.formId, outgoing);
  if (!result.ok) return c.json({ ok: false, error: "google_rejected", status: result.status }, 502);

  // 4) 여기까지 왔으면 구글 폼에 기록된 게 확실합니다. 회신 메일은 waitUntil로
  //    던져서, 메일이 실패해도 지원자에게는 "제출 완료"가 그대로 보이게 합니다 —
  //    실제로 접수는 됐으니까요.
  if (config.replyEnabled && isKaistEmail(applicantEmail)) {
    const locale = parseLocale(incoming.get("locale"));
    const email = buildApplyReplyEmail(config, outgoing, locale);
    c.executionCtx.waitUntil(sendApplyReply(c.env, applicantEmail, email));
  }

  return c.json({ ok: true });
});

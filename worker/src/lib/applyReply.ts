import type { Env } from "../types";
import type { ApplyFormConfig, ApplyFormQuestion } from "./applyForm";
import { escapeHtml, formatKstDateTime } from "./emailRender";

// /apply 제출이 구글 폼에 정상 기록된 뒤 지원자에게 보내는 자동 회신 메일입니다.
//
// 본문 = backstage에서 관리하는 서두(개강총회 날짜처럼 리크루팅마다 바뀌는 내용) +
// 지원자가 낸 답변 전체. 언어는 제출 당시 사이트 언어(ko/en)를 그대로 따릅니다.
//
// emailRender.ts의 page()는 재사용하지 않습니다 — 그건 브라우저용 뷰어라
// <style>/<script>/CSS 변수/prefers-color-scheme이 들어 있어서 메일 클라이언트에서
// 깨집니다. 여기서는 인라인 스타일 + <table> 레이아웃으로만 조립하고, 평문 대체본을
// 항상 같이 실어 보냅니다(HTML을 막아 둔 클라이언트와 스팸 점수 양쪽에 필요).

export type ApplyReplyLocale = "ko" | "en";

const FROM_EMAIL = "noreply@kaist.run";
const FROM_NAME = "KAIST RUN";

// 지원자 이메일 문항의 값이 실제로 카이스트 주소인지 서버에서 재확인할 때 쓰는
// 패턴입니다. 문항별 validation_pattern은 관리자가 자유롭게 바꿀 수 있고 프런트에서만
// 검사되므로(정규식이 깨지면 통과시키기까지 합니다), 회신 수신 주소만큼은 여기
// 고정 규칙으로 다시 봅니다.
const KAIST_EMAIL_PATTERN = /^[^\s@]+@kaist\.ac\.kr$/i;

export function isKaistEmail(value: string): boolean {
  return KAIST_EMAIL_PATTERN.test(value.trim());
}

function questionLabel(q: ApplyFormQuestion, locale: ApplyReplyLocale): string {
  return locale === "ko" ? q.labelKo : q.labelEn;
}

// 선택지 문항은 구글 폼에 제출되는 원문 값(choice.value)이 담겨 오므로, 화면에서
// 보이던 라벨로 되돌려서 보여줍니다 — 지원자는 "네(Yes)" 같은 내부 값이 아니라
// 자기가 클릭한 문구를 기대합니다. 매칭되는 선택지가 없으면 원문 그대로 둡니다.
function answerLabel(q: ApplyFormQuestion, value: string, locale: ApplyReplyLocale): string {
  const choice = q.choices.find((c) => c.value === value);
  if (!choice) return value;
  return (locale === "ko" ? choice.labelKo : choice.labelEn) || value;
}

type Answer = { label: string; value: string };

function collectAnswers(config: ApplyFormConfig, entries: URLSearchParams, locale: ApplyReplyLocale): Answer[] {
  return config.questions.map((q) => {
    // 체크박스는 같은 name으로 여러 값이 옵니다.
    const values = entries.getAll(`entry.${q.entryId}`).map((v) => answerLabel(q, v, locale));
    return { label: questionLabel(q, locale), value: values.join(", ") };
  });
}

const TEXT = {
  ko: {
    answersHeading: "제출하신 내용",
    submittedAt: "제출 시각",
    noAnswer: "(응답 없음)",
    footer: "이 메일은 발신 전용 주소에서 자동으로 보내졌습니다.",
  },
  en: {
    answersHeading: "Your submission",
    submittedAt: "Submitted at",
    noAnswer: "(no answer)",
    footer: "This message was sent automatically from an unmonitored address.",
  },
} as const;

// 서두는 관리자가 backstage 텍스트박스에 줄바꿈으로 입력하므로, HTML에서는 문단으로
// 나눠 줍니다(그냥 넣으면 줄바꿈이 전부 사라집니다).
function introToHtml(intro: string): string {
  return intro
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px;">${escapeHtml(para).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export type BuiltEmail = { subject: string; html: string; text: string };

export function buildApplyReplyEmail(
  config: ApplyFormConfig,
  entries: URLSearchParams,
  locale: ApplyReplyLocale,
  submittedAtMs: number = Date.now(),
): BuiltEmail {
  const t = TEXT[locale];
  const subject = locale === "ko" ? config.replySubjectKo : config.replySubjectEn;
  const intro = locale === "ko" ? config.replyIntroKo : config.replyIntroEn;
  const answers = collectAnswers(config, entries, locale);
  const submittedAt = formatKstDateTime(submittedAtMs);

  const rows = answers
    .map(
      (a) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;vertical-align:top;width:36%;color:#555555;font-size:13px;">${escapeHtml(a.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;vertical-align:top;font-size:14px;white-space:pre-wrap;">${
          a.value ? escapeHtml(a.value) : `<span style="color:#999999;">${escapeHtml(t.noAnswer)}</span>`
        }</td>
      </tr>`,
    )
    .join("");

  const html = `<div style="margin:0;padding:24px 12px;background-color:#f6f6f7;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;border:1px solid #e6e6e8;">
    <tr>
      <td style="padding:28px 28px 8px;">
        <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#2fae19;">KAIST RUN</p>
        <div style="font-size:14px;line-height:1.7;color:#222222;">${introToHtml(intro)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 0;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#555555;">${escapeHtml(t.answersHeading)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border-top:1px solid #eeeeee;">
          ${rows}
          <tr>
            <td style="padding:10px 12px;vertical-align:top;width:36%;color:#555555;font-size:13px;">${escapeHtml(t.submittedAt)}</td>
            <td style="padding:10px 12px;vertical-align:top;font-size:14px;">${escapeHtml(submittedAt)} KST</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px 28px;">
        <p style="margin:0;font-size:12px;color:#999999;">${escapeHtml(t.footer)}</p>
      </td>
    </tr>
  </table>
</div>`;

  const text = [
    intro,
    "",
    `— ${t.answersHeading} —`,
    "",
    ...answers.map((a) => `${a.label}\n${a.value || t.noAnswer}\n`),
    `${t.submittedAt}: ${submittedAt} KST`,
    "",
    t.footer,
  ].join("\n");

  return { subject, html, text };
}

// 발송 자체는 여기서 끝냅니다 — 실패해도 던지지 않고 로그만 남깁니다. 이 함수는
// 구글 폼 기록이 이미 성공한 뒤에 waitUntil로 호출되므로, 메일이 안 갔다고 해서
// 지원자에게 "제출 실패"를 보여주면 안 되기 때문입니다(index.ts가 forward()를
// try/catch 바깥에 두는 것과 같은 이유).
export async function sendApplyReply(env: Env, to: string, email: BuiltEmail): Promise<void> {
  try {
    await env.SEND_EMAIL.send({
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (err) {
    // 발신 도메인 온보딩(wrangler email sending enable kaist.run)이 안 끝났으면
    // E_SENDER_NOT_VERIFIED가 여기로 옵니다 — 배포 후 첫 지원이 들어왔는데 메일이
    // 안 왔다면 Worker 로그에서 이 줄을 확인하세요.
    console.error("Failed to send apply reply email", err);
  }
}

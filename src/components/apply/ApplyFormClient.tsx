"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ApplyFormConfig, ApplyFormQuestion } from "@/lib/content/applyForm";
import { submitApplyForm } from "@/lib/apply/submit";

type Locale = "ko" | "en";

function fieldName(entryId: string): string {
  return `entry.${entryId}`;
}

// backstage에서 저장한 정규식이 어쩌다 깨져 있어도(문법 오류) 지원자가 제출을 아예
// 못 하는 상황은 피합니다 — 그런 경우 검증을 그냥 건너뜁니다(항상 통과).
function testPattern(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    return true;
  }
}

function TextField({
  label,
  error,
  ...props
}: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <input
        {...props}
        aria-invalid={!!error}
        className={`rounded-xl border bg-transparent px-4 py-2.5 text-base outline-none transition-colors ${
          error
            ? "border-red-500 focus:border-red-500"
            : "border-black/10 focus:border-[var(--foreground)] dark:border-white/15 dark:focus:border-white/60"
        }`}
      />
      {error && <span className="text-xs font-medium text-red-500">{error}</span>}
    </label>
  );
}

function TextAreaField({
  label,
  error,
  ...props
}: { label: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <textarea
        {...props}
        rows={4}
        aria-invalid={!!error}
        className={`resize-y rounded-xl border bg-transparent px-4 py-2.5 text-base leading-relaxed outline-none transition-colors ${
          error
            ? "border-red-500 focus:border-red-500"
            : "border-black/10 focus:border-[var(--foreground)] dark:border-white/15 dark:focus:border-white/60"
        }`}
      />
      {error && <span className="text-xs font-medium text-red-500">{error}</span>}
    </label>
  );
}

// 문항마다 검증 정규식이 지정돼 있을 수 있어서(backstage에서 편집), 그 정규식에
// 안 맞는 값을 입력하면 제출을 막습니다. 정규식이 없으면 그냥 평범한 입력 필드입니다.
function ValidatedField({
  label,
  name,
  required,
  pattern,
  patternError,
  multiline,
}: {
  label: string;
  name: string;
  required?: boolean;
  pattern: string;
  patternError: string;
  multiline: boolean;
}) {
  const [value, setValue] = useState("");
  const invalid = pattern.length > 0 && value.length > 0 && !testPattern(pattern, value);

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    const bad = pattern.length > 0 && v.length > 0 && !testPattern(pattern, v);
    e.target.setCustomValidity(bad ? patternError : "");
  }

  const error = invalid ? patternError : undefined;

  if (multiline) {
    return <TextAreaField label={label} name={name} required={required} value={value} onChange={handleChange} error={error} />;
  }
  return <TextField label={label} name={name} required={required} value={value} onChange={handleChange} error={error} />;
}

type Option = { value: string; label: string };

function RadioGroup({
  question,
  name,
  options,
  required,
}: {
  question: string;
  name: string;
  options: Option[];
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <span className="font-semibold">{question}</span>
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-black/10 px-4 py-2.5 transition-colors hover:bg-black/[.03] has-[:checked]:border-[var(--foreground)] has-[:checked]:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.05] dark:has-[:checked]:border-white/60 dark:has-[:checked]:bg-white/[.08]"
          >
            <input type="radio" name={name} value={option.value} required={required} className="accent-[var(--foreground)]" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// 체크박스는 라디오와 달리 "그룹 중 하나 이상 체크"를 네이티브 required만으로
// 표현할 방법이 없습니다(개별 input의 required는 "그 항목 자체가 체크되어야 함"이
// 되어버림) — 그래서 하나라도 체크되면 모든 input의 required를 끄고, 하나도
// 안 체크됐으면 첫 번째 input에만 required를 걸어 그룹 전체의 유효성을 대표하게
// 합니다. name이 전부 같아서 체크된 값들은 폼 제출 시 자동으로 여러 개 전송됩니다.
function CheckboxGroup({
  question,
  name,
  options,
  required,
}: {
  question: string;
  name: string;
  options: Option[];
  required?: boolean;
}) {
  const [checkedCount, setCheckedCount] = useState(0);

  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <span className="font-semibold">{question}</span>
      <div className="flex flex-col gap-2">
        {options.map((option, i) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-black/10 px-4 py-2.5 transition-colors hover:bg-black/[.03] has-[:checked]:border-[var(--foreground)] has-[:checked]:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.05] dark:has-[:checked]:border-white/60 dark:has-[:checked]:bg-white/[.08]"
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              required={required && checkedCount === 0 && i === 0}
              onChange={(e) => setCheckedCount((c) => c + (e.target.checked ? 1 : -1))}
              className="accent-[var(--foreground)]"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: Option[];
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-base outline-none transition-colors focus:border-[var(--foreground)] dark:border-white/15 dark:focus:border-white/60"
      >
        <option value="" disabled></option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-black">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function questionLabel(q: ApplyFormQuestion, locale: Locale): string {
  return locale === "ko" ? q.labelKo : q.labelEn;
}

function questionOptions(q: ApplyFormQuestion, locale: Locale): Option[] {
  return q.choices.map((c) => ({ value: c.value, label: locale === "ko" ? c.labelKo : c.labelEn }));
}

export default function ApplyFormClient({ config, locale }: { config: ApplyFormConfig; locale: Locale }) {
  const t = useTranslations("apply");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const [isFormValid, setIsFormValid] = useState(false);

  function updateFormValidity() {
    setIsFormValid(formRef.current?.checkValidity() ?? false);
  }

  const viewUrl = `https://docs.google.com/forms/d/e/${config.formId}/viewform`;

  // 예전엔 <form target="hidden_iframe">로 구글 폼에 브라우저가 직접 크로스 오리진
  // 제출을 했는데, CORS 때문에 응답을 전혀 못 읽어서 400이 나도 화면엔 "제출
  // 완료"가 떴습니다. 이제 우리 Worker(/api/apply-form/submit)를 거쳐서 제출하고,
  // 실제 성공/실패를 받아 옵니다(worker/src/routes/applyForm.ts 참고).
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    setStatus("submitting");
    const ok = await submitApplyForm(new FormData(formRef.current));
    setStatus(ok ? "submitted" : "error");
  }

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col px-6 py-12 sm:px-10 sm:py-16">
      {status === "submitted" ? (
        <div className="animate-fade-in-up flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
          <span className="text-4xl">🎉</span>
          <h1 className="text-2xl font-bold sm:text-3xl">{t("successTitle")}</h1>
          <p className="max-w-sm text-sm leading-relaxed opacity-70 sm:text-base">{t("successBody")}</p>
          <Link
            href="/"
            className="mt-4 rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-80 sm:text-base"
          >
            {t("backHome")}
          </Link>
        </div>
      ) : (
        <>
          <div className="animate-fade-in-up mt-10 flex flex-col gap-2" style={{ animationDelay: "80ms" }}>
            <h1 className="text-3xl font-bold sm:text-4xl">{t("pageTitle")}</h1>
            <p className="text-sm opacity-70 sm:text-base">{t("intro")}</p>
          </div>

          <form
            ref={formRef}
            onInput={updateFormValidity}
            onChange={updateFormValidity}
            onSubmit={handleSubmit}
            className="animate-fade-in-up mt-10 flex flex-col gap-6 pb-16"
            style={{ animationDelay: "160ms" }}
          >
            <div className="flex flex-col gap-5 rounded-2xl border border-black/10 p-6 dark:border-white/15 sm:p-8">
              {config.questions.map((q) => {
                const name = fieldName(q.entryId);
                const label = questionLabel(q, locale);

                if ((q.type === "short_answer" || q.type === "paragraph") && q.validationPattern) {
                  return (
                    <ValidatedField
                      key={q.entryId}
                      label={label}
                      name={name}
                      required={q.required}
                      pattern={q.validationPattern}
                      patternError={t("fields.patternError")}
                      multiline={q.type === "paragraph"}
                    />
                  );
                }

                switch (q.type) {
                  case "short_answer":
                    return <TextField key={q.entryId} label={label} name={name} required={q.required} />;
                  case "paragraph":
                    return <TextAreaField key={q.entryId} label={label} name={name} required={q.required} />;
                  case "radio":
                    return (
                      <RadioGroup key={q.entryId} question={label} name={name} options={questionOptions(q, locale)} required={q.required} />
                    );
                  case "checkbox":
                    return (
                      <CheckboxGroup key={q.entryId} question={label} name={name} options={questionOptions(q, locale)} required={q.required} />
                    );
                  case "dropdown":
                    return (
                      <SelectField key={q.entryId} label={label} name={name} options={questionOptions(q, locale)} required={q.required} />
                    );
                  default:
                    return null;
                }
              })}
            </div>

            {status === "error" && (
              <p
                role="alert"
                className="animate-fade-in-up rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm font-medium text-red-500"
              >
                {t("submitError")}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "submitting" || !isFormValid}
              className="mt-2 w-full rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-80 disabled:opacity-50 sm:text-base"
            >
              {status === "submitting" ? t("submitting") : t("submit")}
            </button>

            <p className="text-center text-xs opacity-50">
              {t.rich("fallback", {
                link: (chunks) => (
                  <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </form>
        </>
      )}
    </main>
  );
}

"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Logo from "@/components/Logo";
import { RECRUIT_FORM_URL } from "@/lib/recruit";

const FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLScQQDBR86VQTi8d9QNIYS-YxswumVENwogRsbzVuIxmIs90ZQ/formResponse";

const KAIST_EMAIL_PATTERN = /^[^\s@]+@kaist\.ac\.kr$/i;

type RadioOption = { value: string; label: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/10 p-6 dark:border-white/15 sm:p-8">
      <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
      {children}
    </div>
  );
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
  ...props
}: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <textarea
        {...props}
        rows={4}
        className="resize-y rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-base leading-relaxed outline-none transition-colors focus:border-[var(--foreground)] dark:border-white/15 dark:focus:border-white/60"
      />
    </label>
  );
}

function RadioGroup({
  question,
  name,
  options,
  required,
}: {
  question: string;
  name: string;
  options: RadioOption[];
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
            <input
              type="radio"
              name={name}
              value={option.value}
              required={required}
              className="accent-[var(--foreground)]"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ApplyPage() {
  const t = useTranslations("apply");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted">("idle");
  const hasSubmitted = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [email, setEmail] = useState("");
  const [isFormValid, setIsFormValid] = useState(false);

  const emailError = email.length > 0 && !KAIST_EMAIL_PATTERN.test(email);

  const commitmentOptions = t.raw("questions.commitment.options") as RadioOption[];
  const scheduleOptions = t.raw("questions.schedule.options") as RadioOption[];
  const firstMeetingOptions = t.raw("questions.firstMeeting.options") as RadioOption[];

  function handleEmailChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setEmail(value);
    const invalid = value.length > 0 && !KAIST_EMAIL_PATTERN.test(value);
    e.target.setCustomValidity(invalid ? t("fields.emailError") : "");
  }

  function updateFormValidity() {
    setIsFormValid(formRef.current?.checkValidity() ?? false);
  }

  return (
    <main className="h-dvh overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col px-6 py-12 sm:px-10 sm:py-16">
        <Link href="/" className="animate-fade-in-up flex w-fit items-center gap-2 font-bold">
          <Logo className="h-6 w-auto" />
          <span className="sr-only">RUN</span>
        </Link>

        {status === "submitted" ? (
          <div className="animate-fade-in-up flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
            <span className="text-4xl">🎉</span>
            <h1 className="text-2xl font-bold sm:text-3xl">{t("successTitle")}</h1>
            <p className="max-w-sm text-sm leading-relaxed opacity-70 sm:text-base">
              {t("successBody")}
            </p>
            <Link
              href="/"
              className="mt-4 rounded-full bg-[var(--foreground)] px-8 py-3 text-sm font-semibold text-[var(--background)] transition-opacity hover:opacity-80 sm:text-base"
            >
              {t("backHome")}
            </Link>
          </div>
        ) : (
          <>
            <div
              className="animate-fade-in-up mt-10 flex flex-col gap-2"
              style={{ animationDelay: "80ms" }}
            >
              <h1 className="text-3xl font-bold sm:text-4xl">{t("pageTitle")}</h1>
              <p className="text-sm opacity-70 sm:text-base">{t("intro")}</p>
            </div>

            <form
              ref={formRef}
              action={FORM_ACTION}
              method="POST"
              target="hidden_iframe"
              onInput={updateFormValidity}
              onChange={updateFormValidity}
              onSubmit={() => {
                hasSubmitted.current = true;
                setStatus("submitting");
              }}
              className="animate-fade-in-up mt-10 flex flex-col gap-6 pb-16"
              style={{ animationDelay: "160ms" }}
            >
              <Section title={t("sections.basicInfo")}>
                <TextField label={t("fields.name")} name="entry.1965855845" required />
                <TextField label={t("fields.studentId")} name="entry.535588177" required />
                <TextField label={t("fields.contact")} name="entry.1657892153" required />
                <TextField
                  label={t("fields.email")}
                  name="entry.1283257696"
                  type="email"
                  required
                  value={email}
                  onChange={handleEmailChange}
                  error={emailError ? t("fields.emailError") : undefined}
                />
              </Section>

              <Section title={t("sections.content")}>
                <TextAreaField
                  label={t("fields.motivation")}
                  name="entry.1750517110"
                  required
                />
                <TextAreaField
                  label={t("fields.experience")}
                  name="entry.985421141"
                  required
                />
              </Section>

              <Section title={t("sections.confirmation")}>
                <RadioGroup
                  question={t("questions.commitment.question")}
                  name="entry.2049821449"
                  options={commitmentOptions}
                  required
                />
                <RadioGroup
                  question={t("questions.schedule.question")}
                  name="entry.515906054"
                  options={scheduleOptions}
                  required
                />
                <RadioGroup
                  question={t("questions.firstMeeting.question")}
                  name="entry.377341544"
                  options={firstMeetingOptions}
                  required
                />
              </Section>

              <button
                type="submit"
                disabled={status === "submitting" || !isFormValid}
                className="mt-2 w-full rounded-full bg-[var(--foreground)] px-8 py-3 text-sm font-semibold text-[var(--background)] transition-opacity hover:opacity-80 disabled:opacity-50 sm:text-base"
              >
                {status === "submitting" ? t("submitting") : t("submit")}
              </button>

              <p className="text-center text-xs opacity-50">
                {t.rich("fallback", {
                  link: (chunks) => (
                    <a
                      href={RECRUIT_FORM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            </form>
          </>
        )}
      </div>

      <iframe
        name="hidden_iframe"
        style={{ display: "none" }}
        title="submit"
        onLoad={() => {
          if (hasSubmitted.current) {
            setStatus("submitted");
          }
        }}
      />
    </main>
  );
}

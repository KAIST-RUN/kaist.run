import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getContact, type ContactSocial } from "@/lib/content/contact";
import { markdownToHtml } from "@/lib/markdown";

function SocialIcon({ platform }: { platform: ContactSocial["platform"] }) {
  switch (platform) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
        </svg>
      );
    case "discord":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M20.32 5.36a17.3 17.3 0 0 0-4.3-1.34l-.21.42a15.9 15.9 0 0 1 3.79 1.17 16.5 16.5 0 0 0-15.2 0 15.9 15.9 0 0 1 3.79-1.17l-.21-.42a17.3 17.3 0 0 0-4.3 1.34C1.3 9.2.4 12.94.7 16.63a17.6 17.6 0 0 0 5.16 2.55l.63-1.03a11.3 11.3 0 0 1-1.65-.78c.14-.1.28-.2.4-.32a12.5 12.5 0 0 0 10.52 0c.13.11.27.21.4.32-.52.31-1.07.56-1.65.78l.63 1.03a17.5 17.5 0 0 0 5.16-2.55c.36-4.29-.75-7.98-3.98-11.27ZM8.7 14.4c-.9 0-1.63-.82-1.63-1.83 0-1 .72-1.83 1.63-1.83s1.65.83 1.63 1.83c0 1-.72 1.83-1.63 1.83Zm6.62 0c-.9 0-1.63-.82-1.63-1.83 0-1 .72-1.83 1.63-1.83s1.64.83 1.63 1.83c0 1-.72 1.83-1.63 1.83Z" />
        </svg>
      );
    case "email":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 6-10 7L2 6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations({ locale: locale as Locale, namespace: "site" });

  const contact = getContact(locale as Locale);
  if (!contact) notFound();

  const html = await markdownToHtml(contact.content);
  const year = new Date().getFullYear();

  return (
    <main className="animate-fade-in-up mx-auto max-w-3xl px-6 py-12 sm:px-10 sm:py-16 lg:max-w-4xl lg:px-12">
      <div className="rounded-3xl border border-black/10 p-8 sm:p-12 lg:p-16 dark:border-white/15">
        <h1 className="text-3xl font-bold sm:text-4xl">{contact.title}</h1>
        <p className="mt-2 text-sm font-bold opacity-60">
          {year} © {t("name")}
        </p>

        <div className="mt-10 flex flex-col gap-10 sm:flex-row sm:gap-12">
          <div className="flex flex-1 flex-col gap-8">
            {contact.info && contact.info.length > 0 && (
              <dl className="flex flex-col gap-2.5">
                {contact.info.map((row) => (
                  <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="w-28 shrink-0 text-sm font-bold opacity-60">{row.label}</dt>
                    <dd className="flex flex-col gap-0.5 text-sm sm:text-base">
                      {row.lines.map((line) =>
                        line.href ? (
                          <a
                            key={line.text}
                            href={line.href}
                            className="underline decoration-black/20 underline-offset-4 hover:opacity-70 dark:decoration-white/30"
                          >
                            {line.text}
                          </a>
                        ) : (
                          <span key={line.text}>{line.text}</span>
                        ),
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {contact.socials && contact.socials.length > 0 && (
              <div className="flex flex-col gap-3">
                {contact.socials.map((social) => (
                  <a
                    key={social.url}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm hover:opacity-70 sm:text-base"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 dark:border-white/15">
                      <SocialIcon platform={social.platform} />
                    </span>
                    {social.label}
                  </a>
                ))}
              </div>
            )}

            {contact.content.trim() && (
              <div
                className="prose prose-neutral prose-sm max-w-none opacity-70 dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </div>

          <div className="hidden w-px shrink-0 bg-black/10 sm:block dark:bg-white/15" />

          <div className="flex flex-row items-end justify-between gap-4 sm:flex-col sm:items-end sm:justify-end sm:text-right">
            <span className="text-3xl font-black tracking-tight">{t("name")}.</span>
            <span className="text-xs leading-snug opacity-60 sm:text-sm">{t("tagline")}</span>
          </div>
        </div>
      </div>
    </main>
  );
}

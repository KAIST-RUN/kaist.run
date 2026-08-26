"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";

type Level = { name: string; description: string };
type Event = { season: string; name: string; description: string };
type NoticeSummary = { slug: string; title: string; date: string };
type ExternalContest = {
  name: string;
  url: string;
  description: string;
  fullName?: string;
  rounds?: string[];
};

export type HomeStoryProps = {
  intro: {
    paragraphs: string[];
  };
  study: {
    title: string;
    body: string;
    imageAlt: string;
    levels: Level[];
  };
  contests: {
    title: string;
    body: string;
    photoAlt: string;
    list: ExternalContest[];
  };
  hosting: {
    title: string;
    body: string;
    photoAlt: string;
    events: Event[];
  };
  recruit: {
    line1: string;
    line2: string;
    buttonLabel: string;
  };
  news: {
    title: string;
    viewAllLabel: string;
    emptyLabel: string;
    notices: NoticeSummary[];
  };
};

function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

export default function HomeStory({ intro, study, contests, hosting, recruit, news }: HomeStoryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [expandedContest, setExpandedContest] = useState(contests.list[0]?.name ?? null);
  const activeContest = contests.list.find((contest) => contest.name === expandedContest);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scrollParent = findScrollParent(root);
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-story-section]"));
    const reveals = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));

    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { root: scrollParent, threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );
    reveals.forEach((el) => revealObserver.observe(el));

    const activeObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) => (a.intersectionRatio > b.intersectionRatio ? a : b));
        const id = top.target.getAttribute("data-story-section");
        if (id) root.setAttribute("data-active", id);
      },
      { root: scrollParent, threshold: [0.3, 0.5, 0.7] },
    );
    sections.forEach((el) => activeObserver.observe(el));

    return () => {
      revealObserver.disconnect();
      activeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef} className="story-bg" data-active="hero">
      {/* 소개 */}
      <section
        data-story-section="intro"
        className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-20 text-center sm:px-10 sm:py-28 lg:px-12"
      >
        {intro.paragraphs.map((paragraph) => (
          <p key={paragraph} className="reveal text-lg leading-relaxed opacity-80 sm:text-xl">
            {paragraph}
          </p>
        ))}
      </section>

      {/* 스터디 */}
      <section
        data-story-section="study"
        className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-2 lg:gap-16 lg:px-12"
      >
        <div className="reveal order-2 flex flex-col gap-5 lg:order-1">
          <h2 className="text-2xl font-bold sm:text-3xl">{study.title}</h2>
          <p className="text-base leading-relaxed opacity-70 sm:text-lg">{study.body}</p>
          <dl className="mt-2 flex flex-col gap-4">
            {study.levels.map((level) => (
              <div key={level.name}>
                <dt className="font-semibold">{level.name}</dt>
                <dd className="mt-0.5 text-sm opacity-70 sm:text-base">{level.description}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="reveal order-1 flex items-center justify-center lg:order-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/cenix.webp"
            alt={study.imageAlt}
            loading="lazy"
            decoding="async"
            className="aspect-square w-full max-w-sm object-contain"
          />
        </div>
      </section>

      {/* 대회 참여 */}
      <section
        data-story-section="contests"
        className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-10 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-2 lg:gap-16 lg:px-12"
      >
        <div className="reveal overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/contest_photo2.webp"
            alt={contests.photoAlt}
            loading="lazy"
            decoding="async"
            className="h-auto w-full"
          />
        </div>
        <div className="reveal flex flex-col gap-5">
          <h2 className="text-2xl font-bold sm:text-3xl">{contests.title}</h2>
          <p className="text-base leading-relaxed opacity-70 sm:text-lg">{contests.body}</p>

          <div className="flex flex-wrap gap-2">
            {contests.list.map((contest) => {
              const isExpanded = expandedContest === contest.name;
              return (
                <button
                  key={contest.name}
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedContest(contest.name)}
                  className={`cursor-pointer rounded-full px-3 py-1 text-sm transition-colors ${
                    isExpanded
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "bg-black/[.05] hover:bg-black/[.1] dark:bg-white/[.08] dark:hover:bg-white/[.14]"
                  }`}
                >
                  {contest.name}
                </button>
              );
            })}
          </div>

          {activeContest && (
            <div className="h-[190px] overflow-hidden rounded-2xl border border-black/10 p-5 sm:h-[168px] dark:border-white/15">
              <div key={activeContest.name} className="animate-fade-in">
                <div className="flex items-baseline gap-2">
                  <a
                    href={activeContest.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold underline decoration-black/20 underline-offset-4 hover:opacity-70 dark:decoration-white/30"
                  >
                    {activeContest.name}
                  </a>
                  {activeContest.fullName && (
                    <span className="text-sm opacity-60">{activeContest.fullName}</span>
                  )}
                </div>
                <p className="mt-1 text-sm opacity-70 sm:text-base">{activeContest.description}</p>
                {activeContest.rounds && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {activeContest.rounds.map((round) => (
                      <li
                        key={round}
                        className="rounded-full border border-black/10 px-3 py-1 text-xs opacity-80 dark:border-white/15"
                      >
                        {round}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 대회 개최 */}
      <section
        data-story-section="hosting"
        className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-20 sm:px-10 sm:py-28 lg:px-12"
      >
        <div className="reveal flex flex-col gap-5 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{hosting.title}</h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed opacity-70 sm:text-lg">
            {hosting.body}
          </p>
        </div>

        <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2">
          {hosting.events.map((event) => (
            <div key={event.name} className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
              <span className="text-xs font-bold tracking-wide opacity-50">[{event.season}]</span>
              <h3 className="mt-1 text-lg font-semibold sm:text-xl">{event.name}</h3>
              <p className="mt-2 text-sm opacity-70 sm:text-base">{event.description}</p>
            </div>
          ))}
        </div>

        <div className="reveal overflow-hidden rounded-2xl border border-black/10 dark:border-white/15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/contest_photo.webp"
            alt={hosting.photoAlt}
            loading="lazy"
            decoding="async"
            className="aspect-[21/9] w-full object-cover"
          />
        </div>
      </section>

      {/* 가입 신청 */}
      <section
        data-story-section="recruit"
        className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-6 py-20 text-center sm:px-10 sm:py-28 lg:px-12"
      >
        <p className="reveal text-2xl leading-snug font-bold sm:text-3xl">
          {recruit.line1}
          <br />
          {recruit.line2}
        </p>
        <Link
          href="/apply"
          className="reveal rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-80 sm:text-base"
        >
          {recruit.buttonLabel}
        </Link>
      </section>

      {/* 최근 소식 */}
      <section
        data-story-section="news"
        className="mx-auto max-w-4xl px-6 py-20 sm:px-10 sm:py-28 lg:px-12"
      >
        <div className="reveal flex items-center justify-between px-1">
          <h2 className="text-lg font-semibold sm:text-xl">{news.title}</h2>
          <Link
            href="/notices"
            className="text-sm opacity-60 transition-opacity hover:opacity-100"
          >
            {news.viewAllLabel} →
          </Link>
        </div>

        {news.notices.length === 0 ? (
          <p className="reveal mt-4 text-sm opacity-50">{news.emptyLabel}</p>
        ) : (
          <div className="reveal mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {news.notices.map((notice) => (
              <Link
                key={notice.slug}
                href={`/notices/${notice.slug}`}
                className="flex min-w-0 flex-col gap-1 rounded-xl border border-black/10 p-4 transition-colors hover:-translate-y-0.5 hover:bg-black/[.03] hover:shadow-md dark:border-white/10 dark:hover:bg-white/[.04]"
              >
                <span className="text-xs opacity-50 sm:text-sm">{notice.date}</span>
                <span className="truncate text-sm font-medium sm:text-base">{notice.title}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 협력 기관 */}
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 pt-4 pb-16 sm:px-10 sm:pb-24 lg:px-12">
        <div className="reveal flex flex-wrap items-center justify-center gap-8 sm:gap-10">
          <a
            href="https://cs.kaist.ac.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-70"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/kaist_soc.png"
              alt="KAIST School of Computing"
              className="h-8 w-auto object-contain sm:h-11"
            />
          </a>
          <a
            href="https://www.janestreet.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-70"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/jane_street_light.png"
              alt="Jane Street"
              className="h-8 w-auto object-contain sm:h-11 dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/jane_street_dark.svg"
              alt="Jane Street"
              className="hidden h-8 w-auto object-contain sm:h-11 dark:block"
            />
          </a>
          <a
            href="https://www.hudsonrivertrading.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-70"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/hrt.svg"
              alt="Hudson River Trading"
              className="h-8 w-auto object-contain sm:h-11"
            />
          </a>
        </div>
      </section>
    </div>
  );
}

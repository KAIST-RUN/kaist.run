// .claude/preview.py의 파싱/렌더링 규칙을 그대로 TypeScript로 옮긴 버전입니다.
// 두 구현이 갈라지지 않도록, 문법을 바꿀 땐 두 파일을 같이 고쳐주세요.
//
// 입력 텍스트 문법('-' 개수로 계층 표시, 번호는 자동 채번)은 .claude/preview.py의
// 모듈 docstring에 정리되어 있습니다.

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
const SUBITEM = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하"];

const RE_HISTORY_LIST = /^\[(.+)]$/;
const RE_DASH = /^(-{1,5})\s+(.*)$/;
const RE_SECTION_MARK = /^=\s+(.*)$/;
const RE_BUCHIK = /^부칙\b/;
const RE_STANDALONE_TAG = /^(\[[^\]]+]|<[^>]+>)(\s*(\[[^\]]+]|<[^>]+>))*$/;
const RE_INLINE_TAG_SPLIT = /(<[^>]+>|\[[^\]]+])/;
const RE_INLINE_TAG_FULL = /^(<[^>]+>|\[[^\]]+])$/;
const RE_DATE_NUMS = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/;

type ParaType = "clause" | "item" | "subitem" | "body";

type BylawsEvent =
  | { kind: "title"; text: string }
  | { kind: "history"; text: string }
  | { kind: "chapter"; text: string }
  | { kind: "section"; text: string }
  | { kind: "buchik"; text: string }
  | { kind: "article"; text: string }
  | { kind: "tagline"; text: string }
  | { kind: "para"; type: ParaType; marker: string; text: string };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseBylaws(rawText: string): BylawsEvent[] {
  const events: BylawsEvent[] = [];
  let stage: "pre_title" | "history" | "body" = "pre_title";
  let openPara: { type: ParaType; marker: string; text: string } | null = null;

  // counters[1]=장, [2]=조, [3]=항, [4]=호, [5]=목. 조(2)는 장이 바뀌어도 리셋 안 함.
  const counters = [0, 0, 0, 0, 0, 0];
  let sectionCounter = 0;
  const revisionDates: string[] = [];

  const tagDate = (numStr?: string): string | null => {
    if (revisionDates.length === 0) return null;
    if (numStr) {
      const idx = Number(numStr) - 1;
      return idx >= 0 && idx < revisionDates.length ? revisionDates[idx] : null;
    }
    return revisionDates[revisionDates.length - 1];
  };

  const flush = () => {
    if (openPara !== null) {
      events.push({ kind: "para", ...openPara });
      openPara = null;
    }
  };

  const resetBelow = (depth: number) => {
    for (let i = Math.max(depth, 2) + 1; i < 6; i++) counters[i] = 0;
  };

  for (const raw of rawText.split("\n")) {
    let line = raw.trim();

    if (!line) {
      flush();
      continue;
    }

    if (stage === "pre_title") {
      flush();
      events.push({ kind: "title", text: line });
      stage = "history";
      continue;
    }

    if (stage === "history") {
      stage = "body";
      const mList = RE_HISTORY_LIST.exec(line);
      if (mList) {
        for (const token of mList[1].split(/\s+/).filter(Boolean)) {
          const dm = RE_DATE_NUMS.exec(token);
          if (dm) {
            const [, y, mo, d] = dm;
            revisionDates.push(`${Number(y)}. ${String(Number(mo)).padStart(2, "0")}. ${String(Number(d)).padStart(2, "0")}.`);
          }
        }
        revisionDates.forEach((d, i) => {
          events.push({ kind: "history", text: `${d} ${i === 0 ? "제정" : "일부개정"}` });
        });
        continue; // 이 줄 자체는 본문으로 내려보내지 않음
      }
      // 날짜 목록 줄이 아니었으면 그대로 본문 처리로 흘러감
    }

    line = line.replace(/<(개정|신설|삭제)(?:\s+(\d+))?>/g, (match, kind: string, num?: string) => {
      const d = tagDate(num);
      return d ? `<${kind} ${d}>` : match;
    });
    line = line.replace(/\[(본조신설)(?:\s+(\d+))?]/g, (match, kind: string, num?: string) => {
      const d = tagDate(num);
      return d ? `[${kind} ${d}]` : match;
    });

    // ---- body stage ----
    if (RE_BUCHIK.test(line)) {
      flush();
      events.push({ kind: "buchik", text: line });
      counters[2] = 0;
      resetBelow(2);
      sectionCounter = 0;
      continue;
    }

    const mSection = RE_SECTION_MARK.exec(line);
    if (mSection) {
      flush();
      sectionCounter += 1;
      events.push({ kind: "section", text: `제${sectionCounter}절 ${mSection[1].trim()}` });
      continue;
    }

    const mDash = RE_DASH.exec(line);
    if (mDash) {
      flush();
      const depth = mDash[1].length;
      const text = mDash[2].trim();
      counters[depth] += 1;
      resetBelow(depth);

      if (depth === 1) {
        events.push({ kind: "chapter", text: `제${counters[1]}장 ${text}` });
        sectionCounter = 0;
      } else if (depth === 2) {
        events.push({ kind: "article", text: `제${counters[2]}조(${text})` });
      } else if (depth === 3) {
        const idx = counters[3] - 1;
        const marker = idx < CIRCLED.length ? CIRCLED[idx] : `(${counters[3]})`;
        openPara = { type: "clause", marker, text };
      } else if (depth === 4) {
        openPara = { type: "item", marker: `${counters[4]}.`, text };
      } else if (depth === 5) {
        const idx = counters[5] - 1;
        const marker = idx < SUBITEM.length ? `${SUBITEM[idx]}.` : `${counters[5]})`;
        openPara = { type: "subitem", marker, text };
      }
      continue;
    }

    if (RE_STANDALONE_TAG.test(line)) {
      flush();
      events.push({ kind: "tagline", text: line });
      continue;
    }

    if (openPara !== null) {
      openPara.text += ` ${line}`;
    } else {
      openPara = { type: "body", marker: "", text: line };
    }
  }

  flush();
  return events;
}

function colorizeTags(text: string): string {
  return text
    .split(RE_INLINE_TAG_SPLIT)
    .filter(Boolean)
    .map((part) => (RE_INLINE_TAG_FULL.test(part) ? `<span class="bylaws-tag">${escapeHtml(part)}</span>` : escapeHtml(part)))
    .join("");
}

function renderEvents(events: BylawsEvent[]): string {
  const body: string[] = [];
  let historyBuf: string[] = [];

  const flushHistory = () => {
    if (historyBuf.length > 0) {
      body.push('<div class="bylaws-history-block">');
      for (const h of historyBuf) body.push(`<div class="bylaws-history-line">${escapeHtml(h)}</div>`);
      body.push("</div>");
      historyBuf = [];
    }
  };

  for (const ev of events) {
    switch (ev.kind) {
      case "title":
        body.push(`<div class="bylaws-title">${escapeHtml(ev.text)}</div>`);
        break;
      case "history":
        historyBuf.push(ev.text);
        break;
      case "chapter":
        flushHistory();
        body.push(`<div class="bylaws-chapter">${escapeHtml(ev.text)}</div>`);
        break;
      case "section":
        flushHistory();
        body.push(`<div class="bylaws-section">${escapeHtml(ev.text)}</div>`);
        break;
      case "buchik":
        flushHistory();
        body.push(`<div class="bylaws-buchik">${colorizeTags(ev.text)}</div>`);
        break;
      case "article":
        flushHistory();
        body.push(`<div class="bylaws-article">${colorizeTags(ev.text)}</div>`);
        break;
      case "tagline":
        flushHistory();
        body.push(`<div class="bylaws-tagline">${colorizeTags(ev.text)}</div>`);
        break;
      case "para": {
        flushHistory();
        const text = colorizeTags(ev.text);
        const marker = ev.marker
          ? `<span class="bylaws-marker">${escapeHtml(ev.marker)}</span>`
          : "";
        body.push(`<div class="bylaws-${ev.type}">${marker}<span class="bylaws-ptext">${text}</span></div>`);
        break;
      }
    }
  }
  flushHistory();
  return body.join("\n");
}

// 회칙 원문(.claude/preview.py와 같은 문법)을 렌더링된 HTML 문자열로 변환합니다.
// 이 HTML은 우리가 직접 생성한 고정된 태그/클래스만 쓰고 텍스트는 전부
// escapeHtml을 거치므로 dangerouslySetInnerHTML로 바로 써도 안전합니다
// (다른 관리자 편집 콘텐츠 — 공지/연락처 markdown — 과 같은 신뢰 수준).
export function renderBylaws(rawText: string): string {
  return renderEvents(parseBylaws(rawText));
}

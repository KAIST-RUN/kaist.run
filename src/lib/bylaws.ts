// 회칙은 backstage에서 "장/절/조/항/호/목" 타입을 고른 행(row)들의 순서로 편집합니다
// (worker/src/lib/backstageRender.ts의 +버튼 에디터). 번호(제1장, ①, 1. 등)는 여기서
// 그 순서를 보고 매번 새로 계산합니다 — 저장된 텍스트에 번호가 박혀있지 않으므로
// 중간에 행을 추가/삭제해도 뒤의 번호가 자동으로 밀립니다.

export type BylawsBlockType =
  | "chapter" // 장 — "제N장"
  | "section" // 절 — "제N절" (장이 바뀌면 리셋)
  | "article" // 조 — "제N조(...)" (장/절이 바뀌어도 리셋 안 됨, 문서 전체 연속)
  | "buchik" // 부칙 표제(장급, 가운데 정렬)
  | "clause" // 항 — ①②③... (조가 바뀌면 리셋)
  | "item" // 호 — 1. 2. 3. ... (항이 바뀌면 리셋)
  | "subitem" // 목 — 가. 나. 다. ... (호가 바뀌면 리셋)
  | "body" // 번호 없는 문단(조 바로 아래 한 문단짜리 조문 등)
  | "tagline"; // [본조신설 ...] 같은 우측 정렬 강조 문구

export type BylawsBlock = { type: BylawsBlockType; text: string };
export type BylawsRevision = { date: string; label: string };

export type BylawsDocument = {
  title: string;
  revisionHistory: BylawsRevision[];
  blocks: BylawsBlock[];
};

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
const SUBITEM = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하"];

const RE_INLINE_TAG_SPLIT = /(<[^>]+>|\[[^\]]+])/;
const RE_INLINE_TAG_FULL = /^(<[^>]+>|\[[^\]]+])$/;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// <개정 N>, [본조신설 N] 안의 N을 개정이력의 N번째(1부터) 날짜로 치환합니다.
// N이 없으면(<개정>만) 최신 날짜를 씁니다.
function substituteTagDates(text: string, revisionHistory: BylawsRevision[]): string {
  const tagDate = (numStr?: string): string | null => {
    if (revisionHistory.length === 0) return null;
    if (numStr) {
      const idx = Number(numStr) - 1;
      return idx >= 0 && idx < revisionHistory.length ? revisionHistory[idx].date : null;
    }
    return revisionHistory[revisionHistory.length - 1].date;
  };

  return text
    .replace(/<(개정|신설|삭제)(?:\s+(\d+))?>/g, (m, kind: string, num?: string) => {
      const d = tagDate(num);
      return d ? `<${kind} ${d}>` : m;
    })
    .replace(/\[(본조신설)(?:\s+(\d+))?]/g, (m, kind: string, num?: string) => {
      const d = tagDate(num);
      return d ? `[${kind} ${d}]` : m;
    });
}

function colorizeTags(text: string): string {
  return text
    .split(RE_INLINE_TAG_SPLIT)
    .filter(Boolean)
    .map((part) => (RE_INLINE_TAG_FULL.test(part) ? `<span class="bylaws-tag">${escapeHtml(part)}</span>` : escapeHtml(part)))
    .join("");
}

// counters[0]=장, [1]=조, [2]=항, [3]=호, [4]=목. 조는 장/절이 바뀌어도 리셋 안 함.
function resetBelow(counters: number[], level: number) {
  for (let i = Math.max(level, 1) + 1; i < counters.length; i++) counters[i] = 0;
}

export function renderBylawsDocument(doc: BylawsDocument): string {
  const { revisionHistory, blocks } = doc;
  const counters = [0, 0, 0, 0, 0]; // chapter, article, clause, item, subitem
  let sectionCounter = 0;

  const html: string[] = [];
  html.push(`<div class="bylaws-title">${escapeHtml(doc.title)}</div>`);
  if (revisionHistory.length > 0) {
    html.push('<div class="bylaws-history-block">');
    revisionHistory.forEach((r) => html.push(`<div class="bylaws-history-line">${escapeHtml(`${r.date} ${r.label}`)}</div>`));
    html.push("</div>");
  }

  for (const block of blocks) {
    const text = substituteTagDates(block.text, revisionHistory);

    switch (block.type) {
      case "chapter": {
        counters[0] += 1;
        resetBelow(counters, 0);
        sectionCounter = 0;
        html.push(`<div class="bylaws-chapter">${escapeHtml(`제${counters[0]}장 ${text}`)}</div>`);
        break;
      }
      case "section": {
        sectionCounter += 1;
        html.push(`<div class="bylaws-section">${escapeHtml(`제${sectionCounter}절 ${text}`)}</div>`);
        break;
      }
      case "buchik": {
        counters[1] = 0;
        resetBelow(counters, 1);
        sectionCounter = 0;
        html.push(`<div class="bylaws-buchik">${colorizeTags(text)}</div>`);
        break;
      }
      case "article": {
        counters[1] += 1;
        resetBelow(counters, 1);
        html.push(`<div class="bylaws-article">${colorizeTags(`제${counters[1]}조(${text})`)}</div>`);
        break;
      }
      case "tagline": {
        html.push(`<div class="bylaws-tagline">${colorizeTags(text)}</div>`);
        break;
      }
      case "clause": {
        counters[2] += 1;
        resetBelow(counters, 2);
        const marker = counters[2] - 1 < CIRCLED.length ? CIRCLED[counters[2] - 1] : `(${counters[2]})`;
        html.push(
          `<div class="bylaws-clause"><span class="bylaws-marker">${escapeHtml(marker)}</span><span class="bylaws-ptext">${colorizeTags(text)}</span></div>`,
        );
        break;
      }
      case "item": {
        counters[3] += 1;
        resetBelow(counters, 3);
        html.push(
          `<div class="bylaws-item"><span class="bylaws-marker">${counters[3]}.</span><span class="bylaws-ptext">${colorizeTags(text)}</span></div>`,
        );
        break;
      }
      case "subitem": {
        counters[4] += 1;
        const marker = counters[4] - 1 < SUBITEM.length ? `${SUBITEM[counters[4] - 1]}.` : `${counters[4]})`;
        html.push(
          `<div class="bylaws-subitem"><span class="bylaws-marker">${escapeHtml(marker)}</span><span class="bylaws-ptext">${colorizeTags(text)}</span></div>`,
        );
        break;
      }
      case "body": {
        html.push(`<div class="bylaws-body"><span class="bylaws-ptext">${colorizeTags(text)}</span></div>`);
        break;
      }
    }
  }

  return html.join("\n");
}

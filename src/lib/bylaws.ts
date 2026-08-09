// 회칙은 backstage에서 "장/조/항/호/목" 타입 노드를 중첩된 트리로 편집합니다
// (worker/src/lib/backstageRender.ts의 트리 에디터 — 어디에 추가하는지가 곧 위계입니다).
// 저장은 그 트리를 문서 순서대로 평평하게 펼친 배열이고(worker에서 flatten),
// 번호(제1장, ①, 1. 등)는 여기서 그 순서를 보고 매번 새로 계산합니다 — 저장된
// 텍스트에 번호가 박혀있지 않으므로 트리에서 항목을 추가/삭제해도 뒤의 번호가
// 자동으로 밀립니다.
//
// "절"과 "강조문구"는 RUN 회칙에 실제로 쓰인 적이 없어서 뺐고, "본문"은 별도
// 타입이 아니라 장/부칙/조/항 자신에게 선택적으로 붙는 문단(body 필드)입니다.

export type BylawsBlockType = "chapter" | "article" | "buchik" | "clause" | "item" | "subitem";

// 개정/신설/본조신설 표시는 텍스트 안에 <개정 2>처럼 글자로 박아넣는 게 아니라,
// 그 조/항 자신에게 딸린 메타데이터입니다. num은 revisionHistory의 1-based
// 인덱스(어느 개정을 가리키는지)이고, 렌더링할 때 그 인덱스의 날짜를 채워 넣습니다.
export type BylawsTagKind = "개정" | "신설" | "본조신설";
export type BylawsTag = { kind: BylawsTagKind; num: number };
export type BylawsBlock = { type: BylawsBlockType; text: string; body?: string; tags?: BylawsTag[] };
// 개정이력은 날짜만 저장합니다 — 첫 항목은 항상 "제정", 그 뒤는 항상 "일부개정"이라
// 라벨 없이 순서로 계산합니다(backstage의 개정이력 입력창도 날짜만 받습니다).
export type BylawsRevisionHistory = string[];

export type BylawsDocument = {
  title: string;
  revisionHistory: BylawsRevisionHistory;
  blocks: BylawsBlock[];
};

// body(번호 없는 문단)를 선택적으로 가질 수 있는 타입들.
const BODY_ELIGIBLE = new Set<BylawsBlockType>(["chapter", "buchik", "article", "clause"]);

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
const SUBITEM = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하"];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// tags[]의 num(revisionHistory 1-based 인덱스)을 실제 날짜로 채워서 <개정 2026. 08. 07.>
// 처럼 색깔 있는 태그로 렌더링합니다. 가리키는 개정이 없어지면(인덱스 범위 밖) 조용히 빠집니다.
function renderTags(tags: BylawsTag[] | undefined, revisionHistory: BylawsRevisionHistory): string {
  if (!tags || tags.length === 0) return "";
  return tags
    .map((t) => {
      const date = revisionHistory[t.num - 1];
      if (!date) return "";
      const text = t.kind === "본조신설" ? `[${t.kind} ${date}]` : `<${t.kind} ${date}>`;
      return ` <span class="bylaws-tag">${escapeHtml(text)}</span>`;
    })
    .join("");
}

// counters[0]=장, [1]=조, [2]=항, [3]=호, [4]=목. 조는 장이 바뀌어도 리셋 안 함.
function resetBelow(counters: number[], level: number) {
  for (let i = Math.max(level, 1) + 1; i < counters.length; i++) counters[i] = 0;
}

function renderBody(block: BylawsBlock): string {
  if (!BODY_ELIGIBLE.has(block.type) || !block.body) return "";
  return `<div class="bylaws-body"><span class="bylaws-ptext">${escapeHtml(block.body)}</span></div>\n`;
}

export function renderBylawsDocument(doc: BylawsDocument): string {
  const { revisionHistory, blocks } = doc;
  const counters = [0, 0, 0, 0, 0]; // chapter, article, clause, item, subitem

  const html: string[] = [];
  html.push(`<div class="bylaws-title">${escapeHtml(doc.title)}</div>`);
  if (revisionHistory.length > 0) {
    html.push('<div class="bylaws-history-block">');
    revisionHistory.forEach((date, i) => {
      const label = i === 0 ? "제정" : "일부개정";
      html.push(`<div class="bylaws-history-line">${escapeHtml(`${date} ${label}`)}</div>`);
    });
    html.push("</div>");
  }

  for (const block of blocks) {
    const text = escapeHtml(block.text);
    const tagsHtml = renderTags(block.tags, revisionHistory);

    switch (block.type) {
      case "chapter": {
        counters[0] += 1;
        resetBelow(counters, 0);
        html.push(`<div class="bylaws-chapter">${`제${counters[0]}장 ${text}`}${tagsHtml}</div>`);
        break;
      }
      case "buchik": {
        counters[1] = 0;
        resetBelow(counters, 1);
        html.push(`<div class="bylaws-buchik">${text}${tagsHtml}</div>`);
        break;
      }
      case "article": {
        counters[1] += 1;
        resetBelow(counters, 1);
        html.push(`<div class="bylaws-article">${`제${counters[1]}조(${text})`}${tagsHtml}</div>`);
        break;
      }
      case "clause": {
        counters[2] += 1;
        resetBelow(counters, 2);
        const marker = counters[2] - 1 < CIRCLED.length ? CIRCLED[counters[2] - 1] : `(${counters[2]})`;
        html.push(
          `<div class="bylaws-clause"><span class="bylaws-marker">${escapeHtml(marker)}</span><span class="bylaws-ptext">${text}${tagsHtml}</span></div>`,
        );
        break;
      }
      case "item": {
        counters[3] += 1;
        resetBelow(counters, 3);
        html.push(
          `<div class="bylaws-item"><span class="bylaws-marker">${counters[3]}.</span><span class="bylaws-ptext">${text}${tagsHtml}</span></div>`,
        );
        break;
      }
      case "subitem": {
        counters[4] += 1;
        const marker = counters[4] - 1 < SUBITEM.length ? `${SUBITEM[counters[4] - 1]}.` : `${counters[4]})`;
        html.push(
          `<div class="bylaws-subitem"><span class="bylaws-marker">${escapeHtml(marker)}</span><span class="bylaws-ptext">${text}</span></div>`,
        );
        break;
      }
    }

    const bodyHtml = renderBody(block);
    if (bodyHtml) html.push(bodyHtml.trimEnd());
  }

  return html.join("\n");
}

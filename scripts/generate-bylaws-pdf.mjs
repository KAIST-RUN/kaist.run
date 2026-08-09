// kaist.run/bylaws의 "PDF 다운로드" 버튼이 가리키는 정적 파일을 만듭니다.
// 이 사이트는 완전 정적 export라 PDF도 요청 시점이 아니라 `next build` 이전
// (package.json의 prebuild)에 미리 구워서 public/bylaws/{slug}.pdf로 둡니다 —
// next build가 public/를 그대로 out/에 복사하므로 그 결과물이 그대로 배포됩니다.
//
// 번호 매기기(제N장/제N조/①②③/1.2.3/가.나.다)와 <개정 N>/[본조신설 N] 치환 로직은
// src/lib/bylaws.ts의 renderBylawsDocument와 반드시 같은 규칙을 따라야 해서, 여기서도
// 그대로 다시 구현합니다(순수 .mjs 스크립트라 TS 파일을 직접 import할 수 없어서요).

import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFRawStream, PDFName, decodePDFRawStream, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const API_BASE = process.env.CONTENT_API_BASE_URL ?? "https://kaist.run/api/content";
const OUT_DIR = path.join(process.cwd(), "public", "bylaws");
// alternative/*.ttf 사용 — static/*.otf(CFF)는 fontkit의 서브셋 임베더가
// "Not a CFF Font" 에러를 내서 실패합니다. alternative는 순수 glyf 기반 TTF라 안전합니다.
const FONT_DIR = path.join(process.cwd(), "node_modules", "pretendard", "dist", "public", "static", "alternative");

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN_L = 56;
const MARGIN_R = 56;
const MARGIN_T = 64;
const MARGIN_B = 64;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

const BLACK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.45, 0.45);
const TAG_COLOR = rgb(0x0e / 255, 0x74 / 255, 0x90 / 255);

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
const SUBITEM = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하"];

// src/lib/bylaws.ts와 동일합니다 — "절"/"강조문구"는 실제로 쓰인 적이 없어서 뺐고,
// "본문"은 별도 블록 타입이 아니라 장/부칙/조/항 자신에게 선택적으로 붙는 문단(body 필드)입니다.
const BODY_ELIGIBLE = new Set(["chapter", "buchik", "article", "clause"]);

const RE_INLINE_TAG_SPLIT = /(<[^>]+>|\[[^\]]+])/;
const RE_INLINE_TAG_FULL = /^(<[^>]+>|\[[^\]]+])$/;

// src/lib/bylaws.ts의 substituteTagDates와 동일합니다.
function substituteTagDates(text, revisionHistory) {
  const tagDate = (numStr) => {
    if (revisionHistory.length === 0) return null;
    if (numStr) {
      const idx = Number(numStr) - 1;
      return idx >= 0 && idx < revisionHistory.length ? revisionHistory[idx].date : null;
    }
    return revisionHistory[revisionHistory.length - 1].date;
  };

  return text
    .replace(/<(개정|신설|삭제)(?:\s+(\d+))?>/g, (m, kind, num) => {
      const d = tagDate(num);
      return d ? `<${kind} ${d}>` : m;
    })
    .replace(/\[(본조신설)(?:\s+(\d+))?]/g, (m, kind, num) => {
      const d = tagDate(num);
      return d ? `[${kind} ${d}]` : m;
    });
}

// <개정 ...>/[본조신설 ...] 부분만 색을 다르게 칠하기 위해 구간을 나눕니다.
function splitColorRuns(text) {
  return text
    .split(RE_INLINE_TAG_SPLIT)
    .filter(Boolean)
    .map((part) => ({ text: part, tag: RE_INLINE_TAG_FULL.test(part) }));
}

function tokenize(runs) {
  const words = [];
  for (const run of runs) {
    for (const w of run.text.split(/\s+/)) {
      if (w) words.push({ text: w, tag: run.tag });
    }
  }
  return words;
}

function wrapWords(words, font, size, spaceW, maxWidth) {
  const lines = [];
  let cur = [];
  let curW = 0;
  for (const w of words) {
    const wWidth = font.widthOfTextAtSize(w.text, size);
    const addW = cur.length === 0 ? wWidth : curW + spaceW + wWidth;
    if (addW > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = [w];
      curW = wWidth;
    } else {
      cur.push(w);
      curW = addW;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function lineWidthOf(line, font, size, spaceW) {
  return line.reduce((sum, w, i) => sum + font.widthOfTextAtSize(w.text, size) + (i > 0 ? spaceW : 0), 0);
}

class PdfWriter {
  constructor(doc) {
    this.doc = doc;
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_T;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN_T;
  }

  ensureSpace(lineHeight) {
    if (this.y - lineHeight < MARGIN_B) this.newPage();
  }

  gap(pt) {
    this.y -= pt;
  }

  // align: "left" (마커 + 매달린 들여쓰기) | "center" | "right"
  paragraph({ align = "left", runs, font, size, color = BLACK, indent = 0, marker, markerFont, markerSize, markerColor, lineHeight, spacingAfter = 0 }) {
    const lh = lineHeight ?? size * 1.7;
    const words = tokenize(runs);
    const mSize = markerSize ?? size;
    const mFont = markerFont ?? font;
    const markerW = marker ? mFont.widthOfTextAtSize(marker, mSize) + 6 : 0;
    const textIndent = indent + markerW;
    const maxWidth = align === "left" ? CONTENT_W - textIndent : CONTENT_W;
    const spaceW = font.widthOfTextAtSize(" ", size);
    const lines = wrapWords(words, font, size, spaceW, maxWidth);
    if (lines.length === 0) lines.push([]);

    lines.forEach((line, i) => {
      this.ensureSpace(lh);
      const lineWidth = lineWidthOf(line, font, size, spaceW);
      let x;
      if (align === "center") x = MARGIN_L + (CONTENT_W - lineWidth) / 2;
      else if (align === "right") x = MARGIN_L + CONTENT_W - lineWidth;
      else x = MARGIN_L + textIndent;

      if (i === 0 && marker) {
        this.page.drawText(marker, { x: MARGIN_L + indent, y: this.y - mSize, size: mSize, font: mFont, color: markerColor ?? color });
      }
      let cx = x;
      for (const tok of line) {
        const c = tok.tag ? TAG_COLOR : color;
        this.page.drawText(tok.text, { x: cx, y: this.y - size, size, font, color: c });
        cx += font.widthOfTextAtSize(tok.text, size) + spaceW;
      }
      this.y -= lh;
    });
    this.y -= spacingAfter;
  }
}

// counters[0]=장, [1]=조, [2]=항, [3]=호, [4]=목 — 조는 장/절이 바뀌어도 리셋 안 함.
function resetBelow(counters, level) {
  for (let i = Math.max(level, 1) + 1; i < counters.length; i++) counters[i] = 0;
}

async function renderDocumentToPdf(bylawsDoc, fonts) {
  const { regular, bold } = fonts;
  const { title, revisionHistory, blocks } = bylawsDoc;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(title);
  pdfDoc.setLanguage("ko");
  const regularFont = await pdfDoc.embedFont(regular, { subset: true });
  const boldFont = await pdfDoc.embedFont(bold, { subset: true });

  const w = new PdfWriter(pdfDoc);

  w.paragraph({ align: "center", runs: [{ text: title, tag: false }], font: boldFont, size: 19, color: BLACK, spacingAfter: 10 });

  if (revisionHistory.length > 0) {
    for (const r of revisionHistory) {
      w.paragraph({ align: "right", runs: [{ text: `${r.date} ${r.label}`, tag: false }], font: regularFont, size: 9, color: GRAY, lineHeight: 13 });
    }
    w.gap(18);
  } else {
    w.gap(10);
  }

  const counters = [0, 0, 0, 0, 0];

  for (const block of blocks) {
    const text = substituteTagDates(block.text, revisionHistory);

    switch (block.type) {
      case "chapter": {
        counters[0] += 1;
        resetBelow(counters, 0);
        w.gap(10);
        w.paragraph({ align: "center", runs: [{ text: `제${counters[0]}장 ${text}`, tag: false }], font: boldFont, size: 14.5, color: BLACK, spacingAfter: 4 });
        break;
      }
      case "buchik": {
        counters[1] = 0;
        resetBelow(counters, 1);
        w.gap(10);
        w.paragraph({ align: "center", runs: splitColorRuns(text), font: boldFont, size: 14.5, color: BLACK, spacingAfter: 4 });
        break;
      }
      case "article": {
        counters[1] += 1;
        resetBelow(counters, 1);
        w.paragraph({ align: "left", runs: splitColorRuns(`제${counters[1]}조(${text})`), font: boldFont, size: 11.5, color: BLACK, spacingAfter: 1 });
        break;
      }
      case "clause": {
        counters[2] += 1;
        resetBelow(counters, 2);
        const marker = counters[2] - 1 < CIRCLED.length ? CIRCLED[counters[2] - 1] : `(${counters[2]})`;
        w.paragraph({ align: "left", runs: splitColorRuns(text), font: regularFont, size: 11, color: BLACK, indent: 14, marker, markerFont: regularFont, markerSize: 11 });
        break;
      }
      case "item": {
        counters[3] += 1;
        resetBelow(counters, 3);
        w.paragraph({ align: "left", runs: splitColorRuns(text), font: regularFont, size: 11, color: BLACK, indent: 28, marker: `${counters[3]}.`, markerFont: regularFont, markerSize: 11 });
        break;
      }
      case "subitem": {
        counters[4] += 1;
        const marker = counters[4] - 1 < SUBITEM.length ? `${SUBITEM[counters[4] - 1]}.` : `${counters[4]})`;
        w.paragraph({ align: "left", runs: splitColorRuns(text), font: regularFont, size: 11, color: BLACK, indent: 42, marker, markerFont: regularFont, markerSize: 11 });
        break;
      }
    }

    // 본문(body)은 별도 블록이 아니라 위 타입들에 선택적으로 붙는 문단입니다 — src/lib/bylaws.ts의
    // renderBody()와 동일한 조건(BODY_ELIGIBLE + 값이 있을 때)으로 그 블록 바로 아래에 렌더링합니다.
    // (예전엔 "body" 타입 블록이 별도로 존재했지만 지금은 blocks[]에 그런 항목이 없어서, 이 처리가
    // 없으면 저장된 본문 문단이 PDF에서 통째로 누락됩니다.)
    if (BODY_ELIGIBLE.has(block.type) && block.body) {
      const bodyText = substituteTagDates(block.body, revisionHistory);
      w.paragraph({ align: "left", runs: splitColorRuns(bodyText), font: regularFont, size: 11, color: BLACK, indent: 14 });
    }
  }

  return pdfDoc.save();
}

// pdf-lib(1.17.1)이 서브셋 폰트마다 만드는 ToUnicode CMap은 쓰인 글자 전부를 하나의
// beginbfchar/endbfchar 블록에 다 집어넣는데, CMap/PostScript 스펙은 블록당 최대 100개
// 항목만 허용합니다(Adobe #5411). 회칙처럼 글자 수가 100자를 넘는 문서에서는 이 스펙 위반
// 때문에 일부 PDF 리더가 그 폰트의 유니코드 매핑 전체를 무시/거부해서 텍스트 추출·검색·
// (뷰어에 따라) 표시까지 깨지는 결과로 이어질 수 있습니다 — 저장된 바이트를 다시 읽어
// 각 ToUnicode 스트림을 100개 이하 블록으로 쪼개 다시 씁니다.
async function fixToUnicodeCmaps(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;

    let decoded;
    try {
      decoded = decodePDFRawStream({ dict: obj.dict, contents: obj.contents }).decode();
    } catch {
      continue;
    }
    const text = Buffer.from(decoded).toString("latin1");
    if (!text.includes("/CMapName /Adobe-Identity-UCS")) continue; // ToUnicode CMap이 아님

    const entries = [...text.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g)].map((m) => [m[1], m[2]]);
    if (entries.length <= 100) continue; // 이미 스펙 범위 안 — 손댈 필요 없음

    const blocks = [];
    for (let i = 0; i < entries.length; i += 100) {
      const chunk = entries.slice(i, i + 100);
      blocks.push(`${chunk.length} beginbfchar\n${chunk.map(([a, b]) => `<${a}> <${b}>`).join("\n")}\nendbfchar`);
    }
    const rebuilt =
      "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n" +
      "/CIDSystemInfo <<\n  /Registry (Adobe)\n  /Ordering (UCS)\n  /Supplement 0\n>> def\n" +
      "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000><ffff>\nendcodespacerange\n" +
      blocks.join("\n") +
      "\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";

    obj.dict.delete(PDFName.of("Filter"));
    obj.dict.delete(PDFName.of("DecodeParms"));
    obj.contents = new TextEncoder().encode(rebuilt);
  }
  return doc.save();
}

async function main() {
  const versionsRes = await fetch(`${API_BASE}/bylaws-versions`);
  if (!versionsRes.ok) {
    throw new Error(`Failed to fetch bylaws-versions: ${versionsRes.status} ${await versionsRes.text()}`);
  }
  const versions = await versionsRes.json();
  if (versions.length === 0) {
    console.log("[generate-bylaws-pdf] no bylaws versions yet, skipping");
    return;
  }

  const regular = fs.readFileSync(path.join(FONT_DIR, "Pretendard-Regular.ttf"));
  const bold = fs.readFileSync(path.join(FONT_DIR, "Pretendard-Bold.ttf"));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const v of versions) {
    const res = await fetch(`${API_BASE}/bylaws/${v.slug}`);
    if (res.status === 404) {
      console.warn(`[generate-bylaws-pdf] ${v.slug}: not found, skipping`);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch bylaws/${v.slug}: ${res.status} ${await res.text()}`);
    }
    const doc = await res.json();
    const rawBytes = await renderDocumentToPdf(doc, { regular, bold });
    const bytes = await fixToUnicodeCmaps(rawBytes);
    fs.writeFileSync(path.join(OUT_DIR, `${v.slug}.pdf`), bytes);
    console.log(`[generate-bylaws-pdf] wrote public/bylaws/${v.slug}.pdf`);
  }
}

await main();

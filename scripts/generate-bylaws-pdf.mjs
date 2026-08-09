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
import { PDFDocument, rgb } from "pdf-lib";
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
  let sectionCounter = 0;

  for (const block of blocks) {
    const text = substituteTagDates(block.text, revisionHistory);

    switch (block.type) {
      case "chapter": {
        counters[0] += 1;
        resetBelow(counters, 0);
        sectionCounter = 0;
        w.gap(10);
        w.paragraph({ align: "center", runs: [{ text: `제${counters[0]}장 ${text}`, tag: false }], font: boldFont, size: 14.5, color: BLACK, spacingAfter: 4 });
        break;
      }
      case "section": {
        sectionCounter += 1;
        w.paragraph({ align: "center", runs: [{ text: `제${sectionCounter}절 ${text}`, tag: false }], font: boldFont, size: 12, color: GRAY, spacingAfter: 2 });
        break;
      }
      case "buchik": {
        counters[1] = 0;
        resetBelow(counters, 1);
        sectionCounter = 0;
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
      case "tagline": {
        w.paragraph({ align: "right", runs: splitColorRuns(text), font: regularFont, size: 10, color: TAG_COLOR, indent: 14, spacingAfter: 3 });
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
      case "body": {
        w.paragraph({ align: "left", runs: splitColorRuns(text), font: regularFont, size: 11, color: BLACK, indent: 14 });
        break;
      }
    }
  }

  return pdfDoc.save();
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
    const bytes = await renderDocumentToPdf(doc, { regular, bold });
    fs.writeFileSync(path.join(OUT_DIR, `${v.slug}.pdf`), bytes);
    console.log(`[generate-bylaws-pdf] wrote public/bylaws/${v.slug}.pdf`);
  }
}

await main();

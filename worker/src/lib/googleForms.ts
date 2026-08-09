// 구글 폼의 공개(로그인 불필요) viewform 페이지에서 문항 구조를 가져옵니다.
//
// 구글은 폼 구조를 읽는 공식 공개 API를 제공하지 않습니다(Forms API는 폼 소유자
// 본인의 OAuth 인증이 필요). 대신 공개 viewform 페이지 HTML에는 `FB_PUBLIC_LOAD_DATA_`
// 라는 비공식 JS 변수에 문항 전체 구조(순서/유형/entry ID/선택지 값)가 그대로 심겨
// 있습니다 — 여러 오픈소스 "google form scraper"들이 쓰는 잘 알려진(하지만 비공식,
// 구글이 언제든 바꿀 수 있는) 방식입니다.
//
// 아래 인덱스 매핑은 2026-08-09에 실제 운영 중인 프로덕션 지원 폼(RUN 동아리 가입
// 신청 폼, 단답형/장문형/단일선택 문항 9개)을 대상으로 fetch해서 직접 확인한
// 값입니다. 드롭다운/체크박스(유형 코드 3/4)는 그 폼에 해당 유형이 없어서 실제
// 검증을 못 했고, 커뮤니티에 통용되는 매핑을 썼습니다 — 이 두 유형을 실제로
// 렌더링해야 하는 시점(backstage에서 그런 문항이 있는 폼을 연결해볼 때)에 한 번
// 더 실제 구조로 확인해 보는 걸 권장합니다.

export class GoogleFormAccessError extends Error {}
export class GoogleFormParseError extends Error {}

export type QuestionType = "short_answer" | "paragraph" | "radio" | "checkbox" | "dropdown";

export type FetchedChoice = {
  value: string;
  sourceLabel: string;
};

export type FetchedQuestion = {
  entryId: string;
  position: number;
  type: QuestionType;
  required: boolean;
  sourceTitle: string;
  choices: FetchedChoice[];
};

export type FetchedFormStructure = {
  title: string;
  questions: FetchedQuestion[];
  skipped: number; // 지원하지 않는 유형이라 건너뛴 문항 수
};

// 유형 코드 0/1/2는 실제 폼으로 확인됨. 3/4는 미확인(커뮤니티 통용값) — 위 주석 참고.
const TYPE_CODE_MAP: Record<number, QuestionType | undefined> = {
  0: "short_answer",
  1: "paragraph",
  2: "radio",
  3: "dropdown",
  4: "checkbox",
};

// viewform/formResponse URL, 또는 순수 published ID를 받아 ID만 뽑아냅니다.
// "/d/<id>/edit"(에디터 링크, 폼 소유자 로그인 필요 — 다른 ID 체계)가 들어오면
// 명확한 에러를 던집니다.
export function parseFormIdOrUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new GoogleFormAccessError("구글 폼 링크 또는 ID를 입력해 주세요.");

  const editMatch = trimmed.match(/forms\.google\.com|docs\.google\.com\/forms\/d\/([^/e][^/]*)\/edit/);
  if (editMatch) {
    throw new GoogleFormAccessError(
      "이건 폼 수정(편집) 화면 링크로 보입니다. 응답자용 공유 링크(.../forms/d/e/…/viewform)를 입력해 주세요.",
    );
  }

  const publishedMatch = trimmed.match(/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (publishedMatch) return publishedMatch[1];

  // URL이 아니라 순수 ID만 붙여넣은 경우 — published ID라고 가정합니다(익명으로
  // 접근 가능한 건 이 ID뿐이라).
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;

  throw new GoogleFormAccessError("구글 폼 링크 형식을 알아볼 수 없습니다.");
}

function extractPublicLoadData(html: string): unknown {
  const match = html.match(/var FB_PUBLIC_LOAD_DATA_ = (\[[\s\S]*?\]);\s*<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export async function fetchGoogleFormStructure(formId: string): Promise<FetchedFormStructure> {
  const url = `https://docs.google.com/forms/d/e/${formId}/viewform`;
  const res = await fetch(url, { redirect: "manual" });

  // 로그인이 필요한 폼(Workspace 전용 등)은 accounts.google.com으로 리다이렉트됩니다.
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") ?? "";
    if (location.includes("accounts.google.com")) {
      throw new GoogleFormAccessError("로그인이 필요한 폼입니다. 응답자 전체 공개로 설정된 폼만 연결할 수 있습니다.");
    }
  }

  if (!res.ok) {
    throw new GoogleFormAccessError(`폼을 불러오지 못했습니다 (${res.status}). 링크가 맞는지 확인해 주세요.`);
  }

  const html = await res.text();
  const root = extractPublicLoadData(html);

  // 응답에 문항 데이터 자체가 없는 경우도 로그인 필요/비공개 폼일 가능성이 높습니다
  // (또는 구글이 이 형식을 바꿨을 가능성 — 둘을 구분할 방법이 없어 같은 메시지로 안내).
  if (
    root === null ||
    !Array.isArray(root) ||
    !Array.isArray(root[1]) ||
    !Array.isArray(root[1][1])
  ) {
    throw new GoogleFormAccessError(
      "폼 구조를 읽을 수 없습니다. 로그인이 필요한 폼이거나, 응답자 전체 공개로 설정되지 않았을 수 있습니다.",
    );
  }

  const items: unknown[] = root[1][1];
  const title = typeof root[1][8] === "string" ? root[1][8] : "";

  const questions: FetchedQuestion[] = [];
  let skipped = 0;
  let position = 0;

  for (const item of items) {
    if (!Array.isArray(item) || typeof item[3] !== "number") {
      skipped++;
      continue;
    }

    const type = TYPE_CODE_MAP[item[3]];
    const entries = item[4];
    if (!type || !Array.isArray(entries) || entries.length === 0) {
      skipped++;
      continue;
    }

    const entry = entries[0];
    if (!Array.isArray(entry) || (typeof entry[0] !== "number" && typeof entry[0] !== "string")) {
      skipped++;
      continue;
    }

    const entryId = String(entry[0]);
    const required = Boolean(entry[2]);
    const sourceTitle = typeof item[1] === "string" ? item[1] : "";

    let choices: FetchedChoice[] = [];
    if (type === "radio" || type === "checkbox" || type === "dropdown") {
      const rawChoices = entry[1];
      if (!Array.isArray(rawChoices)) {
        skipped++;
        continue;
      }
      choices = rawChoices
        .filter((c): c is unknown[] => Array.isArray(c) && typeof c[0] === "string")
        .map((c) => ({ value: c[0] as string, sourceLabel: c[0] as string }));
      if (choices.length === 0) {
        skipped++;
        continue;
      }
    }

    position++;
    questions.push({ entryId, position, type, required, sourceTitle, choices });
  }

  if (questions.length === 0) {
    throw new GoogleFormParseError("이 폼에서 지원하는 유형의 문항을 하나도 찾지 못했습니다.");
  }

  return { title, questions, skipped };
}

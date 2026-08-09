import type { Env } from "../types";
import { fetchGoogleFormStructure, parseFormIdOrUrl, type QuestionType } from "./googleForms";

export class ApplyFormValidationError extends Error {}

// 정규식 검증을 의미 있게 걸 수 있는 유형만 — 라디오/체크박스/드롭다운은 값이
// 어차피 정해진 선택지 중 하나라 자유 텍스트 검증 개념이 없습니다.
const VALIDATABLE_TYPES: QuestionType[] = ["short_answer", "paragraph"];

export type ApplyFormChoice = {
  value: string; // 구글 폼에 실제 제출되는 값 — 재연결 때만 바뀝니다.
  sourceLabel: string; // 구글 폼 원문 선택지 텍스트(힌트용)
  labelKo: string;
  labelEn: string;
};

export type ApplyFormQuestion = {
  entryId: string;
  position: number;
  type: QuestionType;
  required: boolean;
  // 빈 문자열이면 검증 없음. 아니면 이 정규식(문자열 그대로, i 플래그로 테스트)에
  // 안 맞는 값을 입력하면 제출을 막습니다. short_answer/paragraph 문항에만 의미가 있음.
  validationPattern: string;
  sourceTitle: string;
  labelKo: string;
  labelEn: string;
  choices: ApplyFormChoice[];
};

export type ApplyFormConfig = {
  formId: string;
  questions: ApplyFormQuestion[];
};

type RawQuestionRow = {
  entry_id: string;
  position: number;
  type: QuestionType;
  required: number;
  validation_pattern: string;
  source_title: string;
  label_ko: string;
  label_en: string;
  choices: string; // JSON
};

function fromRawQuestion(row: RawQuestionRow): ApplyFormQuestion {
  return {
    entryId: row.entry_id,
    position: row.position,
    type: row.type,
    required: row.required !== 0,
    validationPattern: row.validation_pattern,
    sourceTitle: row.source_title,
    labelKo: row.label_ko,
    labelEn: row.label_en,
    choices: JSON.parse(row.choices) as ApplyFormChoice[],
  };
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// apply_form이 아직 한 번도 연결 안 된 상태(id=1 행이 없음)면 null을 돌려줍니다 —
// 프런트(/apply)는 이걸 "폼 준비 중" 문구로 처리합니다.
export async function getApplyFormConfig(env: Env): Promise<ApplyFormConfig | null> {
  const formRow = await env.CONTENT_DB.prepare("SELECT form_id FROM apply_form WHERE id = 1").first<{
    form_id: string;
  }>();
  if (!formRow) return null;

  const { results } = await env.CONTENT_DB.prepare("SELECT * FROM apply_form_question ORDER BY position ASC").all<RawQuestionRow>();

  return { formId: formRow.form_id, questions: results.map(fromRawQuestion) };
}

export type ConnectResult = {
  total: number; // 이번에 가져온 전체 문항 수
  added: number; // 새로 생긴 문항 수(라벨이 비어있음 — 저장 전엔 배포 안 됨)
  removed: number; // 더 이상 폼에 없어서 지워진 문항 수
  choicesAdded: number;
  choicesRemoved: number;
  skipped: number; // 지원하지 않는 유형이라 건너뛴 문항 수
};

// 구글 폼을 다시 읽어와서 D1에 병합합니다. 기존에 있던 문항(entry_id 동일)은 이미
// 입력해 둔 한국어/영어 라벨과 검증 정규식을 그대로 보존하고, source_title/선택지
// 값 등 구조만 최신으로 갱신합니다. 문항 유형이 검증 가능한 유형(단답형/장문형)에서
// 벗어나면 정규식은 리셋합니다 — 라디오/체크박스/드롭다운엔 의미가 없으므로. 선택지
// 배열은 유형이 바뀌면 통째로 리셋합니다 — 예전 선택지 라벨은 새 값 집합과
// 무관해지므로. 더 이상 폼에 없는 문항은 행 자체를 지웁니다.
//
// 라벨이 비어 있는 새 문항이 생겨도 이 함수는 배포를 트리거하지 않습니다(호출부인
// backstage.ts의 POST /apply/connect가 triggerRebuild를 안 부름) — 관리자가 라벨을
// 채우고 저장해야 실제 지원 폼에 반영됩니다.
export async function connectApplyForm(env: Env, formIdOrUrl: string): Promise<ConnectResult> {
  const formId = parseFormIdOrUrl(formIdOrUrl);
  const fetched = await fetchGoogleFormStructure(formId);

  const { results: existingRows } = await env.CONTENT_DB.prepare("SELECT * FROM apply_form_question").all<RawQuestionRow>();
  const existing = new Map(existingRows.map((r) => [r.entry_id, fromRawQuestion(r)]));
  const fetchedIds = new Set(fetched.questions.map((q) => q.entryId));

  let added = 0;
  let choicesAdded = 0;
  let choicesRemoved = 0;

  const statements = fetched.questions.map((q) => {
    const prev = existing.get(q.entryId);
    const typeChanged = prev !== undefined && prev.type !== q.type;
    if (!prev) added++;

    let choices: ApplyFormChoice[] = [];
    if (q.type === "radio" || q.type === "checkbox" || q.type === "dropdown") {
      const prevChoices = !typeChanged && prev ? new Map(prev.choices.map((c) => [c.value, c])) : new Map<string, ApplyFormChoice>();
      choices = q.choices.map((c) => {
        const prevChoice = prevChoices.get(c.value);
        if (!prevChoice) choicesAdded++;
        return { value: c.value, sourceLabel: c.sourceLabel, labelKo: prevChoice?.labelKo ?? "", labelEn: prevChoice?.labelEn ?? "" };
      });
      if (prev) {
        for (const pc of prev.choices) {
          if (!q.choices.some((c) => c.value === pc.value)) choicesRemoved++;
        }
      }
    }

    const validationPattern = VALIDATABLE_TYPES.includes(q.type) ? (prev?.validationPattern ?? "") : "";

    return env.CONTENT_DB.prepare(
      `INSERT INTO apply_form_question (entry_id, position, type, required, validation_pattern, source_title, label_ko, label_en, choices, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
       ON CONFLICT (entry_id) DO UPDATE SET
         position = excluded.position, type = excluded.type, required = excluded.required,
         validation_pattern = excluded.validation_pattern, source_title = excluded.source_title,
         choices = excluded.choices, updated_at = datetime('now')`,
    ).bind(
      q.entryId,
      q.position,
      q.type,
      q.required ? 1 : 0,
      validationPattern,
      q.sourceTitle,
      prev?.labelKo ?? "",
      prev?.labelEn ?? "",
      JSON.stringify(choices),
    );
  });

  let removed = 0;
  for (const row of existingRows) {
    if (!fetchedIds.has(row.entry_id)) {
      removed++;
      statements.push(env.CONTENT_DB.prepare("DELETE FROM apply_form_question WHERE entry_id = ?1").bind(row.entry_id));
    }
  }

  statements.push(
    env.CONTENT_DB.prepare(
      `INSERT INTO apply_form (id, form_id, updated_at) VALUES (1, ?1, datetime('now'))
       ON CONFLICT (id) DO UPDATE SET form_id = excluded.form_id, updated_at = datetime('now')`,
    ).bind(formId),
  );

  await env.CONTENT_DB.batch(statements);

  return { total: fetched.questions.length, added, removed, choicesAdded, choicesRemoved, skipped: fetched.skipped };
}

export type SaveQuestionInput = {
  entryId: string;
  labelKo: string;
  labelEn: string;
  validationPattern: string;
  choices: { value: string; labelKo: string; labelEn: string }[];
};

// 라벨/검증 정규식만 갱신합니다 — entry_id/type/choices의 value(구조)는 절대 안
// 건드립니다(그건 connectApplyForm만 하는 일).
export async function saveApplyFormLabels(env: Env, questions: SaveQuestionInput[]): Promise<void> {
  for (const q of questions) {
    if (!q.labelKo.trim() || !q.labelEn.trim()) {
      throw new ApplyFormValidationError("모든 문항의 한국어/영어 문구를 입력해 주세요.");
    }
    if (q.validationPattern && !isValidRegex(q.validationPattern)) {
      throw new ApplyFormValidationError(`올바른 정규식이 아닙니다: ${q.validationPattern}`);
    }
    for (const c of q.choices) {
      if (!c.labelKo.trim() || !c.labelEn.trim()) {
        throw new ApplyFormValidationError("모든 선택지의 한국어/영어 문구를 입력해 주세요.");
      }
    }
  }

  const existing = await getApplyFormConfig(env);
  const existingByEntry = new Map((existing?.questions ?? []).map((q) => [q.entryId, q]));

  const statements = questions.map((q) => {
    const prev = existingByEntry.get(q.entryId);
    const mergedChoices = (prev?.choices ?? []).map((c) => {
      const input = q.choices.find((ic) => ic.value === c.value);
      return { ...c, labelKo: input?.labelKo ?? c.labelKo, labelEn: input?.labelEn ?? c.labelEn };
    });

    return env.CONTENT_DB.prepare(
      `UPDATE apply_form_question
       SET label_ko = ?2, label_en = ?3, validation_pattern = ?4, choices = ?5, updated_at = datetime('now')
       WHERE entry_id = ?1`,
    ).bind(q.entryId, q.labelKo, q.labelEn, q.validationPattern, JSON.stringify(mergedChoices));
  });

  await env.CONTENT_DB.batch(statements);
}

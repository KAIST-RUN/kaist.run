-- 관리자가 받은 메일 하나하나에 남기는 메모(예: "회신함", "총무한테 전달"). 이메일
-- 자체(원본 .eml)는 R2에, 목록 색인은 EMAIL_INDEX(KV)에 있지만, 메모는 나중에 고치는
-- 일이 잦은 짧은 텍스트라 D1에 둡니다 — KV는 값 전체를 통째로 다시 써야 해서 이런
-- "가끔 있는, 메일 하나당 한 건" 갱신엔 안 맞고, D1은 email_id로 바로 upsert가 됩니다.
CREATE TABLE IF NOT EXISTS email_notes (
  email_id TEXT PRIMARY KEY, -- emailStore.ts의 랜덤 hex id (R2 키의 일부와 동일)
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

import { SignJWT, importPKCS8 } from "jose";
import type { Env } from "../types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

// 기존 Discord 봇과 같은 서비스 계정으로 Google API 접근 토큰을 발급받습니다
// (JWT Bearer 방식). 시트는 이미 그 봇에게 공유되어 있으므로 추가 공유가
// 필요 없습니다.
async function getAccessToken(env: Env): Promise<string> {
  // 개인키가 .env류 파일에 한 줄로 저장될 때 흔히 "\n"이 실제 줄바꿈이 아니라
  // 백슬래시+n 두 글자로 들어오므로, PEM으로 파싱하기 전에 되돌려줍니다.
  const privateKeyPem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const privateKey = await importPKCS8(privateKeyPem, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const assertion = await new SignJWT({ scope: SHEETS_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ============================================================================
// "역대 회원 명단" 시트의 실제 헤더(1행) ↔ 우리 필드 매핑입니다.
//   이름 | 학번 | 전화번호 | 이메일 | Discord | solved.ac | Codeforces | AtCoder
// 시트에는 상태(신청중/재학/졸업)나 가입연도 열이 없어서, 다음처럼 처리합니다:
//   - status: 시트에 올라와 있으면 무조건 "member"로 취급 (신청/졸업 구분 없음)
//   - joinedYear: 항상 null (표시하지 않음)
//   - role: 메인 시트가 아니라 별도의 "관리자" 서브시트(아래 참고)로 판단합니다.
// ============================================================================
const HEADER_MAP = {
  discordId: "Discord",
  name: "이름",
  studentId: "학번",
  phone: "전화번호",
  email: "이메일",
  solvedAc: "solved.ac",
  codeforces: "Codeforces",
  atcoder: "AtCoder",
} as const;

// 관리자 명단은 같은 스프레드시트의 "관리자" 탭에서 관리합니다.
// 그 탭은 "Discord" 한 열만 있고, 여기 적힌 Discord ID가 곧 관리자입니다.
const ADMIN_SHEET_TAB = "관리자";
const ADMIN_HEADER_DISCORD = "Discord";

export type MemberRecord = {
  discordId: string;
  name: string | null;
  email: string | null;
  studentId: string | null;
  joinedYear: number | null;
  status: "applicant" | "member" | "alumni";
  role: "member" | "admin";

  // 지금은 /api/me 응답이나 마이페이지에 노출하지 않지만, 나중에 필요할 때
  // 바로 쓸 수 있도록 KV에는 같이 저장해둡니다.
  phone: string | null;
  solvedAc: string | null;
  codeforces: string | null;
  atcoder: string | null;
};

function cell(row: string[], headers: string[], headerName: string): string | null {
  const idx = headers.indexOf(headerName);
  if (idx === -1) return null;
  const value = row[idx]?.trim();
  return value ? value : null;
}

// GOOGLE_SHEET_RANGE가 기본값("Sheet1")에서 안 바뀌었으면, 실제 탭 이름을 몰라도
// 되도록 스프레드시트 메타데이터에서 첫 번째 탭 이름을 직접 찾아옵니다.
// 특정 탭/범위를 지정하고 싶으면 GOOGLE_SHEET_RANGE를 그 값으로 바꾸면 됩니다.
async function resolveRange(env: Env, accessToken: string): Promise<string> {
  if (env.GOOGLE_SHEET_RANGE && env.GOOGLE_SHEET_RANGE !== "Sheet1") {
    return env.GOOGLE_SHEET_RANGE;
  }

  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.ROSTER_ALL_TIME_SHEET_ID}?fields=sheets.properties.title`;
  const res = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Sheet metadata fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { sheets?: { properties: { title: string } }[] };
  const firstTitle = data.sheets?.[0]?.properties?.title;
  if (!firstTitle) {
    throw new Error("스프레드시트에서 탭을 하나도 찾지 못했습니다.");
  }
  return firstTitle;
}

// "관리자" 탭에서 Discord ID 목록을 읽어옵니다. 그 탭이 아직 없거나 일시적으로
// 읽기에 실패해도, 전체 회원 동기화 자체는 막고 싶지 않아서 빈 목록으로 넘어가고
// 에러만 로그로 남깁니다 (그 회차는 새로 관리자가 반영 안 될 뿐, 로그인 자체는
// 계속 됩니다).
async function fetchAdminDiscordIds(env: Env, accessToken: string): Promise<Set<string>> {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.ROSTER_ALL_TIME_SHEET_ID}/values/${encodeURIComponent(ADMIN_SHEET_TAB)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!res.ok) {
      console.error(`Admin sheet fetch failed: ${res.status} ${await res.text()}`);
      return new Set();
    }

    const data = (await res.json()) as { values?: string[][] };
    const rows = data.values ?? [];
    if (rows.length === 0) return new Set();

    const [rawHeaderRow, ...bodyRows] = rows;
    const headerRow = rawHeaderRow.map((h) => h.trim());
    const discordIdx = headerRow.indexOf(ADMIN_HEADER_DISCORD);
    if (discordIdx === -1) {
      console.error(`Admin sheet has no "${ADMIN_HEADER_DISCORD}" column`);
      return new Set();
    }

    const ids = new Set<string>();
    for (const row of bodyRows) {
      const value = row[discordIdx]?.trim();
      if (value) ids.add(value);
    }
    return ids;
  } catch (err) {
    console.error("Admin sheet fetch threw:", err);
    return new Set();
  }
}

export async function fetchMembersFromSheet(env: Env): Promise<MemberRecord[]> {
  const accessToken = await getAccessToken(env);
  const [range, adminIds] = await Promise.all([
    resolveRange(env, accessToken),
    fetchAdminDiscordIds(env, accessToken),
  ]);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.ROSTER_ALL_TIME_SHEET_ID}/values/${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Sheets API failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  const rows = data.values ?? [];
  if (rows.length === 0) return [];

  // 헤더 셀에 뒤 공백 등이 섞여 들어오는 경우가 있어 매칭 전에 다듬어둡니다.
  const [rawHeaderRow, ...bodyRows] = rows;
  const headerRow = rawHeaderRow.map((h) => h.trim());

  const members: MemberRecord[] = [];
  for (const row of bodyRows) {
    const discordId = cell(row, headerRow, HEADER_MAP.discordId);
    if (!discordId) continue; // Discord가 없는 행(빈 줄 등)은 건너뜁니다.

    members.push({
      discordId,
      name: cell(row, headerRow, HEADER_MAP.name),
      email: cell(row, headerRow, HEADER_MAP.email),
      studentId: cell(row, headerRow, HEADER_MAP.studentId),
      joinedYear: null,
      status: "member",
      role: adminIds.has(discordId) ? "admin" : "member",
      phone: cell(row, headerRow, HEADER_MAP.phone),
      solvedAc: cell(row, headerRow, HEADER_MAP.solvedAc),
      codeforces: cell(row, headerRow, HEADER_MAP.codeforces),
      atcoder: cell(row, headerRow, HEADER_MAP.atcoder),
    });
  }

  return members;
}

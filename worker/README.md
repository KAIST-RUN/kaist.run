# kaist-run-auth (Discord 로그인 / 마이페이지 / 이메일 뷰어용 Worker)

`/ko/my`, `/en/my` 페이지(그리고 헤더의 로그인 버튼)가 호출하는
`GET /api/me`, `GET /api/auth/discord`, `POST /api/auth/logout`과,
`kaist.run/email/<id>` 이메일 전문 뷰어(관리자 전용)를 구현하는 Cloudflare
Worker입니다. 메인 사이트(정적 export)와는 별도로 배포되고,
`kaist.run/api/*`, `kaist.run/email/*` 경로만 이 Worker가 처리합니다.

## 0. 미리 필요한 것

- Cloudflare 계정 (기존 사이트를 배포 중인 계정과 동일해야 `kaist.run` 존에 라우트를 추가할 수 있습니다)
- Discord Developer Portal 접근 권한
- 역대 회원 스프레드시트를 이미 다루고 있는 Discord 봇의 서비스 계정 정보
  (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`) — 같은 계정을 재사용하므로
  시트에 새로 공유 권한을 추가할 필요가 없습니다.

## 1. Discord 애플리케이션 만들기

1. https://discord.com/developers/applications → New Application
2. OAuth2 탭에서 **Client ID**, **Client Secret** 확인
3. Redirects에 다음을 추가: `https://kaist.run/api/auth/discord/callback`
   (경로를 바꾸고 싶으면 `wrangler.jsonc`의 `DISCORD_REDIRECT_URI`도 같이 바꾸세요)
4. 요청 스코프는 `identify` 하나만 씁니다 (KAIST 이메일 등은 시트에서 가져오므로
   Discord의 `email` 스코프는 요청하지 않습니다).

## 2. Google 시트 연동 확인하기

역대 회원 스프레드시트는 이미 다음 8개 열로 구성되어 있고, 이 열들을
`src/lib/googleSheets.ts`의 `HEADER_MAP`이 그대로 참조합니다:

```
이름 | 학번 | 전화번호 | 이메일 | Discord | solved.ac | Codeforces | AtCoder
```

- **상태**(신청중/재학/졸업) 열이 없어서, 시트에 올라와 있는 사람은 전부
  `member`(재학 회원)로 취급합니다.
- **가입연도** 열이 없어서 마이페이지에는 항상 `-`로 표시됩니다.
- **관리자 권한**은 메인 시트가 아니라, 같은 스프레드시트의 **"관리자"** 탭에서
  관리합니다. 그 탭에는 `Discord`라는 열 하나만 있고, 거기 적힌 Discord ID가
  곧 관리자입니다. 이 탭이 없거나 읽기에 실패해도 전체 로그인이 막히지 않고
  그냥 아무도 관리자로 인식되지 않을 뿐입니다 (Worker 로그에 에러가 남음).
- 전화번호/solved.ac/Codeforces/AtCoder는 KV에는 같이 저장되지만
  `/api/me` 응답이나 마이페이지에는 아직 노출하지 않습니다. 나중에 보여주고
  싶으면 `worker/src/routes/me.ts`와 프런트의 `CurrentUser` 타입에 필드만
  추가하면 됩니다.

시트 URL의 `https://docs.google.com/spreadsheets/d/<이 부분>/edit` 이
`ROSTER_ALL_TIME_SHEET_ID` 값입니다. `GOOGLE_SHEET_RANGE`를 기본값(`Sheet1`)에서
안 바꿨으면 첫 번째 탭 이름을 자동으로 찾으므로, 보통은 따로 설정할 필요가
없습니다 — 특정 탭/범위를 강제로 지정하고 싶을 때만 바꾸면 됩니다.

## 3. 설치 및 KV namespace / R2 버킷 생성

```bash
cd worker
npm install

npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create MEMBERS
npx wrangler r2 bucket create kaist-run-emails
```

(R2를 계정에서 처음 쓰는 거라면 대시보드에서 R2 활성화를 먼저 요구할 수
있습니다 — 결제 수단 등록을 요구할 수 있지만 무료 한도(10GB 저장, 월 100만
쓰기, 월 1000만 읽기) 안에서는 과금되지 않습니다.)

KV 생성 명령이 출력하는 `id`를 `wrangler.jsonc`의 `kv_namespaces[].id`에
채워 넣으세요. R2는 버킷 이름(`kaist-run-emails`)만 맞으면 되고 `wrangler.jsonc`에
이미 그 이름으로 바인딩이 들어있습니다.

## 4. 시크릿 등록

```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_PRIVATE_KEY            # PEM 전체를, 봇 env의 값 그대로(\n 포함) 붙여넣기
npx wrangler secret put ROSTER_ALL_TIME_SHEET_ID
npx wrangler secret put ADMIN_SYNC_SECRET             # 아무 임의의 긴 문자열
```

(`DISCORD_REDIRECT_URI`, `GOOGLE_SHEET_RANGE`, `EMAIL_FORWARD_TO`는 민감하지
않아서 `wrangler.jsonc`의 `vars`에 이미 들어있습니다. `EMAIL_FORWARD_TO`는
`REPLACE_WITH_GMAIL_ADDRESS`로 되어 있으니, 지금까지 포워딩하던 실제 Gmail
주소로 바꿔주세요. 원치 않으면 `vars`에서 지우고 `wrangler secret put
EMAIL_FORWARD_TO`로 시크릿으로 등록해도 됩니다.)

로컬 개발(`npm run dev`)용 `.dev.vars`는 이미 만들어져 있고 `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PRIVATE_KEY`, `ROSTER_ALL_TIME_SHEET_ID`는 채워져 있습니다 (git에는 안 올라갑니다).
`DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`ADMIN_SYNC_SECRET`만 위에서 발급받은 값으로
채우면 됩니다. (`wrangler secret put`은 이 파일과 별개로, 실제 배포본에 필요합니다.)

## 5. kaist.run에 라우트 연결

`wrangler.jsonc`에 이미 다음이 들어있습니다:

```jsonc
"routes": [
  { "pattern": "kaist.run/api/*", "zone_name": "kaist.run" },
  { "pattern": "kaist.run/email/*", "zone_name": "kaist.run" }
]
```

기존 정적 사이트 배포는 건드리지 않아도, 이 두 경로만 이 Worker가 가로채고
나머지 경로는 그대로 기존 배포(정적 자산)가 처리합니다.
(존이 이미 Cloudflare에 연결돼 있어야 하고, `wrangler deploy` 시 자동으로
라우트가 등록됩니다. 안 되면 대시보드 → Workers Routes에서 수동으로 추가하세요.)

## 6. 배포

```bash
npm run deploy
```

## 7. Email Routing 규칙을 이 Worker로 연결

지금은 이메일 주소 → Gmail로 직접 포워딩하는 규칙일 텐데, 이걸 이 Worker를
거치도록 바꿔야 원본 저장 + 뷰어 링크가 동작합니다:

1. Cloudflare 대시보드 → 해당 zone → **Email** → **Email Routing** → **Routing rules**
2. 지금 Gmail로 포워딩하고 있는 규칙을 열어서, Action을 **"Send to a Worker"**로
   바꾸고 `kaist-run-auth`를 선택
3. Gmail로의 실제 포워딩은 이제 Worker 코드(`email()` 핸들러)가
   `EMAIL_FORWARD_TO` 값으로 대신 해줍니다 — 그러니 4번에서 그 값이
   맞게 채워져 있는지 다시 한번 확인하세요.

**다른 Discord 봇 쪽에 필요한 변경**: 이제 Gmail로 도착하는 메일에
`X-Kaist-Run-Email-Url` 헤더가 추가되어 있습니다 (예:
`https://kaist.run/email/ab12cd34...`). 그 봇이 이 헤더를 읽어서 알림
메시지에 링크로 붙이도록 코드를 수정해야 합니다 — 이건 이 저장소가 아니라
그 봇 쪽 작업입니다.

## 8. 첫 회원 동기화

Cron(매시 정각)이 돌 때까지 기다리거나, 바로 실행하려면:

```bash
ADMIN_SYNC_SECRET=<4번에서 등록한 값> npm run sync-members
```

## 9. 확인

- `https://kaist.run/api/auth/discord?returnTo=/ko/my` 로 접속 → Discord 로그인 →
  `/ko/my`로 돌아오면서 실제 회원 정보가 보이는지 확인
- 시트에 없는 Discord 계정으로 시도하면 `/ko/my?authError=not_member`로
  돌아오고, 사이트가 안내 배너를 보여주는지 확인
- 로그아웃 버튼을 누르면 `/ko`로 이동하고, 다시 `/ko/my`에 가면 로그인 화면이
  나오는지 확인
- 실제로 테스트 메일을 보내보고: Gmail에 평소처럼 도착하는지, 헤더에
  `X-Kaist-Run-Email-Url`이 붙어있는지, 그 링크로 들어가면(관리자 계정으로
  로그인 후) 메일 내용이 제대로 보이는지, 관리자가 아닌 회원 계정으로는
  접근이 막히는지 확인
- `npx wrangler r2 object get kaist-run-emails/emails/<id>.eml --remote`로
  R2에 원본이 실제로 저장됐는지 직접 확인해볼 수도 있습니다

## 나중에 고려할 것 (지금은 안 만듦)

- 관리자 전용 API(메일 아카이브 등)를 추가할 때는, 프런트의 `role` 값을
  신뢰하지 말고 이 Worker의 세션+회원 정보를 기준으로 서버에서 다시
  `role === "admin"`인지 확인하세요.
- R2에 쌓인 이메일은 자동으로 지워지지 않습니다. 오래된 것을 정리하고
  싶으면 R2 Object Lifecycle Rules(대시보드에서 설정 가능)로 일정 기간
  뒤 자동 삭제하게 만들 수 있습니다.

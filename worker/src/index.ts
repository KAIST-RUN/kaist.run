import { Hono } from "hono";
import { cors } from "hono/cors";
import PostalMime from "postal-mime";
import type { Env } from "./types";
import { purgeExpiredSessions } from "./lib/session";
import { auth } from "./routes/auth";
import { me } from "./routes/me";
import { admin } from "./routes/admin";
import { email } from "./routes/email";
import { backstage } from "./routes/backstage";
import { content } from "./routes/content";
import { uploads } from "./routes/uploads";
import { bot } from "./routes/bot";
import { storeRawEmail } from "./lib/emailStore";
import { indexEmail } from "./lib/emailIndex";
import { formatAddress, formatAddressList } from "./lib/emailRender";
import { ALLOWED_ORIGINS } from "./lib/constants";
import { enqueueDiscoveredContests, processDiscoveryQueue } from "./lib/runforce";

const app = new Hono<{ Bindings: Env }>();

// /api/me, /api/auth/logout는 프런트가 credentials:"include"로 직접 fetch합니다.
// 프로덕션은 같은 origin이라 사실 필요 없지만, 로컬 개발 시 메인 사이트(3000번
// 포트)와 이 Worker(8787번 포트)가 서로 다른 origin이라 이게 있어야 브라우저가
// 응답을 허용합니다. (OAuth 리다이렉트 경로들은 페이지 이동이라 CORS 대상이
// 아니라서 영향 없음.)
app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : undefined),
    credentials: true,
  }),
);

app.route("/api/auth", auth);
app.route("/api/me", me);
app.route("/api/admin", admin);
app.route("/api/content", content);
app.route("/api/bot", bot);
app.route("/upload", uploads);
app.route("/email", email);
// kaist.run에는 "/" 패턴의 Worker 라우트가 없어서(정적 사이트가 처리) 겹치지
// 않고, backstage.kaist.run/*만 이 마운트를 타게 됩니다 (wrangler.jsonc 참고).
app.route("/", backstage);

export default {
  fetch: app.fetch,

  // Cloudflare Email Routing 규칙이 이 Worker로 메일을 보내면 호출됩니다.
  // (대시보드에서 규칙을 "Send to a Worker" → 이 Worker로 설정해야 함 — README 참고)
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext) {
    // 뷰어용 저장(원본 버퍼링 포함) 과정에서 무엇이 실패하든 — R2 한도 초과든,
    // 스트림을 읽다가 나는 오류든 — 기존 Gmail 포워딩(→ 다른 Discord 봇의 알림)은
    // 항상 그대로 이어져야 하므로, 이 블록 전체를 감싸서 실패는 로그만 남기고
    // 넘어갑니다. message.forward()는 try/catch 밖에서 무조건 실행됩니다.
    let viewUrl: string | null = null;
    try {
      const raw = await new Response(message.raw).arrayBuffer();
      const id = await storeRawEmail(env, raw);
      viewUrl = `${ALLOWED_ORIGINS[0]}/email/${id}`;

      // 목록 페이지(GET /email)용 가벼운 색인. 이 블록만의 실패는 원본 저장/
      // 포워딩에 영향을 주면 안 되므로 별도 try/catch로 감쌉니다(안 그러면 색인
      // 실패가 바로 위 "메일 저장 실패" 로그로 잘못 찍힘 — message.forward()는
      // 어차피 이 바깥 try/catch 밖에서 무조건 실행되니 안전장치 목적은 아님).
      try {
        const parsed = await PostalMime.parse(raw);
        await indexEmail(env, {
          id,
          subject: parsed.subject || "(제목 없음)",
          from: formatAddress(parsed.from),
          to: formatAddressList(parsed.to),
          receivedAt: Date.now(),
        });
      } catch (err) {
        console.error(`Failed to index email ${id} for the list view`, err);
      }
    } catch (err) {
      console.error("Failed to store incoming email for the viewer", err);
    }

    const headers = viewUrl ? new Headers({ "X-Kaist-Run-Email-Url": viewUrl }) : undefined;
    await message.forward(env.EMAIL_FORWARD_TO, headers);
  },

  // wrangler.jsonc의 triggers.crons에 두 스케줄이 있습니다 — event.cron으로 구분합니다:
  //   "0 * * * *" (매시 정각) — enqueueDiscoveredContests: 새 후보를 찾아 큐에 넣기만
  //     합니다(가벼움). 설정이 꺼져 있으면 즉시 반환.
  //   "* * * * *" (매분) — processDiscoveryQueue: 큐에서 몇 개씩 꺼내 실제로 계산합니다
  //     (무거움 — 대회당 API 호출 여러 번). 이렇게 나눠야 밀린 대회가 많아도 몇 분 안에
  //     다 처리되면서, 한 번의 실행이 너무 오래 걸리지 않습니다.
  // ctx.waitUntil로 감싸서 이 함수가 리턴한 뒤에도 실제 작업이 끝날 시간을 확보합니다
  // (email() 핸들러가 storeRawEmail을 감싸는 것과 같은 이유).
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === "* * * * *") {
      ctx.waitUntil(
        processDiscoveryQueue(env).catch((err) => {
          console.error("RUNFORCE 큐 처리 실패", err);
        }),
      );
      return;
    }
    ctx.waitUntil(
      enqueueDiscoveredContests(env).catch((err) => {
        console.error("RUNFORCE 자동탐색 큐 등록 실패", err);
      }),
    );
    // 만료된 로그인 세션 정리(D1 sessions 테이블) — 정확성은 getSession의 expires_at
    // 필터가 이미 보장하므로, 여기선 테이블이 무한히 크지 않게만 하면 됩니다.
    ctx.waitUntil(
      purgeExpiredSessions(env).catch((err) => {
        console.error("만료 세션 정리 실패", err);
      }),
    );
  },
};

import { routing } from "@/i18n/routing";
import { withBasePath } from "@/lib/basePath";

// 로케일 결정 JS 식(문자열) — 실행되면 "ko" 또는 "en"으로 평가됩니다.
// 우선순위: localStorage("NEXT_LOCALE", 헤더 KO/EN 스위처를 눌렀을 때만 저장되는 명시적
// 선택) > 브라우저 언어가 한국어면 ko, 아니면 en.
// 이 식은 아래 LocaleRedirect와 404 관문(src/app/not-found.tsx) 두 곳에서 쓰입니다 —
// 규칙을 바꿀 땐 여기 한 곳만 고치면 됩니다.
export function localeExpression(): string {
  return (
    `(function(){var s=null;try{s=localStorage.getItem("NEXT_LOCALE")}catch(e){}` +
    `if(s&&${JSON.stringify(routing.locales)}.indexOf(s)>-1)return s;` +
    `return (navigator.language||"").toLowerCase().indexOf("ko")===0?"ko":"en"})()`
  );
}

// 로케일 없는 경로(/, /my/, /apply/, /notices/ 등)에서 저장된 로케일로 보내는 리다이렉트
// 페이지입니다. 정적 익스포트라 서버 리다이렉트가 불가능해 클라이언트에서 보내야 하는데,
// 예전처럼 "use client" + useEffect로 하면 JS 청크 다운로드 → 하이드레이션이 끝나야
// 리다이렉트가 시작됩니다(문서를 두 번 로드하는 비용에 하이드레이션 대기까지 얹힘).
// 대신 서버 컴포넌트가 인라인 <script>를 박아두면 HTML 파싱 중 즉시 실행되어 그 대기가
// 통째로 사라집니다. location.replace가 파싱 중에 불리므로 이 페이지의 나머지 자산
// 로드는 대부분 중단됩니다 — 그게 의도입니다.
export default function LocaleRedirect({ subpath }: { subpath: string }) {
  const script = `location.replace(${JSON.stringify(withBasePath(""))}+"/"+${localeExpression()}+${JSON.stringify(subpath)})`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <noscript>
        <p>
          <a href={withBasePath(`/ko${subpath}`)}>한국어</a> ·{" "}
          <a href={withBasePath(`/en${subpath}`)}>English</a>
        </p>
      </noscript>
    </>
  );
}

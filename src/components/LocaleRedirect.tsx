import { routing } from "@/i18n/routing";
import { withBasePath } from "@/lib/basePath";

// 로케일 없는 경로(/, /my/, /apply/)에서 저장된 로케일로 보내는 리다이렉트 페이지입니다.
// 정적 익스포트라 서버 리다이렉트가 불가능해 클라이언트에서 보내야 하는데, 예전처럼
// "use client" + useEffect로 하면 JS 청크 다운로드 → 하이드레이션이 끝나야 리다이렉트가
// 시작됩니다(문서를 두 번 로드하는 비용에 하이드레이션 대기까지 얹힘). 대신 서버 컴포넌트가
// 인라인 <script>를 박아두면 HTML 파싱 중 즉시 실행되어 그 대기가 통째로 사라집니다.
// location.replace가 파싱 중에 불리므로 이 페이지의 나머지 자산 로드는 대부분 중단됩니다
// — 그게 의도입니다.
//
// 로케일 우선순위는 기존 useEffect 구현 그대로입니다:
// localStorage("NEXT_LOCALE") > navigator.language가 en이면 en > defaultLocale.
export default function LocaleRedirect({ subpath }: { subpath: string }) {
  const script =
    `(function(){var s=null;try{s=localStorage.getItem("NEXT_LOCALE")}catch(e){}` +
    `var L=${JSON.stringify(routing.locales)};` +
    `var t=s&&L.indexOf(s)>-1?s:((navigator.language||"").toLowerCase().indexOf("en")===0?"en":${JSON.stringify(routing.defaultLocale)});` +
    `location.replace(${JSON.stringify(withBasePath(""))}+"/"+t+${JSON.stringify(subpath)})})()`;

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

import { localeExpression } from "@/components/LocaleRedirect";
import { withBasePath } from "@/lib/basePath";

// 404이자 "만능 관문"입니다. GitHub Pages는 존재하지 않는 모든 경로에 이 페이지
// (out/404.html)를 서빙하므로, 여기서 파스 타임 인라인 스크립트로 세 갈래를 처리합니다:
//
//   1) /ko/... 또는 /en/...  → 로케일이 이미 붙었는데 없는 페이지 = 진짜 404. 그대로 표시.
//   2) /Xy (2글자 [A-Za-z0-9], ko/en/my 제외)
//      → 공지 짧은 URL 후보. 공개 API(/api/content/short-links/Xy)로 slug를 해석해
//        해당 공지로 이동. 해석 중엔 404 화면이 깜빡이지 않게 문서를 숨기고, 실패하면
//        (없는 코드) 다시 드러내 404를 보여줍니다. API가 죽어도 2.5초 뒤엔 반드시
//        화면이 복원됩니다(failsafe).
//   3) 그 외 로케일 없는 경로(/notices, /notices/slug 등)
//      → 언어 설정에 맞는 로케일을 붙여 즉시 이동. 대상이 실존하지 않으면 로케일 붙은
//        경로로 다시 이 페이지에 떨어지고, 그땐 1)에 걸려 404가 표시됩니다(루프 없음).
//
// 자주 쓰는 고정 섹션(/notices 등)은 별도 래퍼 페이지가 있어 여기까지 오지 않고 바로
// 이동합니다 — 여기는 동적 하위 경로와 짧은 URL, 오타 경로의 관문입니다.
// [locale] 레이아웃 밖이라 next-intl 컨텍스트가 없어 문구는 이중언어 하드코딩입니다.
export default function NotFound() {
  const basePath = withBasePath("");
  const script =
    `(function(){` +
    `var B=${JSON.stringify(basePath)};` +
    `var p=location.pathname;` +
    `if(B&&p.indexOf(B)===0)p=p.slice(B.length);` +
    `var seg=p.split("/").filter(Boolean);` +
    `if(seg[0]==="ko"||seg[0]==="en")return;` + // 1) 진짜 404
    `var loc=${localeExpression()};` +
    `if(seg.length===1&&/^[A-Za-z0-9]{2}$/.test(seg[0])&&["ko","en","my"].indexOf(seg[0].toLowerCase())<0){` + // 2) 짧은 URL 후보
    `var d=document.documentElement;d.style.visibility="hidden";` +
    `var show=function(){d.style.visibility=""};setTimeout(show,2500);` +
    `fetch(B+"/api/content/short-links/"+seg[0]).then(function(r){return r.ok?r.json():null}).then(function(j){` +
    `if(j&&j.slug)location.replace(B+"/"+loc+"/notices/"+encodeURIComponent(j.slug)+"/");else show()` +
    `}).catch(show);` +
    `return}` +
    `var t=p;if(t.charAt(t.length-1)!=="/")t+="/";` + // 3) 로케일 붙여 이동 (trailingSlash 정본)
    `location.replace(B+"/"+loc+t+location.search+location.hash)` +
    `})()`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-lg opacity-80">
        Page not found · 페이지를 찾을 수 없습니다
      </p>
      <a
        href={withBasePath("/")}
        className="mt-2 rounded-full border border-current px-5 py-2 text-sm transition-opacity hover:opacity-70"
      >
        Go home · 홈으로
      </a>
    </div>
  );
}

import LocaleRedirect from "@/components/LocaleRedirect";

// 주의: out/bylaws/에는 public/bylaws/의 PDF(prebuild 생성물)도 함께 들어갑니다.
// 이 페이지는 index.html만 차지하므로 파일 충돌은 없습니다 — 빌드 검증에서 공존 확인.
export default function BylawsRedirect() {
  return <LocaleRedirect subpath="/bylaws/" />;
}

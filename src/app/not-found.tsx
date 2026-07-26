import { withBasePath } from "@/lib/basePath";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-lg opacity-80">
        Page not found · 페이지를 찾을 수 없습니다
      </p>
      <a
        href={withBasePath("/ko/")}
        className="mt-2 rounded-full border border-current px-5 py-2 text-sm transition-opacity hover:opacity-70"
      >
        한국어 홈으로 · Go home
      </a>
    </div>
  );
}

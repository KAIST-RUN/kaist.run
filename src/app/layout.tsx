import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import ThemeCookieSync from "@/components/layout/ThemeCookieSync";
// dynamic-subset: 2.0MB 단일 woff2 대신 unicode-range로 쪼갠 서브셋들을 선언만 해두고,
// 브라우저가 화면에 실제로 등장한 글리프 범위의 파일만 내려받게 합니다. 첫 화면 기준
// 폰트 전송량이 수십 KB로 줄어 JS 청크와의 대역폭 경쟁(→ 하이드레이션 지연)이 사라집니다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "RUN — KAIST Algorithmic Problem Solving Club",
  description: "KAIST의 알고리즘 문제해결 동아리 RUN의 공식 웹사이트입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className="h-full antialiased">
      <body className="flex h-dvh flex-col overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ThemeCookieSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

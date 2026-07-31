import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "약품 마스터 클라우드 동기화",
  description: "동국대학교일산병원 약품 라벨 작업실과 관리자·뷰어 간 공유 저장 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

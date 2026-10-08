import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "知乎高质量回答搜索",
  description: "基于知乎开放平台的个人搜索工具",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="flex gap-4 border-b px-6 py-3 text-sm">
          <Link href="/" className="hover:underline">搜索</Link>
          <Link href="/favorites" className="hover:underline">收藏</Link>
          <Link href="/stats" className="hover:underline">统计</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}

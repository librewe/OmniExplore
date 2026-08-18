import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniExplore - 认知考古学工具",
  description: "沿概念根系递归追问，Learn from scratch.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首帧前应用主题，避免刷新时浅色闪屏 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var dark=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="h-screen overflow-hidden bg-background antialiased">
        {children}
      </body>
    </html>
  );
}

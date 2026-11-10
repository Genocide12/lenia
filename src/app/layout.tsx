import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const manrope = Manrope({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Lenia — живая вселенная непрерывной «Жизни»",
  description:
    "Интерактивная WebGL-реконструкция Lenia Бёрта Чана: непрерывного аналога «Жизни» Конвея. 13 проверенных существ из оригинальной библиотеки, живые параметры μ и σ, кисть и палитры.",
  keywords: ["Lenia", "клеточные автоматы", "Game of Life", "искусственная жизнь", "ALife", "WebGL"],
  authors: [{ name: "Z.ai" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Lenia — живая вселенная непрерывной «Жизни»",
    description: "Цифровые организмы, которые ползут, делятся и умирают по-настоящему",
    siteName: "Z.ai",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

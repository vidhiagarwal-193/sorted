import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });

export const metadata: Metadata = {
  title: "Sorted",
  description: "Less chasing. More creating. Sorted remembers every client's details so your team can create the right content.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full`}>
      <body className="min-h-full md:flex">
        {/* The sidebar reads the current URL, so it streams in after the first paint. */}
        <Suspense fallback={<div className="hidden w-[252px] shrink-0 md:block" />}>
          <Sidebar />
        </Suspense>
        <main className="min-w-0 flex-1">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CommandPalette } from "@/components/command-palette";
import { SiteHeader } from "@/components/site-header";
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
  title: {
    default: "CSSNIPES — Esports Research",
    template: "%s · CSSNIPES",
  },
  description:
    "Research-first Counter-Strike 2 analytics: matches, players, teams, rankings, and historical statistics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CommandPalette />
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-edge py-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 text-sm text-muted sm:px-6">
            <span>CSSNIPES — research platform. No betting content.</span>
            <a href="/cs2/methods" className="hover:text-accent">
              Methods &amp; data integrity
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}

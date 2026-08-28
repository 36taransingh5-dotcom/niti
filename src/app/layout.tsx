import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NITI — Policy as Infrastructure",
  description:
    "An AI-powered compiler for government services. Policy in, working public service out.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line py-6">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-1.5 px-4 text-[12px] text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>
              NITI — Build What Moves India hackathon. All policies and data are
              synthetic and fictional.
            </span>
            <span className="font-mono">AI compiles · humans approve · deterministic engine executes</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

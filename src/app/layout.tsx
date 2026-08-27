import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import Link from "next/link";
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

const NAV = [
  { href: "/studio", label: "Policy Studio" },
  { href: "/studio/diff", label: "Diff & Impact" },
  { href: "/service", label: "Citizen Service" },
  { href: "/caseworker", label: "Caseworker" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-semibold tracking-tight text-primary">
                NITI
              </span>
              <span className="hidden text-[11px] uppercase tracking-[0.18em] text-ink-faint sm:block">
                Policy as infrastructure
              </span>
            </Link>
            <nav className="ml-auto flex items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line py-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-[12px] text-ink-faint">
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

"use client";

import Link from "next/link";
import { useState } from "react";

const NAV = [
  { href: "/studio", label: "Policy Studio" },
  { href: "/studio/diff", label: "Diff & Impact" },
  { href: "/service", label: "Citizen Service" },
  { href: "/caseworker", label: "Caseworker" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2" onClick={() => setOpen(false)}>
          <span className="font-mono text-lg font-semibold tracking-tight text-primary">
            NITI
          </span>
          <span className="hidden text-[11px] uppercase tracking-[0.18em] text-ink-faint md:block">
            Policy as infrastructure
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
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

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-line-strong text-ink md:hidden"
        >
          {open ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M1.5 4H14.5M1.5 8H14.5M1.5 12H14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {open ? (
        <nav className="border-t border-line bg-paper px-4 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-2.5 text-[14px] font-medium text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

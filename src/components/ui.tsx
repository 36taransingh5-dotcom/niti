import { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <div className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface ${className}`}>
      {children}
    </div>
  );
}

const badgeTones = {
  ok: "bg-ok-soft text-ok",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  neutral: "bg-paper text-ink-soft border border-line",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  tone = "neutral",
  detail,
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "ok" | "bad" | "warn" | "primary";
  detail?: string;
}) {
  const valueColor = {
    neutral: "text-ink",
    ok: "text-ok",
    bad: "text-bad",
    warn: "text-warn",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </div>
      <div className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${valueColor}`}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </div>
      {detail ? <div className="mt-1 text-[12px] text-ink-soft">{detail}</div> : null}
    </Card>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 95 ? "bg-ok" : pct >= 88 ? "bg-warn" : "bg-bad";
  return (
    <div className="flex items-center gap-2" title={`Compiler confidence ${pct}%`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-ink-soft">{pct}%</span>
    </div>
  );
}

export function SourceQuote({
  quote,
  section,
}: {
  quote: string;
  section: string;
}) {
  return (
    <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-[13px] italic leading-relaxed text-ink-soft">
      “{quote}”
      <span className="ml-2 whitespace-nowrap font-mono text-[11px] not-italic text-ink-faint">
        §{section}
      </span>
    </blockquote>
  );
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function formatValue(v: unknown): string {
  if (typeof v === "number" && v >= 1000) return formatINR(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.join(", ");
  if (v === undefined || v === null || v === "") return "—";
  return String(v);
}

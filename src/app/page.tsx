import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { applicationStats, listPolicyVersions } from "@/db/db";

const PIPELINE = [
  { label: "Policy document", sub: "written for humans", tone: "text-ink" },
  { label: "AI compiler", sub: "extracts structured rules", tone: "text-accent" },
  { label: "Human validation", sub: "officials approve every rule", tone: "text-ink" },
  { label: "Deterministic engine", sub: "no AI at runtime", tone: "text-primary" },
  { label: "Live service", sub: "citizen portal + caseworker + API", tone: "text-ok" },
] as const;

const ACTS = [
  {
    href: "/studio",
    step: "01",
    title: "Compile a policy",
    body: "Upload a policy document. The AI compiler extracts eligibility rules, exceptions, documents, and workflow — each with a confidence score and a citation back to the source text.",
  },
  {
    href: "/studio/review",
    step: "02",
    title: "Validate & deploy",
    body: "An official reviews every extracted rule, edits or rejects what's wrong, and deploys. AI proposes; humans approve; deterministic systems execute.",
  },
  {
    href: "/service",
    step: "03",
    title: "Citizen applies",
    body: "A working application form is generated from the specification — fields, steps, and conditional logic all derived from the policy, not hardcoded.",
  },
  {
    href: "/caseworker",
    step: "04",
    title: "Caseworker reviews",
    body: "Every application arrives with a full decision trace: what passed, what failed, what needs human verification — each item citing its policy section.",
  },
  {
    href: "/studio/diff",
    step: "05",
    title: "Policy changes",
    body: "Upload next year's revision. NITI diffs the rules and re-evaluates every existing application against both versions — real counts of who becomes eligible, who drops out.",
  },
] as const;

export default function Home() {
  let stats = { total: 0, autoEligible: 0 };
  let versions = 0;
  try {
    const s = applicationStats();
    stats = { total: s.total, autoEligible: s.autoEligible };
    versions = listPolicyVersions().length;
  } catch {
    // pre-seed state; page still renders
  }

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Hero */}
      <section className="py-20">
        <Badge tone="accent">Build What Moves India — demonstration platform</Badge>
        <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight">
          Government policy should be{" "}
          <span className="text-primary">compilable.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Policies are written in documents. Citizens experience them as portals.
          In between sits months of manual interpretation and custom software.
          NITI is a compiler for that gap: AI turns policy into a structured,
          human-approved specification — and a deterministic engine turns the
          specification into a working public service.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/studio"
            className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Open Policy Studio
          </Link>
          <Link
            href="/service"
            className="rounded-lg border border-line-strong bg-surface px-5 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
          >
            Try the generated service
          </Link>
        </div>
      </section>

      {/* Pipeline */}
      <section className="pb-16">
        <Card className="p-8">
          <div className="grid gap-6 md:grid-cols-5">
            {PIPELINE.map((stage, i) => (
              <div key={stage.label} className="relative">
                <div className="font-mono text-[11px] text-ink-faint">{String(i + 1).padStart(2, "0")}</div>
                <div className={`mt-1 text-[15px] font-semibold ${stage.tone}`}>{stage.label}</div>
                <div className="mt-1 text-[12px] leading-snug text-ink-soft">{stage.sub}</div>
                {i < PIPELINE.length - 1 ? (
                  <div className="absolute -right-4 top-6 hidden font-mono text-ink-faint md:block">→</div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-8 border-t border-line pt-5 font-mono text-[12px] text-ink-soft">
            AI at compilation time. Deterministic systems at runtime. No LLM call
            when a citizen submits an application.
          </div>
        </Card>
      </section>

      {/* Live numbers */}
      {stats.total > 0 ? (
        <section className="pb-16">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <div className="font-mono text-3xl font-semibold tabular-nums text-primary">
                {stats.total.toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-[13px] text-ink-soft">
                applications evaluated by the deterministic rules engine
              </div>
            </Card>
            <Card className="p-5">
              <div className="font-mono text-3xl font-semibold tabular-nums text-ok">
                {stats.autoEligible.toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-[13px] text-ink-soft">
                automatically found eligible under the deployed policy
              </div>
            </Card>
            <Card className="p-5">
              <div className="font-mono text-3xl font-semibold tabular-nums text-accent">
                {versions}
              </div>
              <div className="mt-1 text-[13px] text-ink-soft">
                policy version{versions === 1 ? "" : "s"} compiled into executable specifications
              </div>
            </Card>
          </div>
        </section>
      ) : null}

      {/* The demo journey */}
      <section className="pb-20">
        <h2 className="mb-6 text-xl font-semibold tracking-tight">
          One policy, end to end
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ACTS.map((act) => (
            <Link key={act.step} href={act.href} className="group">
              <Card className="h-full p-6 transition-colors group-hover:border-primary">
                <div className="font-mono text-[12px] font-semibold text-accent">{act.step}</div>
                <div className="mt-2 text-[16px] font-semibold text-ink group-hover:text-primary">
                  {act.title}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{act.body}</p>
              </Card>
            </Link>
          ))}
          <Card className="h-full border-dashed p-6">
            <div className="font-mono text-[12px] font-semibold text-ink-faint">∞</div>
            <div className="mt-2 text-[16px] font-semibold text-ink">Any policy, same engine</div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              Nothing here is scholarship-specific. The form, engine, dashboard,
              and impact analysis all read one specification format — point them
              at a different compiled policy and you get a different service.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { compilePolicyAction } from "@/app/actions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { listPolicyVersions } from "@/db/db";

export const dynamic = "force-dynamic";

const SAMPLES = [
  {
    year: "2025" as const,
    title: "National Merit Support Scholarship — 2025 Revision",
    note: "The currently deployed policy. Compile it again to watch the pipeline run from scratch.",
  },
  {
    year: "2026" as const,
    title: "National Merit Support Scholarship — 2026 Revision",
    note: "Next year's revision: new thresholds, a new exception, a new document. Compile it to unlock diff & impact.",
  },
];

export default function StudioPage() {
  const versions = listPolicyVersions();

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Policy Studio"
        title="Compile a policy document"
        description="Upload a policy, or use a bundled demonstration policy. The AI compiler extracts eligibility rules, exceptions, document requirements, and workflow — every element cited back to the source text and awaiting human approval."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {SAMPLES.map((s) => (
            <Card key={s.year} className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold">{s.title}</span>
                  <Badge tone="neutral">synthetic</Badge>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{s.note}</p>
              </div>
              <form action={compilePolicyAction}>
                <input type="hidden" name="sample" value={s.year} />
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Compile policy →
                </button>
              </form>
            </Card>
          ))}

          <Card className="p-6">
            <div className="text-[15px] font-semibold">Upload your own policy</div>
            <p className="mt-1 text-[13px] text-ink-soft">
              Plain text or Markdown. The compiler produces the same structured
              specification format regardless of source.
            </p>
            <form action={compilePolicyAction} className="mt-4 flex flex-wrap items-center gap-3">
              <input
                type="file"
                name="file"
                accept=".md,.txt"
                required
                className="text-[13px] text-ink-soft file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink"
              />
              <button
                type="submit"
                className="rounded-lg border border-line-strong px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
              >
                Compile upload →
              </button>
            </form>
          </Card>
        </div>

        <Card className="h-fit p-6">
          <div className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
            Compiled versions
          </div>
          {versions.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-soft">
              Nothing compiled yet. Run <code className="font-mono">npm run seed</code> or compile a sample.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link
                      href={`/studio/review?v=${v.id}`}
                      className="text-[13px] font-semibold text-ink hover:text-primary"
                    >
                      {v.title} {v.versionLabel}
                    </Link>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-faint">
                      v{v.id} · compiled by {v.compiledBy}
                    </div>
                  </div>
                  <Badge
                    tone={v.status === "deployed" ? "ok" : v.status === "draft" ? "warn" : "neutral"}
                  >
                    {v.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

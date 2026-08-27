import Link from "next/link";
import { TraceView } from "@/components/rule-tree";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getApplication } from "@/db/db";

export const dynamic = "force-dynamic";

const OUTCOME = {
  eligible: {
    tone: "border-ok bg-ok-soft text-ok",
    title: "Eligible",
    body: "Your application meets all automatic eligibility requirements of the policy.",
  },
  eligible_pending_review: {
    tone: "border-warn bg-warn-soft text-warn",
    title: "Eligible — pending caseworker review",
    body: "Your application meets the automatic eligibility requirements. Final approval requires verification of the documents listed below by a caseworker.",
  },
  ineligible: {
    tone: "border-bad bg-bad-soft text-bad",
    title: "Not currently eligible",
    body: "Your application does not meet one or more requirements of the policy. Each unmet requirement is explained below with the exact policy rule applied.",
  },
} as const;

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = getApplication(Number(id));
  if (!app) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center text-ink-soft">
        Application not found.
      </div>
    );
  }

  const d = app.decision;
  const o = OUTCOME[d.outcome as keyof typeof OUTCOME] ?? OUTCOME.ineligible;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <PageHeader
        eyebrow="Decision"
        title={`Application ${app.appNumber}`}
        description="This decision was produced by the deterministic rules engine from the approved policy specification. Every line cites the policy provision applied. No AI was involved in this evaluation."
      />

      <div className={`rounded-xl border px-6 py-5 ${o.tone}`}>
        <div className="text-lg font-semibold">{o.title}</div>
        <p className="mt-1 text-[13px] leading-relaxed opacity-90">{o.body}</p>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
          Decision explanation
        </h2>
        <ul className="mt-4 space-y-3">
          {d.explanations.map((e, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className={`mt-0.5 font-semibold ${
                  e.kind === "pass" ? "text-ok" : e.kind === "fail" ? "text-bad" : "text-warn"
                }`}
              >
                {e.kind === "pass" ? "✓" : e.kind === "fail" ? "✗" : "⚠"}
              </span>
              <div>
                <p className="text-[14px] leading-relaxed text-ink">{e.message}</p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{e.sectionRef}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
          Full evaluation trace
        </h2>
        <div className="mt-4 overflow-x-auto">
          <TraceView result={d.trace} />
        </div>
      </Card>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link
          href="/service"
          className="rounded-lg border border-line-strong px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
        >
          ← Submit another application
        </Link>
        <Link
          href={`/caseworker/${app.id}`}
          className="text-[13px] font-semibold text-primary hover:underline"
        >
          View as caseworker →
        </Link>
        <Badge tone="neutral">outcome: {d.outcome}</Badge>
      </div>
    </div>
  );
}

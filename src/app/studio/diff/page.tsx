import Link from "next/link";
import {
  Badge,
  Card,
  PageHeader,
  StatCard,
  columnLabel,
  formatFieldValue,
  formatValue,
  summaryFields,
} from "@/components/ui";
import { DiffChange, diffSpecs } from "@/core/diff/diff";
import { ImpactCategory, runImpact } from "@/core/impact/impact";
import { getAllApplications, listPolicyVersions } from "@/db/db";

export const dynamic = "force-dynamic";

function ChangeCard({ change }: { change: DiffChange }) {
  switch (change.type) {
    case "threshold_changed":
      return (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">{change.label}</span>
            <Badge tone="primary">threshold changed</Badge>
          </div>
          <div className="mt-3 flex items-center gap-4 font-mono text-xl">
            <span className="text-ink-soft line-through decoration-bad/60">
              {formatValue(change.from)}
            </span>
            <span className="text-ink-faint">→</span>
            <span className="font-semibold text-primary">{formatValue(change.to)}</span>
            <span className="text-[12px] text-ink-faint">§{change.section}</span>
          </div>
        </Card>
      );
    case "options_changed":
      return (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">{change.label}</span>
            <Badge tone="primary">values changed</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[13px]">
            {change.added.map((v) => (
              <span key={String(v)} className="rounded-md bg-ok-soft px-2 py-1 font-semibold text-ok">
                + {String(v)}
              </span>
            ))}
            {change.removed.map((v) => (
              <span key={String(v)} className="rounded-md bg-bad-soft px-2 py-1 font-semibold text-bad">
                − {String(v)}
              </span>
            ))}
            <span className="self-center text-[12px] text-ink-faint">§{change.section}</span>
          </div>
        </Card>
      );
    case "exception_added":
    case "exception_removed":
      return (
        <Card className="border-accent/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">{change.label}</span>
            <Badge tone="accent">
              {change.type === "exception_added" ? "new exception" : "exception removed"}
            </Badge>
          </div>
          <p className="mt-2 font-mono text-[13px] text-ink-soft">{change.description}</p>
          <blockquote className="mt-2 border-l-2 border-accent/50 pl-3 text-[13px] italic text-ink-soft">
            “{change.quote}” <span className="font-mono text-[11px] not-italic">§{change.section}</span>
          </blockquote>
        </Card>
      );
    case "condition_added":
    case "condition_removed":
      return (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">{change.label}</span>
            <Badge tone={change.type === "condition_added" ? "ok" : "bad"}>
              {change.type === "condition_added" ? "condition added" : "condition removed"}
            </Badge>
          </div>
          <div className="mt-2 font-mono text-[13px]">
            {change.field} {change.operator} {formatValue(change.value)}{" "}
            <span className="text-[12px] text-ink-faint">§{change.section}</span>
          </div>
        </Card>
      );
    case "document_added":
    case "document_removed":
      return (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">{change.label}</span>
            <Badge tone={change.type === "document_added" ? "ok" : "bad"}>
              {change.type === "document_added" ? "document added" : "document removed"}
            </Badge>
          </div>
          {change.description ? (
            <p className="mt-1 text-[13px] text-ink-soft">{change.description}</p>
          ) : null}
        </Card>
      );
    case "structure_changed":
      return (
        <Card className="border-warn/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">Eligibility logic restructured</span>
            <Badge tone="warn">structure changed</Badge>
          </div>
          <div className="mt-3 flex items-center gap-3 font-mono text-[15px]">
            <span className="text-ink-soft line-through decoration-bad/60">{change.from}</span>
            <span className="text-ink-faint">→</span>
            <span className="font-semibold text-primary">{change.to}</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            No threshold moved, but the logic joining{" "}
            <span className="font-mono">{change.fields.join(", ")}</span> changed shape —
            which changes who qualifies.
          </p>
        </Card>
      );
  }
}

const CATEGORIES: { key: ImpactCategory | "all"; label: string; tone: "ok" | "bad" | "neutral" | "primary" }[] = [
  { key: "newly_eligible", label: "Newly eligible", tone: "ok" },
  { key: "newly_ineligible", label: "No longer eligible", tone: "bad" },
  { key: "still_eligible", label: "Still eligible", tone: "primary" },
  { key: "still_ineligible", label: "Still ineligible", tone: "neutral" },
];

export default async function DiffPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; cat?: string }>;
}) {
  const params = await searchParams;
  const versions = listPolicyVersions();

  // Default comparison: newest compiled revision as "after", and the most
  // recent earlier revision with a different version label as "before".
  const defaultB = versions.at(-1);
  const defaultA = versions
    .filter(
      (v) => v.id !== defaultB?.id && v.spec.versionLabel !== defaultB?.spec.versionLabel,
    )
    .at(-1);
  const versionA = params.a
    ? versions.find((v) => v.id === Number(params.a))
    : defaultA;
  const versionB = params.b
    ? versions.find((v) => v.id === Number(params.b))
    : defaultB;

  if (!versionA || !versionB) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 text-center">
        <p className="text-[15px] text-ink-soft">
          Policy comparison needs two compiled revisions. The 2025 revision is
          deployed —{" "}
          <Link href="/studio" className="font-semibold text-primary">
            compile the 2026 revision in the Studio →
          </Link>
        </p>
      </div>
    );
  }

  const diff = diffSpecs(versionA.spec, versionB.spec);
  const applications = getAllApplications()
    .filter((a) => a.source === "synthetic")
    .map((a) => ({ id: a.appNumber, data: a.data }));
  const report = runImpact(applications, versionA.spec, versionB.spec);

  // Drill-down columns come from the policy specification, not from any
  // knowledge of what this particular service is about.
  const columns = summaryFields(versionB.spec, 4);

  const cat = (params.cat as ImpactCategory | undefined) ?? "newly_eligible";
  const drillRows = report.rows.filter((r) => r.category === cat).slice(0, 25);

  const catCount = (k: ImpactCategory) =>
    ({
      newly_eligible: report.newlyEligible,
      newly_ineligible: report.newlyIneligible,
      still_eligible: report.stillEligible,
      still_ineligible: report.stillIneligible,
    })[k];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
      <PageHeader
        eyebrow="Policy diff → impact analysis"
        title={`${diff.from.title}: ${diff.from.versionLabel} → ${diff.to.versionLabel}`}
        description="NITI compares the two compiled specifications structurally, then re-evaluates every existing application against both versions with the deterministic engine. Every number below is a real count over real evaluations — nothing is estimated."
      />

      <section>
        <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-ink-soft">
          Policy changes detected
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {diff.changes.map((c, i) => (
            <ChangeCard key={i} change={c} />
          ))}
          {diff.changes.length === 0 ? (
            <p className="text-ink-soft">No structural differences detected.</p>
          ) : null}
        </div>

        {/*
          The diff and the impact analysis are computed independently — one
          compares specifications, the other re-runs the engine over real
          applications. If they ever disagree, the page says so rather than
          showing a confident "no changes" above a panel full of flips.
        */}
        {diff.changes.length === 0 && report.affected > 0 ? (
          <div className="mt-4 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-[13px] leading-relaxed text-bad">
            <span className="font-semibold">Inconsistency detected.</span> The
            specification diff found no changes, but re-running the engine over{" "}
            {report.total.toLocaleString("en-IN")} applications changes{" "}
            {report.affected.toLocaleString("en-IN")} decisions. The impact
            numbers below are authoritative — they come from the engine — and
            the diff above is failing to describe a real change. Do not deploy
            on the strength of the diff alone.
          </div>
        ) : null}
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-ink-soft">
          Impact analysis
        </h2>
        <p className="mb-5 text-[13px] text-ink-soft">
          {report.total.toLocaleString("en-IN")} existing applications were
          re-evaluated against both revisions ({(report.total * 2).toLocaleString("en-IN")}{" "}
          deterministic evaluations).
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Applications affected"
            value={report.affected}
            tone="primary"
            detail="decision changes between revisions"
          />
          <StatCard
            label="Newly eligible"
            value={report.newlyEligible}
            tone="ok"
            detail="ineligible under 2025 rules, eligible under 2026"
          />
          <StatCard
            label="No longer eligible"
            value={report.newlyIneligible}
            tone="bad"
            detail="eligible under 2025 rules, ineligible under 2026"
          />
          <StatCard
            label="Require additional review"
            value={report.additionalReview}
            tone="warn"
            detail="eligible but new verification is needed"
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Why applicants become eligible
            </h3>
            <div className="mt-4 space-y-3">
              {report.causesNewlyEligible.map((c) => (
                <div key={c.field}>
                  <div className="flex justify-between text-[13px]">
                    <span>{c.label}</span>
                    <span className="font-mono font-semibold text-ok">{c.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-ok"
                      style={{ width: `${(c.count / Math.max(1, report.newlyEligible)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Why applicants drop out
            </h3>
            <div className="mt-4 space-y-3">
              {report.causesNewlyIneligible.map((c) => (
                <div key={c.field}>
                  <div className="flex justify-between text-[13px]">
                    <span>{c.label}</span>
                    <span className="font-mono font-semibold text-bad">{c.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-bad"
                      style={{ width: `${(c.count / Math.max(1, report.newlyIneligible)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-ink-soft">
          The people behind the numbers
        </h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              href={`/studio/diff?a=${versionA.id}&b=${versionB.id}&cat=${c.key}`}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${
                cat === c.key
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-surface text-ink-soft hover:border-primary"
              }`}
            >
              {c.label} · {catCount(c.key as ImpactCategory).toLocaleString("en-IN")}
            </Link>
          ))}
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
                <th className="px-4 py-3 font-semibold">Application</th>
                {columns.map((f) => (
                  <th key={f.key} className="px-4 py-3 font-semibold">
                    {columnLabel(f)}
                  </th>
                ))}
                <th className="px-4 py-3 font-semibold">{diff.from.versionLabel} outcome</th>
                <th className="px-4 py-3 font-semibold">{diff.to.versionLabel} outcome</th>
                <th className="px-4 py-3 font-semibold">Deciding rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {drillRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-mono text-primary">{r.id}</td>
                  {columns.map((f) => (
                    <td
                      key={f.key}
                      className={`px-4 py-2.5 ${f.type === "number" ? "font-mono tabular-nums" : ""}`}
                    >
                      {formatFieldValue(r.applicant[f.key], f)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <Badge tone={r.before.eligible ? "ok" : "bad"}>
                      {r.before.eligible ? "eligible" : "ineligible"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={r.after.eligible ? "ok" : "bad"}>
                      {r.after.eligible ? "eligible" : "ineligible"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-soft">
                    {r.changedFields.join(", ") || "—"}
                  </td>
                </tr>
              ))}
              {drillRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 4} className="px-4 py-8 text-center text-ink-faint">
                    No applications in this category.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {report.rows.filter((r) => r.category === cat).length > 25 ? (
            <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-faint">
              Showing 25 of{" "}
              {report.rows.filter((r) => r.category === cat).length.toLocaleString("en-IN")}{" "}
              applications in this category.
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}

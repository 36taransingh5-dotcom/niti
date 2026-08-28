import Link from "next/link";
import { Badge, Card, PageHeader, StatCard, formatINR } from "@/components/ui";
import { applicationStats, getDb } from "@/db/db";
import { Applicant } from "@/core/engine/evaluate";

export const dynamic = "force-dynamic";

interface QueueRow {
  id: number;
  app_number: string;
  data_json: string;
  outcome: string;
  source: string;
  caseworker_status: string;
  submitted_at: string;
}

const FILTERS = [
  { key: "review", label: "Needs review" },
  { key: "citizen", label: "Live submissions" },
  { key: "decided", label: "Decided" },
  { key: "all", label: "All" },
] as const;

export default async function CaseworkerPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "review" } = await searchParams;
  const stats = applicationStats();
  const db = getDb();

  const where =
    filter === "review"
      ? `WHERE outcome = 'eligible_pending_review' AND caseworker_status = 'pending'`
      : filter === "citizen"
        ? `WHERE source = 'citizen'`
        : filter === "decided"
          ? `WHERE caseworker_status != 'pending'`
          : "";
  const rows = db
    .prepare(
      `SELECT id, app_number, data_json, outcome, source, caseworker_status, submitted_at
       FROM applications ${where}
       ORDER BY source = 'citizen' DESC, id DESC LIMIT 60`,
    )
    .all() as QueueRow[];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
      <PageHeader
        eyebrow="Caseworker dashboard"
        title="Application queue"
        description="Applications the engine found automatically eligible still require caseworker verification of manually-reviewed documents. The system recommends; the caseworker decides."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <StatCard label="Total applications" value={stats.total} tone="primary" />
        <StatCard label="Awaiting review" value={stats.pendingReview} tone="warn" />
        <StatCard label="Auto-eligible" value={stats.autoEligible} tone="ok" />
        <StatCard label="Auto-ineligible" value={stats.autoIneligible} tone="bad" />
      </div>

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/caseworker?filter=${f.key}`}
            className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${
              filter === f.key
                ? "border-primary bg-primary text-white"
                : "border-line bg-surface text-ink-soft hover:border-primary"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-4 py-3 font-semibold">Application</th>
              <th className="px-4 py-3 font-semibold">Applicant</th>
              <th className="px-4 py-3 font-semibold">Income</th>
              <th className="px-4 py-3 font-semibold">Engine outcome</th>
              <th className="px-4 py-3 font-semibold">Caseworker</th>
              <th className="px-4 py-3 font-semibold">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const data = JSON.parse(r.data_json) as Applicant;
              return (
                <tr key={r.id} className="transition-colors hover:bg-primary-soft/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/caseworker/${r.id}`}
                      className="font-mono font-semibold text-primary hover:underline"
                    >
                      {r.app_number}
                    </Link>
                    {r.source === "citizen" ? (
                      <Badge tone="accent">live</Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{String(data.fullName ?? "—")}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {typeof data.annualHouseholdIncome === "number"
                      ? formatINR(data.annualHouseholdIncome)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        r.outcome === "ineligible"
                          ? "bad"
                          : r.outcome === "eligible"
                            ? "ok"
                            : "warn"
                      }
                    >
                      {r.outcome.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        r.caseworker_status === "approved"
                          ? "ok"
                          : r.caseworker_status === "rejected"
                            ? "bad"
                            : "neutral"
                      }
                    >
                      {r.caseworker_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">
                    {r.submitted_at.slice(0, 10)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-faint">
                  No applications match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

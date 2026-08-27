import Link from "next/link";
import { caseworkerDecideAction } from "@/app/actions";
import { TraceView } from "@/components/rule-tree";
import { Badge, Card, PageHeader, formatValue } from "@/components/ui";
import { getApplication, getPolicyVersion } from "@/db/db";

export const dynamic = "force-dynamic";

export default async function CaseworkerDetailPage({
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
  const version = getPolicyVersion(app.versionId);
  const d = app.decision;

  const recommendation = !d.eligible
    ? {
        tone: "border-bad bg-bad-soft text-bad",
        title: "Recommendation: does not meet automatic requirements",
        body: "Based on the approved policy rules, this application fails one or more eligibility conditions. The failing conditions are listed in the trace with the applicant's values.",
      }
    : d.manualReviewRequired
      ? {
          tone: "border-warn bg-warn-soft text-warn",
          title: "Recommendation: eligible pending document verification",
          body: "Based on the approved policy rules, this application meets the automatic eligibility requirements. Final approval requires caseworker verification of the flagged documents.",
        }
      : {
          tone: "border-ok bg-ok-soft text-ok",
          title: "Recommendation: meets all automatic requirements",
          body: "Based on the approved policy rules, this application meets the automatic eligibility requirements and no document requires manual verification.",
        };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <PageHeader
        eyebrow="Caseworker dashboard"
        title={`Application ${app.appNumber}`}
        description={`Evaluated against ${version?.spec.title ?? "policy"} revision ${version?.spec.versionLabel ?? "?"} (specification v${app.versionId}).`}
        actions={
          <Link
            href="/caseworker"
            className="rounded-lg border border-line-strong px-4 py-2 text-[13px] font-semibold text-ink-soft hover:border-primary hover:text-primary"
          >
            ← Back to queue
          </Link>
        }
      />

      <div className={`rounded-xl border px-6 py-5 ${recommendation.tone}`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
          System recommendation
        </div>
        <div className="mt-1 text-lg font-semibold">{recommendation.title}</div>
        <p className="mt-1 text-[13px] leading-relaxed opacity-90">{recommendation.body}</p>
        <p className="mt-2 text-[12px] font-semibold opacity-80">
          The final decision is made by a caseworker, not by the system.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Applicant data
            </h2>
            <dl className="mt-3 divide-y divide-line">
              {Object.entries(app.data)
                .filter(([k]) => !k.startsWith("doc_"))
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2">
                    <dt className="font-mono text-[12px] text-ink-soft">{k}</dt>
                    <dd className="font-mono text-[13px] font-medium">{formatValue(v)}</dd>
                  </div>
                ))}
            </dl>
          </Card>

          <Card className="p-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Documents
            </h2>
            <ul className="mt-3 space-y-2.5">
              {d.documents
                .filter((doc) => doc.required)
                .map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3">
                    <span className="text-[13px]">{doc.label}</span>
                    {!doc.provided ? (
                      <Badge tone="bad">missing</Badge>
                    ) : doc.requiresManualReview ? (
                      <Badge tone="warn">⚠ requires verification</Badge>
                    ) : (
                      <Badge tone="ok">✓ provided</Badge>
                    )}
                  </li>
                ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Eligibility trace
            </h2>
            <div className="mt-3 overflow-x-auto">
              <TraceView result={d.trace} />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Caseworker decision
            </h2>
            {app.caseworkerStatus !== "pending" ? (
              <div className="mt-3">
                <Badge tone={app.caseworkerStatus === "approved" ? "ok" : "bad"}>
                  {app.caseworkerStatus}
                </Badge>
                {app.caseworkerNote ? (
                  <p className="mt-2 text-[13px] italic text-ink-soft">“{app.caseworkerNote}”</p>
                ) : null}
              </div>
            ) : (
              <form action={caseworkerDecideAction} className="mt-3 space-y-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <textarea
                  name="note"
                  rows={2}
                  placeholder="Verification note (optional)"
                  className="w-full rounded-lg border border-line-strong px-3 py-2 text-[13px] focus:border-primary focus:outline-none"
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    name="status"
                    value="approved"
                    className="rounded-lg bg-ok px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Approve application
                  </button>
                  <button
                    type="submit"
                    name="status"
                    value="rejected"
                    className="rounded-lg bg-bad px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Reject application
                  </button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

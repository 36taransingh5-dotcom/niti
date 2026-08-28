import Link from "next/link";
import {
  approveAllAction,
  deployAction,
  reviewElementAction,
} from "@/app/actions";
import { RuleTreeView } from "@/components/rule-tree";
import { Badge, Card, ConfidenceBar, PageHeader, SourceQuote } from "@/components/ui";
import {
  ConditionNode,
  Provenance,
  collectConditions,
  reviewableElements,
} from "@/core/schema/spec";
import { getPolicyVersion, listPolicyVersions } from "@/db/db";

export const dynamic = "force-dynamic";

function statusBadge(status: Provenance["status"]) {
  const tone =
    status === "approved" ? "ok" : status === "rejected" ? "bad" : status === "edited" ? "primary" : "warn";
  return <Badge tone={tone}>{status}</Badge>;
}

function ReviewButtons({
  versionId,
  elementId,
  kind,
  status,
  editable,
}: {
  versionId: number;
  elementId: string;
  kind: "condition" | "document" | "exception";
  status: Provenance["status"];
  editable?: { current: number };
}) {
  const base = (
    <>
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="elementId" value={elementId} />
      <input type="hidden" name="kind" value={kind} />
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={reviewElementAction}>
        {base}
        <input type="hidden" name="status" value="approved" />
        <button
          type="submit"
          disabled={status === "approved"}
          className="rounded-md bg-ok-soft px-3 py-1 text-[12px] font-semibold text-ok transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          Approve
        </button>
      </form>
      {editable ? (
        <form action={reviewElementAction} className="flex items-center gap-1">
          {base}
          <input type="hidden" name="status" value="edited" />
          <input
            type="number"
            name="newValue"
            defaultValue={editable.current}
            className="w-28 rounded-md border border-line px-2 py-1 font-mono text-[12px]"
            aria-label="Edited value"
          />
          <button
            type="submit"
            className="rounded-md bg-primary-soft px-3 py-1 text-[12px] font-semibold text-primary transition-opacity hover:opacity-80"
          >
            Save edit
          </button>
        </form>
      ) : null}
      <form action={reviewElementAction}>
        {base}
        <input type="hidden" name="status" value="rejected" />
        <button
          type="submit"
          disabled={status === "rejected"}
          className="rounded-md bg-bad-soft px-3 py-1 text-[12px] font-semibold text-bad transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          Reject
        </button>
      </form>
    </div>
  );
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; compiledBy?: string; error?: string }>;
}) {
  const params = await searchParams;
  const versions = listPolicyVersions();
  const requested = params.v ? Number(params.v) : undefined;
  const version = requested
    ? getPolicyVersion(requested)
    : (versions.filter((v) => v.status === "draft").at(-1) ??
      versions.filter((v) => v.status === "deployed").at(-1));

  if (!version) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 text-center">
        <p className="text-ink-soft">
          No compiled policy found.{" "}
          <Link href="/studio" className="font-semibold text-primary">
            Compile one in the Policy Studio →
          </Link>
        </p>
      </div>
    );
  }

  const spec = version.spec;
  const conditions = collectConditions(spec.eligibility);
  const elements = reviewableElements(spec);
  const resolved = elements.filter((e) => e.status !== "pending").length;
  const deployable =
    elements.every((e) => e.status === "approved" || e.status === "edited") &&
    version.status !== "deployed";

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
      <PageHeader
        eyebrow="Policy Studio · Human validation"
        title={`${spec.title} — ${spec.versionLabel}`}
        description="Every element below was extracted by the AI compiler with a confidence score and a citation. Nothing executes until a human approves it."
        actions={
          <>
            <form action={approveAllAction}>
              <input type="hidden" name="versionId" value={version.id} />
              <button
                type="submit"
                className="rounded-lg border border-line-strong px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
              >
                Approve remaining
              </button>
            </form>
            <form action={deployAction}>
              <input type="hidden" name="versionId" value={version.id} />
              <button
                type="submit"
                disabled={!deployable}
                className="rounded-lg bg-primary px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                title={
                  version.status === "deployed"
                    ? "This version is already deployed"
                    : deployable
                      ? "Deploy this specification as the live service"
                      : "All elements must be approved or edited before deployment"
                }
              >
                {version.status === "deployed" ? "Deployed ✓" : "Deploy service"}
              </button>
            </form>
          </>
        }
      />

      {params.error === "unresolved" ? (
        <div className="mb-6 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-[13px] font-medium text-bad">
          Deployment blocked: every extracted element must be approved or edited
          first. Rejected elements must be edited or re-approved.
        </div>
      ) : null}

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Badge tone={version.compiledBy === "ai" ? "accent" : "primary"}>
          compiled by{" "}
          {version.compiledBy === "ai"
            ? "AI (validated)"
            : "pre-verified compilation of this document"}
        </Badge>
        <Badge tone={version.status === "deployed" ? "ok" : "warn"}>{version.status}</Badge>
        <span className="font-mono text-[12px] text-ink-soft">
          {resolved}/{elements.length} elements reviewed
        </span>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(resolved / elements.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section>
            <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-ink-soft">
              Eligibility conditions
            </h2>
            <div className="space-y-4">
              {conditions.map((c: ConditionNode) => (
                <Card key={c.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[15px] font-semibold">{c.label}</div>
                    <div className="flex items-center gap-3">
                      <ConfidenceBar value={c.confidence} />
                      {statusBadge(c.status)}
                    </div>
                  </div>
                  <div className="mt-2 font-mono text-[13px]">
                    <span className="text-ink">{c.field}</span>{" "}
                    <span className="font-semibold text-primary">{c.operator}</span>{" "}
                    <span className="text-accent">
                      {Array.isArray(c.value)
                        ? c.value.join(", ")
                        : typeof c.value === "number" && c.value >= 1000
                          ? `₹${c.value.toLocaleString("en-IN")}`
                          : String(c.value)}
                    </span>
                  </div>
                  <SourceQuote quote={c.sourceQuote} section={c.sourceSection} />
                  <div className="mt-4">
                    <ReviewButtons
                      versionId={version.id}
                      elementId={c.id}
                      kind="condition"
                      status={c.status}
                      editable={
                        typeof c.value === "number" ? { current: c.value } : undefined
                      }
                    />
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {spec.exceptions.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-ink-soft">
                Exceptions
              </h2>
              <div className="space-y-4">
                {spec.exceptions.map((e) => (
                  <Card key={e.id} className="border-accent/40 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[15px] font-semibold">{e.label}</div>
                      <div className="flex items-center gap-3">
                        <ConfidenceBar value={e.confidence} />
                        {statusBadge(e.status)}
                      </div>
                    </div>
                    <p className="mt-2 font-mono text-[13px] text-ink-soft">{e.description}</p>
                    <SourceQuote quote={e.sourceQuote} section={e.sourceSection} />
                    <div className="mt-4">
                      <ReviewButtons
                        versionId={version.id}
                        elementId={e.id}
                        kind="exception"
                        status={e.status}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-ink-soft">
              Required documents
            </h2>
            <div className="space-y-4">
              {spec.documents.map((d) => (
                <Card key={d.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold">{d.label}</span>
                      {d.requiresManualReview ? (
                        <Badge tone="warn">manual verification</Badge>
                      ) : null}
                      {d.requiredWhen ? <Badge tone="accent">conditional</Badge> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <ConfidenceBar value={d.confidence} />
                      {statusBadge(d.status)}
                    </div>
                  </div>
                  {d.description ? (
                    <p className="mt-1 text-[13px] text-ink-soft">{d.description}</p>
                  ) : null}
                  <SourceQuote quote={d.sourceQuote} section={d.sourceSection} />
                  <div className="mt-4">
                    <ReviewButtons
                      versionId={version.id}
                      elementId={d.id}
                      kind="document"
                      status={d.status}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Compiled rule tree
            </h3>
            <div className="mt-3 overflow-x-auto">
              <RuleTreeView node={spec.eligibility} />
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Workflow
            </h3>
            <ol className="mt-3 space-y-3">
              {spec.workflow.map((w, i) => (
                <li key={w.id} className="flex gap-3">
                  <span className="font-mono text-[12px] text-ink-faint">{i + 1}</span>
                  <div>
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      {w.title}
                      <Badge tone={w.kind === "automatic" ? "primary" : "warn"}>{w.kind}</Badge>
                    </div>
                    {w.description ? (
                      <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{w.description}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
              Source document
            </h3>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-soft">
              {version.sourceText}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { ApplicationForm } from "@/components/application-form";
import { Badge, PageHeader } from "@/components/ui";
import { getDeployedVersion } from "@/db/db";

export const dynamic = "force-dynamic";

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ deployed?: string }>;
}) {
  const params = await searchParams;
  const version = getDeployedVersion();

  if (!version) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <p className="text-ink-soft">
          No service is deployed yet.{" "}
          <Link href="/studio" className="font-semibold text-primary">
            Compile and deploy a policy in the Studio →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      {params.deployed ? (
        <div className="mb-6 rounded-lg border border-ok bg-ok-soft px-4 py-3 text-[13px] font-medium text-ok">
          Service deployed from policy revision {params.deployed}. The form below
          was regenerated from the new specification — no code was changed.
        </div>
      ) : null}
      <PageHeader
        eyebrow="Generated citizen service"
        title={version.spec.title}
        description={version.spec.description}
      />
      <div className="mb-8 flex flex-wrap gap-2">
        <Badge tone="primary">policy revision {version.spec.versionLabel}</Badge>
        <Badge tone="neutral">generated from specification v{version.id}</Badge>
        <Badge tone="accent">synthetic demonstration</Badge>
      </div>
      <ApplicationForm spec={version.spec} />
    </div>
  );
}

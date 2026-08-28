"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { compilePolicy } from "@/core/compiler/compile";
import { extractPolicyText } from "@/core/compiler/extract-text";
import { coerceValues, missingRequiredFields } from "@/core/formgen/formgen";
import {
  PolicySpec,
  RuleNode,
  collectConditions,
  reviewableElements,
} from "@/core/schema/spec";
import {
  decideAndInsert,
  deployVersion,
  getDeployedVersion,
  getPolicyVersion,
  insertPolicyVersion,
  listPolicyVersions,
  setCaseworkerDecision,
  updateSpec,
} from "@/db/db";

// ---------------------------------------------------------------------------
// Policy Studio
// ---------------------------------------------------------------------------

function readSamplePolicy(year: "2025" | "2026"): string {
  return fs.readFileSync(
    path.join(process.cwd(), "data", "policies", `scholarship-${year}.md`),
    "utf-8",
  );
}

export async function compilePolicyAction(formData: FormData): Promise<void> {
  const sample = formData.get("sample") as string | null;
  const file = formData.get("file") as File | null;

  let sourceText: string;
  if (file && file.size > 0) {
    sourceText = await extractPolicyText(file);
  } else if (sample === "2025" || sample === "2026") {
    sourceText = readSamplePolicy(sample);
  } else {
    redirect("/studio");
  }

  // Give the compiler the most recently compiled version of this policy (if
  // any) so it reuses field keys for unchanged concepts — that continuity is
  // what lets the diff tool match conditions across revisions instead of
  // reading a renamed-but-identical field as "removed" + "added".
  const priorSpec = listPolicyVersions().at(-1)?.spec;
  const result = await compilePolicy(sourceText, priorSpec);
  const id = insertPolicyVersion({
    spec: result.spec,
    sourceText,
    status: "draft",
    compiledBy: result.compiledBy,
  });
  redirect(`/studio/review?v=${id}&compiledBy=${result.compiledBy}`);
}

function mutateCondition(
  node: RuleNode,
  id: string,
  fn: (c: Extract<RuleNode, { type: "condition" }>) => void,
): boolean {
  if (node.type === "condition") {
    if (node.id !== id) return false;
    fn(node);
    return true;
  }
  return node.children.some((c) => mutateCondition(c, id, fn));
}

export async function reviewElementAction(formData: FormData): Promise<void> {
  const versionId = Number(formData.get("versionId"));
  const elementId = String(formData.get("elementId"));
  const kind = String(formData.get("kind")); // condition | document | exception
  const status = String(formData.get("status")) as
    | "approved"
    | "rejected"
    | "edited"
    | "pending";
  const newValue = formData.get("newValue") as string | null;

  const version = getPolicyVersion(versionId);
  if (!version) return;
  const spec: PolicySpec = JSON.parse(JSON.stringify(version.spec));

  if (kind === "condition") {
    mutateCondition(spec.eligibility, elementId, (c) => {
      if (status === "edited" && newValue !== null && newValue !== "") {
        c.value = typeof c.value === "number" ? Number(newValue) : newValue;
      }
      c.status = status;
    });
  } else if (kind === "document") {
    const doc = spec.documents.find((d) => d.id === elementId);
    if (doc) doc.status = status;
  } else if (kind === "exception") {
    const exc = spec.exceptions.find((e) => e.id === elementId);
    if (exc) exc.status = status;
  }

  updateSpec(versionId, spec);
  revalidatePath("/studio/review");
}

export async function approveAllAction(formData: FormData): Promise<void> {
  const versionId = Number(formData.get("versionId"));
  const version = getPolicyVersion(versionId);
  if (!version) return;
  const spec: PolicySpec = JSON.parse(JSON.stringify(version.spec));
  for (const c of collectConditions(spec.eligibility)) {
    if (c.status === "pending") c.status = "approved";
  }
  for (const d of spec.documents) if (d.status === "pending") d.status = "approved";
  for (const e of spec.exceptions) if (e.status === "pending") e.status = "approved";
  updateSpec(versionId, spec);
  revalidatePath("/studio/review");
}

export async function deployAction(formData: FormData): Promise<void> {
  const versionId = Number(formData.get("versionId"));
  const version = getPolicyVersion(versionId);
  if (!version) return;
  const unresolved = reviewableElements(version.spec).filter(
    (e) => e.status === "pending" || e.status === "rejected",
  );
  if (unresolved.length > 0) {
    redirect(`/studio/review?v=${versionId}&error=unresolved`);
  }
  deployVersion(versionId);
  revalidatePath("/", "layout");
  redirect(`/service?deployed=${version.spec.versionLabel}`);
}

// ---------------------------------------------------------------------------
// Citizen service
// ---------------------------------------------------------------------------

export async function submitApplicationAction(formData: FormData): Promise<void> {
  const version = getDeployedVersion();
  if (!version) redirect("/studio");

  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value;
  }
  const data = coerceValues(version.spec, raw);
  const missing = missingRequiredFields(version.spec, data);
  // Boolean document checkboxes legitimately submit as absent when unchecked.
  for (const f of missing) {
    if (f.type === "boolean") data[f.key] = false;
  }

  const { id } = decideAndInsert(version.spec, version.id, data);
  revalidatePath("/caseworker");
  redirect(`/service/result/${id}`);
}

// ---------------------------------------------------------------------------
// Caseworker
// ---------------------------------------------------------------------------

export async function caseworkerDecideAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("applicationId"));
  const status = String(formData.get("status")) as "approved" | "rejected";
  const note = (formData.get("note") as string | null) || null;
  setCaseworkerDecision(id, status, note);
  revalidatePath("/caseworker");
  redirect("/caseworker");
}

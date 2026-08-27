import { Applicant, Decision, evaluate } from "../engine/evaluate";
import { PolicySpec } from "../schema/spec";

/**
 * Real impact analysis: every application is evaluated against BOTH policy
 * versions by the deterministic engine, and the results are compared.
 * Nothing here is estimated or faked — every headline number is a count
 * over actual per-application decision pairs.
 */

export type ImpactCategory =
  | "newly_eligible"
  | "newly_ineligible"
  | "still_eligible"
  | "still_ineligible";

export interface ImpactRow {
  /** Caller-supplied identifier for the application. */
  id: string;
  applicant: Applicant;
  before: Decision;
  after: Decision;
  category: ImpactCategory;
  /** Fields whose condition outcome flipped between versions. */
  changedFields: string[];
  /** Documents newly required (and not provided) under the new version. */
  newlyMissingDocuments: string[];
}

export interface CauseCount {
  field: string;
  label: string;
  count: number;
}

export interface ImpactReport {
  total: number;
  affected: number;
  newlyEligible: number;
  newlyIneligible: number;
  stillEligible: number;
  stillIneligible: number;
  /** Applications needing additional review under the new version. */
  additionalReview: number;
  causesNewlyEligible: CauseCount[];
  causesNewlyIneligible: CauseCount[];
  rows: ImpactRow[];
}

function conditionOutcomes(d: Decision): Map<string, { passed: boolean; label: string }> {
  const map = new Map<string, { passed: boolean; label: string }>();
  for (const c of [...d.passedConditions, ...d.failedConditions]) {
    map.set(c.field, { passed: c.passed, label: c.label });
  }
  return map;
}

export function analyseApplication(
  id: string,
  applicant: Applicant,
  specBefore: PolicySpec,
  specAfter: PolicySpec,
): ImpactRow {
  const before = evaluate(specBefore, applicant);
  const after = evaluate(specAfter, applicant);

  const category: ImpactCategory =
    before.eligible && after.eligible
      ? "still_eligible"
      : !before.eligible && after.eligible
        ? "newly_eligible"
        : before.eligible && !after.eligible
          ? "newly_ineligible"
          : "still_ineligible";

  // A field counts as a cause only when its outcome change points in the
  // direction of the overall flip: for a newly eligible applicant, conditions
  // that now pass and previously failed (or are new and pass); for a newly
  // ineligible applicant, conditions that previously passed and now fail
  // (or were removed while passing). A brand-new condition that fails inside
  // an OR group is not blamed for anything.
  const beforeOutcomes = conditionOutcomes(before);
  const afterOutcomes = conditionOutcomes(after);
  const changedFields: string[] = [];
  if (category === "newly_eligible") {
    for (const [field, o] of afterOutcomes) {
      const prev = beforeOutcomes.get(field);
      if (o.passed && (!prev || !prev.passed)) changedFields.push(field);
    }
  } else if (category === "newly_ineligible") {
    for (const [field, prev] of beforeOutcomes) {
      const o = afterOutcomes.get(field);
      if (prev.passed && (!o || !o.passed)) changedFields.push(field);
    }
  } else {
    for (const [field, o] of afterOutcomes) {
      const prev = beforeOutcomes.get(field);
      if (prev && prev.passed !== o.passed) changedFields.push(field);
    }
  }

  const beforeMissing = new Set(before.missingDocuments.map((d) => d.id));
  const newlyMissingDocuments = after.missingDocuments
    .filter((d) => !beforeMissing.has(d.id))
    .map((d) => d.id);

  return { id, applicant, before, after, category, changedFields, newlyMissingDocuments };
}

export function runImpact(
  applications: { id: string; data: Applicant }[],
  specBefore: PolicySpec,
  specAfter: PolicySpec,
): ImpactReport {
  const rows = applications.map((a) =>
    analyseApplication(a.id, a.data, specBefore, specAfter),
  );

  const byCategory = (c: ImpactCategory) =>
    rows.filter((r) => r.category === c);

  const countCauses = (subset: ImpactRow[]): CauseCount[] => {
    const counts = new Map<string, CauseCount>();
    for (const row of subset) {
      for (const field of row.changedFields) {
        const cond =
          [...row.after.passedConditions, ...row.after.failedConditions].find(
            (c) => c.field === field,
          ) ??
          [...row.before.passedConditions, ...row.before.failedConditions].find(
            (c) => c.field === field,
          );
        if (!cond) continue;
        const existing = counts.get(field);
        if (existing) existing.count += 1;
        else counts.set(field, { field, label: cond.label, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  };

  const newlyEligible = byCategory("newly_eligible");
  const newlyIneligible = byCategory("newly_ineligible");
  const additionalReview = rows.filter(
    (r) =>
      r.after.eligible &&
      (r.newlyMissingDocuments.length > 0 ||
        (r.category === "newly_eligible" && r.after.manualReviewRequired)),
  ).length;

  return {
    total: rows.length,
    affected: newlyEligible.length + newlyIneligible.length,
    newlyEligible: newlyEligible.length,
    newlyIneligible: newlyIneligible.length,
    stillEligible: byCategory("still_eligible").length,
    stillIneligible: byCategory("still_ineligible").length,
    additionalReview,
    causesNewlyEligible: countCauses(newlyEligible),
    causesNewlyIneligible: countCauses(newlyIneligible),
    rows,
  };
}

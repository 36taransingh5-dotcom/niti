import { describe, expect, it } from "vitest";
import { diffSpecs } from "../diff/diff";
import { runImpact } from "../impact/impact";
import { generateApplications } from "../synth/generate";
import { scholarship2025 } from "../fixtures/scholarship2025";
import { scholarship2026 } from "../fixtures/scholarship2026";

describe("diffSpecs 2025 → 2026", () => {
  const diff = diffSpecs(scholarship2025, scholarship2026);

  it("detects the age threshold change 18 → 21", () => {
    const change = diff.changes.find(
      (c) => c.type === "threshold_changed" && c.field === "age",
    );
    expect(change).toMatchObject({ from: 18, to: 21 });
  });

  it("detects the income threshold change 3L → 3.5L", () => {
    const change = diff.changes.find(
      (c) => c.type === "threshold_changed" && c.field === "annualHouseholdIncome",
    );
    expect(change).toMatchObject({ from: 300000, to: 350000 });
  });

  it("detects diploma added to eligible courses", () => {
    const change = diff.changes.find((c) => c.type === "options_changed");
    expect(change).toMatchObject({ field: "courseLevel", added: ["diploma"], removed: [] });
  });

  it("reports the disability exemption as an exception, not a bare condition", () => {
    expect(
      diff.changes.find((c) => c.type === "exception_added"),
    ).toMatchObject({ id: "exc-disability-income" });
    expect(
      diff.changes.find(
        (c) => c.type === "condition_added" && c.field === "hasDisabilityCertificate",
      ),
    ).toBeUndefined();
  });

  it("detects the new disability certificate document", () => {
    expect(
      diff.changes.find((c) => c.type === "document_added"),
    ).toMatchObject({ id: "disability" });
  });

  it("a spec diffed against itself is empty", () => {
    expect(diffSpecs(scholarship2025, scholarship2025).changes).toHaveLength(0);
  });
});

describe("impact analysis over the synthetic dataset", () => {
  const apps = generateApplications().map((a) => ({ id: a.appNumber, data: a.data }));
  const report = runImpact(apps, scholarship2025, scholarship2026);

  it("is deterministic for a fixed seed", () => {
    const again = runImpact(
      generateApplications().map((a) => ({ id: a.appNumber, data: a.data })),
      scholarship2025,
      scholarship2026,
    );
    expect(again.newlyEligible).toBe(report.newlyEligible);
    expect(again.newlyIneligible).toBe(report.newlyIneligible);
  });

  it("categories partition the dataset", () => {
    expect(
      report.newlyEligible +
        report.newlyIneligible +
        report.stillEligible +
        report.stillIneligible,
    ).toBe(report.total);
    expect(report.total).toBe(1500);
  });

  it("produces a meaningful spread in every category", () => {
    expect(report.newlyEligible).toBeGreaterThan(50);
    expect(report.newlyIneligible).toBeGreaterThan(50);
    expect(report.stillEligible).toBeGreaterThan(100);
    expect(report.stillIneligible).toBeGreaterThan(100);
  });

  it("every newly eligible row genuinely flips under the engine", () => {
    for (const row of report.rows.filter((r) => r.category === "newly_eligible")) {
      expect(row.before.eligible).toBe(false);
      expect(row.after.eligible).toBe(true);
      expect(row.changedFields.length).toBeGreaterThan(0);
    }
  });

  it("attributes causes to real conditions", () => {
    const fields = report.causesNewlyEligible.map((c) => c.field);
    expect(fields).toContain("annualHouseholdIncome");
    expect(fields).toContain("courseLevel");
    expect(report.causesNewlyIneligible.map((c) => c.field)).toContain("age");
  });
});

describe("structural diff (audit regressions)", () => {
  const prov = { sourceQuote: "q", sourceSection: "1", confidence: 0.9, status: "approved" as const };
  const cond = (id: string, field: string, operator: string, value: unknown) =>
    ({ type: "condition", id, field, operator, value, label: id, ...prov }) as never;
  const withTree = (tree: unknown) =>
    ({ ...scholarship2025, eligibility: tree }) as typeof scholarship2025;

  it("keeps two conditions on the same field distinct (a range)", () => {
    const range = (lo: number, hi: number) =>
      withTree({
        type: "group", id: "r", operator: "AND",
        children: [cond("lo", "age", ">=", lo), cond("hi", "age", "<=", hi)],
      });
    const changes = diffSpecs(range(18, 30), range(21, 65)).changes;
    // Both bounds moved; a field-keyed diff would only ever report the first.
    expect(changes.filter((c) => c.type === "threshold_changed")).toHaveLength(2);
    expect(changes).toContainEqual(expect.objectContaining({ from: 18, to: 21 }));
    expect(changes).toContainEqual(expect.objectContaining({ from: 30, to: 65 }));
  });

  it("detects a group flipping AND to OR even though no value changes", () => {
    const grp = (operator: string) =>
      withTree({
        type: "group", id: "r", operator,
        children: [cond("a", "age", ">=", 18), cond("b", "enrolled", "==", true)],
      });
    const changes = diffSpecs(grp("AND"), grp("OR")).changes;
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "structure_changed", from: "AND", to: "OR" }),
    );
  });

  it("never reports zero changes while the engine flips real decisions", () => {
    const grp = (operator: string) =>
      withTree({
        type: "group", id: "r", operator,
        children: [cond("a", "age", ">=", 18), cond("b", "enrolled", "==", true)],
      });
    const apps = generateApplications(300).map((a) => ({ id: a.appNumber, data: a.data }));
    const report = runImpact(apps, grp("AND"), grp("OR"));
    const changes = diffSpecs(grp("AND"), grp("OR")).changes;
    expect(report.affected).toBeGreaterThan(0);
    expect(changes.length).toBeGreaterThan(0);
  });
});

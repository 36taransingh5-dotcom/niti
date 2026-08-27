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

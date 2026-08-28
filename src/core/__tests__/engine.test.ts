import { describe, expect, it } from "vitest";
import { evaluate, evaluateNode } from "../engine/evaluate";
import { RuleNode, PolicySpec } from "../schema/spec";
import { scholarship2025 } from "../fixtures/scholarship2025";
import { scholarship2026 } from "../fixtures/scholarship2026";
import { compilePolicy, verifiedFixtureFor } from "../compiler/compile";

const prov = {
  sourceQuote: "q",
  sourceSection: "1",
  confidence: 0.9,
  status: "approved" as const,
};

const cond = (
  field: string,
  operator: RuleNode extends never ? never : "==" | "!=" | ">" | ">=" | "<" | "<=" | "IN" | "EXISTS",
  value: unknown,
): RuleNode => ({
  type: "condition",
  id: `c-${field}-${operator}`,
  field,
  operator,
  value: value as never,
  label: field,
  ...prov,
});

describe("evaluateNode operators", () => {
  it("handles numeric comparisons", () => {
    expect(evaluateNode(cond("age", ">=", 18), { age: 18 }).passed).toBe(true);
    expect(evaluateNode(cond("age", ">=", 18), { age: 17 }).passed).toBe(false);
    expect(evaluateNode(cond("age", ">", 18), { age: 18 }).passed).toBe(false);
    expect(evaluateNode(cond("income", "<", 300000), { income: 299999 }).passed).toBe(true);
    expect(evaluateNode(cond("income", "<=", 300000), { income: 300000 }).passed).toBe(true);
  });

  it("fails numeric comparisons on missing or non-numeric values", () => {
    expect(evaluateNode(cond("age", ">=", 18), {}).passed).toBe(false);
    expect(evaluateNode(cond("age", ">=", 18), { age: "18" }).passed).toBe(false);
  });

  it("handles equality, IN and EXISTS", () => {
    expect(evaluateNode(cond("x", "==", true), { x: true }).passed).toBe(true);
    expect(evaluateNode(cond("x", "!=", "a"), { x: "b" }).passed).toBe(true);
    expect(evaluateNode(cond("c", "IN", ["ug", "pg"]), { c: "ug" }).passed).toBe(true);
    expect(evaluateNode(cond("c", "IN", ["ug", "pg"]), { c: "diploma" }).passed).toBe(false);
    expect(evaluateNode(cond("id", "EXISTS", null), { id: "A1" }).passed).toBe(true);
    expect(evaluateNode(cond("id", "EXISTS", null), { id: "" }).passed).toBe(false);
    expect(evaluateNode(cond("id", "EXISTS", null), {}).passed).toBe(false);
  });

  it("handles AND / OR / NOT groups recursively", () => {
    const tree: RuleNode = {
      type: "group",
      id: "g1",
      operator: "AND",
      children: [
        cond("age", ">=", 18),
        {
          type: "group",
          id: "g2",
          operator: "OR",
          children: [cond("income", "<", 300000), cond("disabled", "==", true)],
        },
        {
          type: "group",
          id: "g3",
          operator: "NOT",
          children: [cond("banned", "==", true)],
        },
      ],
    };
    expect(evaluateNode(tree, { age: 20, income: 500000, disabled: true }).passed).toBe(true);
    expect(evaluateNode(tree, { age: 20, income: 500000, disabled: false }).passed).toBe(false);
    expect(
      evaluateNode(tree, { age: 20, income: 100000, banned: true }).passed,
    ).toBe(false);
  });
});

describe("fixtures validate against the spec schema", () => {
  it("2025 and 2026 specs parse", () => {
    expect(() => PolicySpec.parse(scholarship2025)).not.toThrow();
    expect(() => PolicySpec.parse(scholarship2026)).not.toThrow();
  });
});

describe("full decisions against the 2025 policy", () => {
  const base = {
    fullName: "Test Applicant",
    age: 20,
    state: "KA",
    hasDisabilityCertificate: false,
    enrolled: true,
    institutionType: "government",
    courseLevel: "undergraduate",
    yearOfStudy: 2,
    annualHouseholdIncome: 250000,
    doc_identity: true,
    doc_address: true,
    doc_income: true,
    doc_enrolment: true,
  };

  it("accepts an eligible applicant, routing to manual review", () => {
    const d = evaluate(scholarship2025, base);
    expect(d.eligible).toBe(true);
    // Income + enrolment certificates always need caseworker verification.
    expect(d.outcome).toBe("eligible_pending_review");
    expect(d.failedConditions).toHaveLength(0);
    expect(d.passedConditions).toHaveLength(4);
  });

  it("rejects on income with a traceable explanation", () => {
    const d = evaluate(scholarship2025, { ...base, annualHouseholdIncome: 340000 });
    expect(d.eligible).toBe(false);
    expect(d.failedConditions.map((c) => c.field)).toEqual(["annualHouseholdIncome"]);
    const failExp = d.explanations.find((e) => e.kind === "fail");
    expect(failExp?.sectionRef).toBe("Section 3.2");
    expect(failExp?.message).toContain("₹3,40,000");
    expect(failExp?.message).toContain("₹3,00,000");
  });

  it("2025 has no disability exemption; 2026 does", () => {
    const applicant = {
      ...base,
      age: 22,
      annualHouseholdIncome: 400000,
      hasDisabilityCertificate: true,
      doc_disability: true,
    };
    expect(evaluate(scholarship2025, applicant).eligible).toBe(false);
    expect(evaluate(scholarship2026, applicant).eligible).toBe(true);
  });

  it("2026 raises the minimum age to 21", () => {
    const applicant = { ...base, age: 19 };
    expect(evaluate(scholarship2025, applicant).eligible).toBe(true);
    expect(evaluate(scholarship2026, applicant).eligible).toBe(false);
  });

  it("flags missing required documents", () => {
    const d = evaluate(scholarship2025, { ...base, doc_enrolment: false });
    expect(d.eligible).toBe(true);
    expect(d.missingDocuments.map((m) => m.id)).toEqual(["enrolment"]);
    expect(d.manualReviewRequired).toBe(true);
  });

  it("only requires the disability certificate when the exemption is claimed", () => {
    const noDisability = evaluate(scholarship2026, { ...base, age: 22 });
    expect(noDisability.documents.find((d) => d.id === "disability")?.required).toBe(false);
    const withDisability = evaluate(scholarship2026, {
      ...base,
      age: 22,
      hasDisabilityCertificate: true,
      doc_disability: false,
    });
    expect(withDisability.documents.find((d) => d.id === "disability")?.required).toBe(true);
    expect(withDisability.missingDocuments.map((m) => m.id)).toContain("disability");
  });
});

describe("operators against absent data (audit regressions)", () => {
  it("'!=' does not treat missing data as satisfying the rule", () => {
    // undefined !== "revoked" is true in JS; an eligibility engine must not
    // grant a pass to an applicant who never answered.
    expect(evaluateNode(cond("status", "!=", "revoked"), {}).passed).toBe(false);
    expect(evaluateNode(cond("status", "!=", "revoked"), { status: "" }).passed).toBe(false);
    expect(evaluateNode(cond("status", "!=", "revoked"), { status: "active" }).passed).toBe(true);
    expect(evaluateNode(cond("status", "!=", "revoked"), { status: "revoked" }).passed).toBe(false);
  });

  it("NOT evaluates every child, not just the first", () => {
    const tree: RuleNode = {
      type: "group",
      id: "n",
      operator: "NOT",
      children: [cond("a", "==", true), cond("b", "==", true)],
    };
    // NOT(a AND b): both true -> false; any false -> true.
    expect(evaluateNode(tree, { a: true, b: true }).passed).toBe(false);
    expect(evaluateNode(tree, { a: true, b: false }).passed).toBe(true);
    expect(evaluateNode(tree, { a: false, b: true }).passed).toBe(true);
  });
});

describe("compiler never fabricates a specification", () => {
  it("refuses an unrelated document instead of returning a scholarship spec", async () => {
    expect(verifiedFixtureFor("MATERNITY BENEFIT SCHEME — 26 weeks paid leave")).toBeUndefined();
    // No API key is configured in the test environment.
    const result = await compilePolicy("MATERNITY BENEFIT SCHEME — 26 weeks paid leave");
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("spec");
  });

  it("returns the pre-verified compilation for a bundled demonstration policy", () => {
    const text = "National Merit Support Scholarship — Scheme Guidelines (2026 Revision)";
    expect(verifiedFixtureFor(text)?.versionLabel).toBe("2026");
  });
});

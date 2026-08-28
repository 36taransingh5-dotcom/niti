import {
  ConditionNode,
  DocumentRequirement,
  PolicySpec,
  RuleNode,
  isCondition,
} from "../schema/spec";

/**
 * The NITI deterministic rules engine.
 *
 * Pure functions only. No AI, no I/O, no framework imports. Every decision
 * is a full trace: which rules ran, what the applicant's value was, what the
 * policy required, and which policy section each rule cites.
 */

export type Applicant = Record<string, unknown>;

export interface ConditionResult {
  kind: "condition";
  nodeId: string;
  label: string;
  field: string;
  operator: string;
  expected: unknown;
  /** The applicant's actual value for the field (undefined if absent). */
  actual: unknown;
  passed: boolean;
  sourceSection: string;
  sourceQuote: string;
}

export interface GroupResult {
  kind: "group";
  nodeId: string;
  operator: string;
  label?: string;
  passed: boolean;
  children: NodeResult[];
}

export type NodeResult = ConditionResult | GroupResult;

export interface DocumentResult {
  id: string;
  label: string;
  required: boolean;
  /** Applicant-declared submission state for this document. */
  provided: boolean;
  requiresManualReview: boolean;
  sourceSection: string;
}

export type DecisionOutcome =
  | "eligible_pending_review"
  | "eligible"
  | "ineligible";

export interface Explanation {
  kind: "pass" | "fail" | "review";
  message: string;
  sectionRef: string;
}

export interface Decision {
  eligible: boolean;
  outcome: DecisionOutcome;
  trace: NodeResult;
  passedConditions: ConditionResult[];
  failedConditions: ConditionResult[];
  documents: DocumentResult[];
  missingDocuments: DocumentResult[];
  manualReviewRequired: boolean;
  explanations: Explanation[];
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/** True when the applicant supplied no usable value for a field. */
function isAbsent(actual: unknown): boolean {
  return actual === undefined || actual === null || actual === "";
}

function compare(node: ConditionNode, actual: unknown): boolean {
  const { operator, value } = node;
  switch (operator) {
    case "EXISTS":
      return !isAbsent(actual);
    case "==":
      return actual === value;
    case "!=":
      // Absent data must not satisfy a not-equals rule. `undefined !== x` is
      // true in JavaScript, which would silently grant eligibility to an
      // applicant who simply never answered the question.
      return !isAbsent(actual) && actual !== value;
    case "IN":
      return (
        Array.isArray(value) &&
        (value as unknown[]).includes(actual as string | number)
      );
    case ">":
    case ">=":
    case "<":
    case "<=": {
      if (typeof actual !== "number" || typeof value !== "number") return false;
      if (operator === ">") return actual > value;
      if (operator === ">=") return actual >= value;
      if (operator === "<") return actual < value;
      return actual <= value;
    }
  }
}

export function evaluateNode(node: RuleNode, applicant: Applicant): NodeResult {
  if (isCondition(node)) {
    const actual = applicant[node.field];
    return {
      kind: "condition",
      nodeId: node.id,
      label: node.label,
      field: node.field,
      operator: node.operator,
      expected: node.value,
      actual,
      passed: compare(node, actual),
      sourceSection: node.sourceSection,
      sourceQuote: node.sourceQuote,
    };
  }

  const children = node.children.map((c) => evaluateNode(c, applicant));
  let passed: boolean;
  switch (node.operator) {
    case "AND":
      passed = children.every((c) => c.passed);
      break;
    case "OR":
      passed = children.some((c) => c.passed);
      break;
    case "NOT":
      // NOT negates the conjunction of its children, so a NOT group with more
      // than one child is still evaluated in full rather than silently
      // dropping everything after the first.
      passed = !children.every((c) => c.passed);
      break;
  }
  return {
    kind: "group",
    nodeId: node.id,
    operator: node.operator,
    label: node.label,
    passed,
    children,
  };
}

export function flattenConditions(result: NodeResult): ConditionResult[] {
  if (result.kind === "condition") return [result];
  return result.children.flatMap(flattenConditions);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function evaluateDocument(
  doc: DocumentRequirement,
  applicant: Applicant,
): DocumentResult {
  const required = doc.requiredWhen
    ? evaluateNode(doc.requiredWhen, applicant).passed
    : true;
  const provided = applicant[`doc_${doc.id}`] === true;
  return {
    id: doc.id,
    label: doc.label,
    required,
    provided,
    requiresManualReview: doc.requiresManualReview,
    sourceSection: doc.sourceSection,
  };
}

// ---------------------------------------------------------------------------
// Full decision
// ---------------------------------------------------------------------------

function formatValue(v: unknown): string {
  if (typeof v === "number") return v >= 1000 ? `₹${v.toLocaleString("en-IN")}` : String(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.join(", ");
  if (v === undefined || v === null || v === "") return "not provided";
  return String(v);
}

function explainCondition(c: ConditionResult): Explanation {
  const section = `Section ${c.sourceSection}`;
  if (c.passed) {
    return {
      kind: "pass",
      message: `${c.label} — satisfied (your value: ${formatValue(c.actual)}).`,
      sectionRef: section,
    };
  }
  const req =
    c.operator === "EXISTS"
      ? "a value is required"
      : `policy requires ${c.operator} ${formatValue(c.expected)}`;
  return {
    kind: "fail",
    message: `${c.label} — not met. Your value: ${formatValue(c.actual)}; ${req}.`,
    sectionRef: section,
  };
}

export function evaluate(spec: PolicySpec, applicant: Applicant): Decision {
  const trace = evaluateNode(spec.eligibility, applicant);
  const conditions = flattenConditions(trace);
  const passedConditions = conditions.filter((c) => c.passed);
  const failedConditions = conditions.filter((c) => !c.passed);

  const documents = spec.documents.map((d) => evaluateDocument(d, applicant));
  const requiredDocs = documents.filter((d) => d.required);
  const missingDocuments = requiredDocs.filter((d) => !d.provided);
  const reviewDocs = requiredDocs.filter(
    (d) => d.provided && d.requiresManualReview,
  );

  const eligible = trace.passed;
  const manualReviewRequired = eligible && (reviewDocs.length > 0 || missingDocuments.length > 0);

  const explanations: Explanation[] = conditions.map(explainCondition);
  for (const d of missingDocuments) {
    explanations.push({
      kind: "review",
      message: `${d.label} has not been submitted and is required.`,
      sectionRef: `Section ${d.sourceSection}`,
    });
  }
  for (const d of reviewDocs) {
    explanations.push({
      kind: "review",
      message: `${d.label} will be verified by a caseworker.`,
      sectionRef: `Section ${d.sourceSection}`,
    });
  }

  const outcome: DecisionOutcome = !eligible
    ? "ineligible"
    : manualReviewRequired
      ? "eligible_pending_review"
      : "eligible";

  return {
    eligible,
    outcome,
    trace,
    passedConditions,
    failedConditions,
    documents,
    missingDocuments,
    manualReviewRequired,
    explanations,
  };
}

/** The subset of a Decision the citizen result page actually renders. */
export type ResultViewDecision = Pick<Decision, "outcome" | "explanations"> & {
  trace: NodeResult;
};

/**
 * Strips sourceQuote (unused by any renderer of a trace, only ever the
 * bulkiest field on it) from every condition in a trace tree. Used to keep
 * the cookie-based fallback in /service/result well under the ~4KB per-
 * cookie limit — see the comment in submitApplicationAction.
 */
export function stripTraceQuotes(node: NodeResult): NodeResult {
  if (node.kind === "condition") {
    const { sourceQuote: _sourceQuote, ...rest } = node;
    return rest as NodeResult;
  }
  return { ...node, children: node.children.map(stripTraceQuotes) };
}

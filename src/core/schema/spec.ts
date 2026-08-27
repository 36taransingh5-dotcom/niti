import { z } from "zod";

/**
 * The NITI Policy Specification.
 *
 * This is the machine-readable artifact produced by the AI compiler and
 * validated by a human. Everything downstream — the rules engine, the
 * generated citizen form, the caseworker dashboard, policy diffing and
 * impact analysis — consumes only this specification. No policy logic
 * may live anywhere else.
 */

// ---------------------------------------------------------------------------
// Rule tree
// ---------------------------------------------------------------------------

export const ComparisonOperator = z.enum([
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "IN",
  "EXISTS",
]);
export type ComparisonOperator = z.infer<typeof ComparisonOperator>;

export const GroupOperator = z.enum(["AND", "OR", "NOT"]);
export type GroupOperator = z.infer<typeof GroupOperator>;

/** Provenance + human-review metadata attached to every extracted element. */
export const Provenance = z.object({
  /** Verbatim quote from the policy document this element was derived from. */
  sourceQuote: z.string(),
  /** Section reference within the policy document, e.g. "3.2". */
  sourceSection: z.string(),
  /** Compiler confidence, 0–1. */
  confidence: z.number().min(0).max(1),
  /** Human review state. Only approved/edited elements may be deployed. */
  status: z.enum(["pending", "approved", "edited", "rejected"]).default("pending"),
});
export type Provenance = z.infer<typeof Provenance>;

const ConditionValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.null(),
]);
export type ConditionValue = z.infer<typeof ConditionValue>;

export interface ConditionNode extends Provenance {
  type: "condition";
  id: string;
  /** Applicant field this condition reads, e.g. "annualHouseholdIncome". */
  field: string;
  operator: ComparisonOperator;
  /** Comparison value. Ignored for EXISTS. */
  value: ConditionValue;
  /** Human-readable label, e.g. "Minimum age requirement". */
  label: string;
}

export interface GroupNode {
  type: "group";
  id: string;
  operator: GroupOperator;
  label?: string;
  children: RuleNode[];
}

export type RuleNode = ConditionNode | GroupNode;

export const RuleNodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    Provenance.extend({
      type: z.literal("condition"),
      id: z.string(),
      field: z.string(),
      operator: ComparisonOperator,
      value: ConditionValue,
      label: z.string(),
    }),
    z.object({
      type: z.literal("group"),
      id: z.string(),
      operator: GroupOperator,
      label: z.string().optional(),
      children: z.array(RuleNodeSchema).min(1),
    }),
  ]),
) as z.ZodType<RuleNode>;

// ---------------------------------------------------------------------------
// Applicant-facing form model
// ---------------------------------------------------------------------------

export const FieldDef = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["number", "string", "boolean", "enum"]),
  /** Options for enum fields. */
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  /** Form step this field belongs to. */
  step: z.string(),
  required: z.boolean().default(true),
  helpText: z.string().optional(),
  /** Display unit, e.g. "₹ per year". */
  unit: z.string().optional(),
  /** Only render (and only require) this field when the rule passes. */
  visibleWhen: RuleNodeSchema.optional(),
});
export type FieldDef = z.infer<typeof FieldDef>;

export const FormStep = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
});
export type FormStep = z.infer<typeof FormStep>;

// ---------------------------------------------------------------------------
// Documents & workflow
// ---------------------------------------------------------------------------

export const DocumentRequirement = Provenance.extend({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** Only required when this rule passes against the applicant. */
  requiredWhen: RuleNodeSchema.optional(),
  /** True when a caseworker must inspect the document before approval. */
  requiresManualReview: z.boolean().default(false),
});
export type DocumentRequirement = z.infer<typeof DocumentRequirement>;

export const WorkflowStep = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["automatic", "manual"]),
  description: z.string().optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;

/** A named exception surfaced by the compiler (also woven into the rule tree). */
export const PolicyException = Provenance.extend({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  /** The rule-tree node id where this exception takes effect. */
  appliesToNodeId: z.string(),
});
export type PolicyException = z.infer<typeof PolicyException>;

// ---------------------------------------------------------------------------
// The full specification
// ---------------------------------------------------------------------------

export const PolicySpec = z.object({
  specVersion: z.literal(1),
  policySlug: z.string(),
  title: z.string(),
  versionLabel: z.string(),
  description: z.string(),
  /** Always true for hackathon demo policies. */
  synthetic: z.literal(true),
  sections: z.array(z.object({ id: z.string(), title: z.string() })),
  formSteps: z.array(FormStep).min(1),
  fields: z.array(FieldDef).min(1),
  eligibility: RuleNodeSchema,
  exceptions: z.array(PolicyException),
  documents: z.array(DocumentRequirement),
  workflow: z.array(WorkflowStep).min(1),
});
export type PolicySpec = z.infer<typeof PolicySpec>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isCondition(node: RuleNode): node is ConditionNode {
  return node.type === "condition";
}

export function isGroup(node: RuleNode): node is GroupNode {
  return node.type === "group";
}

/** Depth-first list of all condition nodes in a rule tree. */
export function collectConditions(node: RuleNode): ConditionNode[] {
  if (isCondition(node)) return [node];
  return node.children.flatMap(collectConditions);
}

/** Every reviewable element of a spec (conditions, documents, exceptions). */
export function reviewableElements(spec: PolicySpec): Provenance[] {
  return [
    ...collectConditions(spec.eligibility),
    ...spec.documents,
    ...spec.exceptions,
  ];
}

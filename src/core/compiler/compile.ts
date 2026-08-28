import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import {
  PolicySpec,
  collectConditions,
} from "../schema/spec";
import { scholarship2025 } from "../fixtures/scholarship2025";
import { scholarship2026 } from "../fixtures/scholarship2026";

/**
 * The NITI AI policy compiler.
 *
 * AI is used ONCE, at compilation time, to transform a human-readable policy
 * document into a structured PolicySpec. The output is validated with Zod
 * and every extracted element starts life as status "pending" — a human
 * must approve it before the spec can be deployed.
 *
 * Supports either provider — OpenAI (OPENAI_API_KEY) or Anthropic
 * (ANTHROPIC_API_KEY) — since the compiler's job is just "produce a
 * schema-valid PolicySpec"; which model does it is an implementation detail.
 * OpenAI is tried first when both are configured.
 *
 * The demo never depends on a live API call: when no API key is configured,
 * or the call or validation fails, the compiler falls back to a verified
 * fixture compilation of the same document.
 */

export type CompileResult =
  | {
      ok: true;
      spec: PolicySpec;
      /**
       * "ai" — compiled live by a model and validated against the schema.
       * "verified-fixture" — this document IS one of the bundled demonstration
       * policies, and we returned the pre-verified compilation *of that same
       * document*. Never used for a document we did not compile from.
       */
      compiledBy: "ai" | "verified-fixture";
      note: string;
    }
  | { ok: false; note: string };

/** Reset every review status to pending — AI output is never pre-approved. */
function markPending(spec: PolicySpec): PolicySpec {
  const clone: PolicySpec = JSON.parse(JSON.stringify(spec));
  for (const c of collectConditions(clone.eligibility)) c.status = "pending";
  for (const d of clone.documents) d.status = "pending";
  for (const e of clone.exceptions) e.status = "pending";
  return clone;
}

/** Punctuation-insensitive form, so PDF/DOCX extraction artefacts still match. */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The bundled demonstration policies, each with a signature specific enough
 * that no other document can match it. Both marks must be present.
 */
const BUNDLED_POLICIES: { spec: PolicySpec; marks: string[] }[] = [
  {
    spec: scholarship2026,
    marks: ["national merit support scholarship", "2026 revision"],
  },
  {
    spec: scholarship2025,
    marks: ["national merit support scholarship", "2025 revision"],
  },
];

/**
 * Returns the pre-verified compilation of `sourceText` ONLY when that text is
 * one of the bundled demonstration policies.
 *
 * This deliberately returns undefined for anything else. An earlier version
 * keyword-sniffed and fell back to the scholarship spec for *any* input, which
 * meant an unrelated uploaded policy came back as a scholarship service whose
 * rules carried confident "source quotes" attributed to a document that never
 * contained them. Fabricating provenance is the one thing a policy compiler
 * must never do — when we cannot compile a document, we say so.
 */
export function verifiedFixtureFor(sourceText: string): PolicySpec | undefined {
  const normalized = normalizeForMatch(sourceText);
  const match = BUNDLED_POLICIES.find((p) =>
    p.marks.every((m) => normalized.includes(m)),
  );
  return match ? markPending(match.spec) : undefined;
}

const SYSTEM_PROMPT = `You are the NITI policy compiler. You transform government policy documents into a strict machine-readable specification (PolicySpec JSON) that a deterministic rules engine executes.

Rules:
- Extract eligibility conditions as a recursive rule tree (groups with AND/OR/NOT, conditions with ==, !=, >, >=, <, <=, IN, EXISTS).
- Express exceptions ("X does not apply if Y") structurally: wrap the affected condition in an OR group with the exception condition, AND list the exception in the "exceptions" array with appliesToNodeId pointing at that group.
- EVERY ConditionNode object anywhere in the output — inside "eligibility", inside a "visibleWhen", inside a "requiredWhen", anywhere — MUST include all of: type, id, field, operator, value, label, sourceQuote, sourceSection, confidence, status ("pending"). There are no exceptions to this; a condition object missing sourceQuote/sourceSection/confidence is invalid output.
- "visibleWhen" (on a field) and "requiredWhen" (on a document) are OPTIONAL and mean "this field/document is only shown/required when this OTHER condition about the applicant is true" — e.g. a disability-certificate document has requiredWhen referencing the applicant's hasDisabilityCertificate field, NOT referencing the document's own doc_disability field. Omit visibleWhen/requiredWhen entirely (do not include the key) for any field or document that is always shown/required — do NOT invent a tautological self-referencing condition like "doc_income == true" as the requiredWhen for the income document itself.
- Example of a correctly conditional document: { "id": "disability", "label": "Disability certificate", "requiresManualReview": true, "requiredWhen": { "type": "condition", "id": "req-disability-doc", "field": "hasDisabilityCertificate", "operator": "==", "value": true, "label": "Applicant holds a disability certificate", "sourceQuote": "...", "sourceSection": "4", "confidence": 0.9, "status": "pending" }, "sourceQuote": "...", "sourceSection": "4", "confidence": 0.9, "status": "pending" } — every ordinary (unconditional) document has no "requiredWhen" key at all.
- Derive applicant form fields (with steps) sufficient to evaluate every condition and document requirement. Document confirmation fields use keys "doc_<documentId>" of type boolean.
- A field's "label" names the DATA the applicant supplies, phrased as a form question or a noun ("Age", "Annual household income", "Are you currently enrolled?") — never the name of the rule that tests it ("Minimum age requirement" is a condition label, not a field label).
- Set "unit" on every numeric field that has one, and always for money: use "₹ per year" (or the appropriate period) for rupee amounts, "years" for ages, "hours" for durations. Downstream tables format numbers from this field alone, so a monetary field without a rupee unit renders as a bare number.
- Monetary values are plain numbers in rupees (₹3,00,000 → 300000).
- specVersion is 1 and synthetic is true.
- Do not invent rules that are not in the document.`;

/**
 * Compact summary of a prior compiled spec's field vocabulary, given to the
 * compiler when it is revising a policy it has compiled before. Field-name
 * continuity across revisions is what lets diffSpecs() match a condition in
 * the old version to its counterpart in the new one — without it, a
 * revision that renames nothing conceptually still reads as wholesale
 * "removed" and "added" conditions instead of a threshold change.
 */
function summarizeFieldsForContinuity(prior: PolicySpec): string {
  const conditionFields = new Map<string, string>();
  for (const c of collectConditions(prior.eligibility)) {
    if (!conditionFields.has(c.field)) conditionFields.set(c.field, c.label);
  }
  const lines = [...conditionFields.entries()].map(
    ([field, label]) => `- ${field}: "${label}"`,
  );
  const docLines = prior.documents.map((d) => `- doc_${d.id}: "${d.label}"`);
  return [...lines, ...docLines].join("\n");
}

function continuityInstruction(priorSpec?: PolicySpec): string {
  if (!priorSpec) return "";
  return `\n\nThis is a revision of a policy already compiled once before. The prior specification used these applicant field keys:\n${summarizeFieldsForContinuity(priorSpec)}\n\nFor any condition or document in the new document that represents the SAME underlying concept as one above (e.g. the same eligibility requirement with a changed threshold, or the same required document), reuse the EXACT same field key — this is what lets the two versions be diffed. Only introduce a new field key for a genuinely new concept that has no counterpart above.`;
}

async function compileWithAnthropic(
  sourceText: string,
  apiKey: string,
  priorSpec?: PolicySpec,
): Promise<PolicySpec> {
  const client = new Anthropic({ apiKey });
  const jsonSchema = z.toJSONSchema(PolicySpec, { target: "draft-7" });
  const response = await client.messages.create({
    model: process.env.NITI_COMPILER_MODEL ?? "claude-sonnet-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT + continuityInstruction(priorSpec),
    tools: [
      {
        name: "emit_policy_spec",
        description: "Emit the compiled PolicySpec for the provided policy document.",
        input_schema: jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "emit_policy_spec" },
    messages: [
      {
        role: "user",
        content: `Compile the following policy document into a PolicySpec.\n\n<policy_document>\n${sourceText}\n</policy_document>`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model returned no structured output");
  }
  return PolicySpec.parse(toolUse.input);
}

async function compileWithOpenAI(
  sourceText: string,
  apiKey: string,
  priorSpec?: PolicySpec,
): Promise<PolicySpec> {
  const client = new OpenAI({ apiKey });
  const jsonSchema = z.toJSONSchema(PolicySpec, { target: "draft-7" });
  const response = await client.chat.completions.create({
    model: process.env.NITI_OPENAI_MODEL ?? "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT + continuityInstruction(priorSpec) },
      {
        role: "user",
        content: `Compile the following policy document into a PolicySpec. Respond with a single JSON object only — no markdown code fences, no commentary — conforming to this JSON Schema:\n\n${JSON.stringify(jsonSchema)}\n\n<policy_document>\n${sourceText}\n</policy_document>`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Model returned no content");
  return PolicySpec.parse(JSON.parse(content));
}

/**
 * Fall back only to a pre-verified compilation of this *same* document.
 * If the document is not one we have verified, compilation has failed and we
 * report that rather than returning a specification for a different policy.
 */
function fallback(sourceText: string, why: string): CompileResult {
  const verified = verifiedFixtureFor(sourceText);
  if (verified) {
    return {
      ok: true,
      spec: verified,
      compiledBy: "verified-fixture",
      note: `${why} This document is a bundled demonstration policy, so NITI used its pre-verified compilation — the rules and citations below were checked against this exact document.`,
    };
  }
  return {
    ok: false,
    note: `${why} NITI cannot compile this document right now, and it will not substitute rules from a different policy. Configure an API key to compile it, or try one of the bundled demonstration policies.`,
  };
}

export async function compilePolicy(
  sourceText: string,
  priorSpec?: PolicySpec,
): Promise<CompileResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    return fallback(sourceText, "No AI provider is configured.");
  }

  const provider = openaiKey ? "OpenAI" : "Anthropic";
  try {
    const spec = openaiKey
      ? await compileWithOpenAI(sourceText, openaiKey, priorSpec)
      : await compileWithAnthropic(sourceText, anthropicKey!, priorSpec);
    return {
      ok: true,
      spec: markPending(spec),
      compiledBy: "ai",
      note: `Compiled live by the AI policy compiler (${provider}) and validated against the PolicySpec schema.`,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 120) : "unknown error";
    return fallback(sourceText, `Live compilation via ${provider} failed (${detail}).`);
  }
}

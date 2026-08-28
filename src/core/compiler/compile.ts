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

export interface CompileResult {
  spec: PolicySpec;
  compiledBy: "ai" | "fixture";
  note: string;
}

/** Reset every review status to pending — AI output is never pre-approved. */
function markPending(spec: PolicySpec): PolicySpec {
  const clone: PolicySpec = JSON.parse(JSON.stringify(spec));
  for (const c of collectConditions(clone.eligibility)) c.status = "pending";
  for (const d of clone.documents) d.status = "pending";
  for (const e of clone.exceptions) e.status = "pending";
  return clone;
}

/** Pick the verified fixture that matches the uploaded document. */
export function fixtureFor(sourceText: string): PolicySpec {
  const is2026 =
    sourceText.includes("2026") ||
    sourceText.includes("3,50,000") ||
    sourceText.toLowerCase().includes("disability exemption");
  return markPending(is2026 ? scholarship2026 : scholarship2025);
}

const SYSTEM_PROMPT = `You are the NITI policy compiler. You transform government policy documents into a strict machine-readable specification (PolicySpec JSON) that a deterministic rules engine executes.

Rules:
- Extract eligibility conditions as a recursive rule tree (groups with AND/OR/NOT, conditions with ==, !=, >, >=, <, <=, IN, EXISTS).
- Express exceptions ("X does not apply if Y") structurally: wrap the affected condition in an OR group with the exception condition, AND list the exception in the "exceptions" array with appliesToNodeId pointing at that group.
- EVERY ConditionNode object anywhere in the output — inside "eligibility", inside a "visibleWhen", inside a "requiredWhen", anywhere — MUST include all of: type, id, field, operator, value, label, sourceQuote, sourceSection, confidence, status ("pending"). There are no exceptions to this; a condition object missing sourceQuote/sourceSection/confidence is invalid output.
- "visibleWhen" (on a field) and "requiredWhen" (on a document) are OPTIONAL and mean "this field/document is only shown/required when this OTHER condition about the applicant is true" — e.g. a disability-certificate document has requiredWhen referencing the applicant's hasDisabilityCertificate field, NOT referencing the document's own doc_disability field. Omit visibleWhen/requiredWhen entirely (do not include the key) for any field or document that is always shown/required — do NOT invent a tautological self-referencing condition like "doc_income == true" as the requiredWhen for the income document itself.
- Example of a correctly conditional document: { "id": "disability", "label": "Disability certificate", "requiresManualReview": true, "requiredWhen": { "type": "condition", "id": "req-disability-doc", "field": "hasDisabilityCertificate", "operator": "==", "value": true, "label": "Applicant holds a disability certificate", "sourceQuote": "...", "sourceSection": "4", "confidence": 0.9, "status": "pending" }, "sourceQuote": "...", "sourceSection": "4", "confidence": 0.9, "status": "pending" } — every ordinary (unconditional) document has no "requiredWhen" key at all.
- Derive applicant form fields (with steps) sufficient to evaluate every condition and document requirement. Document confirmation fields use keys "doc_<documentId>" of type boolean.
- Monetary values are plain numbers in rupees (₹3,00,000 → 300000).
- specVersion is 1 and synthetic is true.
- Do not invent rules that are not in the document.`;

async function compileWithAnthropic(sourceText: string, apiKey: string): Promise<PolicySpec> {
  const client = new Anthropic({ apiKey });
  const jsonSchema = z.toJSONSchema(PolicySpec, { target: "draft-7" });
  const response = await client.messages.create({
    model: process.env.NITI_COMPILER_MODEL ?? "claude-sonnet-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
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

async function compileWithOpenAI(sourceText: string, apiKey: string): Promise<PolicySpec> {
  const client = new OpenAI({ apiKey });
  const jsonSchema = z.toJSONSchema(PolicySpec, { target: "draft-7" });
  const response = await client.chat.completions.create({
    model: process.env.NITI_OPENAI_MODEL ?? "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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

export async function compilePolicy(sourceText: string): Promise<CompileResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    return {
      spec: fixtureFor(sourceText),
      compiledBy: "fixture",
      note: "No OPENAI_API_KEY or ANTHROPIC_API_KEY configured — using the verified fixture compilation for this document.",
    };
  }

  const provider = openaiKey ? "OpenAI" : "Anthropic";
  try {
    const spec = openaiKey
      ? await compileWithOpenAI(sourceText, openaiKey)
      : await compileWithAnthropic(sourceText, anthropicKey!);
    return {
      spec: markPending(spec),
      compiledBy: "ai",
      note: `Compiled live by the AI policy compiler (${provider}) and validated against the PolicySpec schema.`,
    };
  } catch (err) {
    return {
      spec: fixtureFor(sourceText),
      compiledBy: "fixture",
      note: `Live compilation via ${provider} unavailable (${err instanceof Error ? err.message.slice(0, 120) : "error"}) — using the verified fixture compilation.`,
    };
  }
}

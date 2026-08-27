import Anthropic from "@anthropic-ai/sdk";
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
- Every condition, document, and exception must carry: a verbatim sourceQuote from the document, a sourceSection reference, a confidence between 0 and 1 reflecting how unambiguous the source text is, and status "pending".
- Derive applicant form fields (with steps) sufficient to evaluate every condition and document requirement. Document confirmation fields use keys "doc_<documentId>" of type boolean.
- Monetary values are plain numbers in rupees (₹3,00,000 → 300000).
- specVersion is 1 and synthetic is true.
- Do not invent rules that are not in the document.`;

export async function compilePolicy(sourceText: string): Promise<CompileResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      spec: fixtureFor(sourceText),
      compiledBy: "fixture",
      note: "No ANTHROPIC_API_KEY configured — using the verified fixture compilation for this document.",
    };
  }

  try {
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
    const spec = markPending(PolicySpec.parse(toolUse.input));
    return {
      spec,
      compiledBy: "ai",
      note: "Compiled live by the AI policy compiler and validated against the PolicySpec schema.",
    };
  } catch (err) {
    return {
      spec: fixtureFor(sourceText),
      compiledBy: "fixture",
      note: `Live compilation unavailable (${err instanceof Error ? err.message.slice(0, 120) : "error"}) — using the verified fixture compilation.`,
    };
  }
}

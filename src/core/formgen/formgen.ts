import { Applicant, evaluateNode } from "../engine/evaluate";
import { FieldDef, FormStep, PolicySpec } from "../schema/spec";

/**
 * Derives the citizen-facing application form from a policy specification.
 * The form is pure data: steps, fields, conditional visibility. The renderer
 * contains no service-specific logic — point it at a different spec and it
 * produces a different service.
 */

export interface GeneratedStep {
  step: FormStep;
  fields: FieldDef[];
}

/** Is this field visible given the applicant's current answers? */
export function isFieldVisible(field: FieldDef, values: Applicant): boolean {
  if (!field.visibleWhen) return true;
  return evaluateNode(field.visibleWhen, values).passed;
}

/** All steps with their fields, unfiltered (visibility applied at render time). */
export function generateForm(spec: PolicySpec): GeneratedStep[] {
  return spec.formSteps.map((step) => ({
    step,
    fields: spec.fields.filter((f) => f.step === step.id),
  }));
}

/** Fields that are visible and required but missing a value. */
export function missingRequiredFields(
  spec: PolicySpec,
  values: Applicant,
): FieldDef[] {
  return spec.fields.filter((f) => {
    if (!f.required || !isFieldVisible(f, values)) return false;
    const v = values[f.key];
    if (f.type === "boolean") return v === undefined || v === null;
    return v === undefined || v === null || v === "";
  });
}

/** Coerce raw form-string values into typed applicant data per the spec. */
export function coerceValues(
  spec: PolicySpec,
  raw: Record<string, string | undefined>,
): Applicant {
  const out: Applicant = {};
  for (const f of spec.fields) {
    const v = raw[f.key];
    if (v === undefined || v === "") continue;
    switch (f.type) {
      case "number": {
        const n = Number(v);
        if (!Number.isNaN(n)) out[f.key] = n;
        break;
      }
      case "boolean":
        out[f.key] = v === "true" || v === "on" || v === "yes";
        break;
      default:
        out[f.key] = v;
    }
  }
  return out;
}

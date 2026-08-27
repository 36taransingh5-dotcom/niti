import {
  ConditionNode,
  PolicySpec,
  collectConditions,
} from "../schema/spec";

/**
 * Structural diff between two policy specifications.
 *
 * Conditions are matched by the applicant field they read; documents and
 * exceptions by their stable ids. The output is a typed change list that
 * the UI renders and the impact analyser explains against.
 */

export type DiffChange =
  | {
      type: "threshold_changed";
      field: string;
      label: string;
      operator: string;
      from: unknown;
      to: unknown;
      fromQuote: string;
      toQuote: string;
      section: string;
    }
  | {
      type: "options_changed";
      field: string;
      label: string;
      added: (string | number)[];
      removed: (string | number)[];
      fromQuote: string;
      toQuote: string;
      section: string;
    }
  | {
      type: "condition_added" | "condition_removed";
      field: string;
      label: string;
      operator: string;
      value: unknown;
      quote: string;
      section: string;
    }
  | {
      type: "exception_added" | "exception_removed";
      id: string;
      label: string;
      description: string;
      quote: string;
      section: string;
    }
  | {
      type: "document_added" | "document_removed";
      id: string;
      label: string;
      description?: string;
      section: string;
    };

export interface PolicyDiff {
  from: { title: string; versionLabel: string };
  to: { title: string; versionLabel: string };
  changes: DiffChange[];
}

function conditionsByField(spec: PolicySpec): Map<string, ConditionNode> {
  const map = new Map<string, ConditionNode>();
  for (const c of collectConditions(spec.eligibility)) {
    // First occurrence wins; specs keep one condition per field by design.
    if (!map.has(c.field)) map.set(c.field, c);
  }
  return map;
}

/** Condition node ids that belong to an exception in the given spec. */
function exceptionConditionFields(spec: PolicySpec): Set<string> {
  const targets = new Set(spec.exceptions.map((e) => e.appliesToNodeId));
  const fields = new Set<string>();
  const walk = (node: PolicySpec["eligibility"], inException: boolean) => {
    const inside = inException || targets.has(node.id);
    if (node.type === "condition") {
      if (inside) fields.add(node.field);
      return;
    }
    for (const child of node.children) walk(child, inside);
  };
  walk(spec.eligibility, false);
  return fields;
}

export function diffSpecs(a: PolicySpec, b: PolicySpec): PolicyDiff {
  const changes: DiffChange[] = [];
  const before = conditionsByField(a);
  const after = conditionsByField(b);

  // Fields whose conditions exist only because a *new* exception introduced
  // them are reported as part of the exception, not as standalone additions.
  const oldExceptionIds = new Set(a.exceptions.map((e) => e.id));
  const newExceptions = b.exceptions.filter((e) => !oldExceptionIds.has(e.id));
  const newExceptionFields =
    newExceptions.length > 0 ? exceptionConditionFields(b) : new Set<string>();

  for (const [field, oldCond] of before) {
    const newCond = after.get(field);
    if (!newCond) {
      changes.push({
        type: "condition_removed",
        field,
        label: oldCond.label,
        operator: oldCond.operator,
        value: oldCond.value,
        quote: oldCond.sourceQuote,
        section: oldCond.sourceSection,
      });
      continue;
    }
    const bothArrays = Array.isArray(oldCond.value) && Array.isArray(newCond.value);
    if (bothArrays) {
      const oldVals = oldCond.value as (string | number)[];
      const newVals = newCond.value as (string | number)[];
      const added = newVals.filter((v) => !oldVals.includes(v));
      const removed = oldVals.filter((v) => !newVals.includes(v));
      if (added.length || removed.length) {
        changes.push({
          type: "options_changed",
          field,
          label: newCond.label,
          added,
          removed,
          fromQuote: oldCond.sourceQuote,
          toQuote: newCond.sourceQuote,
          section: newCond.sourceSection,
        });
      }
    } else if (
      oldCond.value !== newCond.value ||
      oldCond.operator !== newCond.operator
    ) {
      changes.push({
        type: "threshold_changed",
        field,
        label: newCond.label,
        operator: newCond.operator,
        from: oldCond.value,
        to: newCond.value,
        fromQuote: oldCond.sourceQuote,
        toQuote: newCond.sourceQuote,
        section: newCond.sourceSection,
      });
    }
  }

  for (const [field, newCond] of after) {
    if (before.has(field)) continue;
    if (newExceptionFields.has(field) && !exceptionConditionFields(a).has(field)) {
      continue; // reported via exception_added below
    }
    changes.push({
      type: "condition_added",
      field,
      label: newCond.label,
      operator: newCond.operator,
      value: newCond.value,
      quote: newCond.sourceQuote,
      section: newCond.sourceSection,
    });
  }

  const newExcIds = new Set(b.exceptions.map((e) => e.id));
  for (const e of newExceptions) {
    changes.push({
      type: "exception_added",
      id: e.id,
      label: e.label,
      description: e.description,
      quote: e.sourceQuote,
      section: e.sourceSection,
    });
  }
  for (const e of a.exceptions.filter((e) => !newExcIds.has(e.id))) {
    changes.push({
      type: "exception_removed",
      id: e.id,
      label: e.label,
      description: e.description,
      quote: e.sourceQuote,
      section: e.sourceSection,
    });
  }

  const oldDocs = new Map(a.documents.map((d) => [d.id, d]));
  const newDocs = new Map(b.documents.map((d) => [d.id, d]));
  for (const [id, d] of newDocs) {
    if (!oldDocs.has(id)) {
      changes.push({
        type: "document_added",
        id,
        label: d.label,
        description: d.description,
        section: d.sourceSection,
      });
    }
  }
  for (const [id, d] of oldDocs) {
    if (!newDocs.has(id)) {
      changes.push({
        type: "document_removed",
        id,
        label: d.label,
        description: d.description,
        section: d.sourceSection,
      });
    }
  }

  return {
    from: { title: a.title, versionLabel: a.versionLabel },
    to: { title: b.title, versionLabel: b.versionLabel },
    changes,
  };
}

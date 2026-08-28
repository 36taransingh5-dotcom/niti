import {
  ConditionNode,
  PolicySpec,
  RuleNode,
  collectConditions,
} from "../schema/spec";

/**
 * Structural diff between two policy specifications.
 *
 * Conditions are matched across versions by walking both rule trees and
 * pairing nodes on identity, then on (field, operator), then on field —
 * so two conditions reading the same field (a range: age >= 18 AND age <= 30)
 * stay distinct, and a change to either is reported.
 *
 * The walk also records each condition's chain of enclosing group operators,
 * which is what lets the diff see changes that alter no value at all: a group
 * flipping AND → OR, or a condition moving into an OR branch, materially
 * changes who is eligible while every threshold stays identical.
 *
 * Documents and exceptions are matched by their stable ids.
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
    }
  | {
      /**
       * The logical structure around one or more conditions changed — e.g. a
       * group flipped from AND to OR, making previously-mandatory conditions
       * alternatives. No threshold moved, but eligibility did.
       */
      type: "structure_changed";
      from: string;
      to: string;
      fields: string[];
      labels: string[];
    };

export interface PolicyDiff {
  from: { title: string; versionLabel: string };
  to: { title: string; versionLabel: string };
  changes: DiffChange[];
}

/** A condition plus the chain of group operators enclosing it. */
interface PlacedCondition {
  node: ConditionNode;
  /** e.g. ["AND"] at the root, ["AND","OR"] inside a nested OR branch. */
  chain: string[];
}

function placedConditions(spec: PolicySpec): PlacedCondition[] {
  const out: PlacedCondition[] = [];
  const walk = (node: RuleNode, chain: string[]) => {
    if (node.type === "condition") {
      out.push({ node, chain });
      return;
    }
    const next = [...chain, node.operator];
    for (const child of node.children) walk(child, next);
  };
  walk(spec.eligibility, []);
  return out;
}

/**
 * Pairs conditions across two versions without collapsing distinct conditions
 * that happen to read the same field. Tries strongest signal first: the same
 * node id, then the same (field, operator), then the same field.
 */
function pairConditions(
  before: PlacedCondition[],
  after: PlacedCondition[],
): {
  pairs: { old: PlacedCondition; new: PlacedCondition }[];
  removed: PlacedCondition[];
  added: PlacedCondition[];
} {
  const unmatchedNew = new Set(after);
  const pairs: { old: PlacedCondition; new: PlacedCondition }[] = [];
  const removed: PlacedCondition[] = [];

  const keys: ((p: PlacedCondition) => string)[] = [
    (p) => `id:${p.node.id}`,
    (p) => `fo:${p.node.field}|${p.node.operator}`,
    (p) => `f:${p.node.field}`,
  ];

  const pending = [...before];
  for (const key of keys) {
    const stillPending: PlacedCondition[] = [];
    for (const oldCond of pending) {
      const match = [...unmatchedNew].find((n) => key(n) === key(oldCond));
      if (match) {
        unmatchedNew.delete(match);
        pairs.push({ old: oldCond, new: match });
      } else {
        stillPending.push(oldCond);
      }
    }
    pending.length = 0;
    pending.push(...stillPending);
  }
  removed.push(...pending);

  return { pairs, removed, added: [...unmatchedNew] };
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
  const { pairs, removed, added } = pairConditions(
    placedConditions(a),
    placedConditions(b),
  );

  // Fields whose conditions exist only because a *new* exception introduced
  // them are reported as part of the exception, not as standalone additions.
  const oldExceptionIds = new Set(a.exceptions.map((e) => e.id));
  const newExceptions = b.exceptions.filter((e) => !oldExceptionIds.has(e.id));
  const oldExceptionFields = exceptionConditionFields(a);
  const newExceptionFields =
    newExceptions.length > 0 ? exceptionConditionFields(b) : new Set<string>();
  const introducedByNewException = (field: string) =>
    newExceptionFields.has(field) && !oldExceptionFields.has(field);

  // Group-structure moves, collapsed to one entry per distinct transition so a
  // single AND→OR flip reads as one change rather than one per condition.
  const structureMoves = new Map<string, { from: string; to: string; fields: string[]; labels: string[] }>();

  for (const { old: oldCond, new: newCond } of pairs) {
    const o = oldCond.node;
    const n = newCond.node;

    const bothArrays = Array.isArray(o.value) && Array.isArray(n.value);
    if (bothArrays) {
      const oldVals = o.value as (string | number)[];
      const newVals = n.value as (string | number)[];
      const addedVals = newVals.filter((v) => !oldVals.includes(v));
      const removedVals = oldVals.filter((v) => !newVals.includes(v));
      if (addedVals.length || removedVals.length) {
        changes.push({
          type: "options_changed",
          field: n.field,
          label: n.label,
          added: addedVals,
          removed: removedVals,
          fromQuote: o.sourceQuote,
          toQuote: n.sourceQuote,
          section: n.sourceSection,
        });
      }
    } else if (o.value !== n.value || o.operator !== n.operator) {
      changes.push({
        type: "threshold_changed",
        field: n.field,
        label: n.label,
        operator: n.operator,
        from: o.value,
        to: n.value,
        fromQuote: o.sourceQuote,
        toQuote: n.sourceQuote,
        section: n.sourceSection,
      });
    }

    // A condition whose enclosing logic changed shape. Suppressed when the new
    // shape is the OR-wrapper a newly added exception introduces — that is
    // already reported, more meaningfully, as exception_added.
    const fromChain = oldCond.chain.join(" > ");
    const toChain = newCond.chain.join(" > ");
    if (fromChain !== toChain && !introducedByNewException(n.field)) {
      const key = `${fromChain}→${toChain}`;
      const entry = structureMoves.get(key) ?? {
        from: fromChain || "(root)",
        to: toChain || "(root)",
        fields: [],
        labels: [],
      };
      entry.fields.push(n.field);
      entry.labels.push(n.label);
      structureMoves.set(key, entry);
    }
  }

  for (const move of structureMoves.values()) {
    changes.push({ type: "structure_changed", ...move });
  }

  for (const { node: oldCond } of removed) {
    changes.push({
      type: "condition_removed",
      field: oldCond.field,
      label: oldCond.label,
      operator: oldCond.operator,
      value: oldCond.value,
      quote: oldCond.sourceQuote,
      section: oldCond.sourceSection,
    });
  }

  for (const { node: newCond } of added) {
    if (introducedByNewException(newCond.field)) {
      continue; // reported via exception_added below
    }
    changes.push({
      type: "condition_added",
      field: newCond.field,
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

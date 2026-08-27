import { NodeResult } from "@/core/engine/evaluate";
import { RuleNode } from "@/core/schema/spec";
import { formatValue } from "./ui";

/** Static render of a rule tree from a spec (no applicant data). */
export function RuleTreeView({ node, depth = 0 }: { node: RuleNode; depth?: number }) {
  if (node.type === "condition") {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 py-0.5 font-mono text-[13px]">
        <span className="text-ink">{node.field}</span>
        <span className="font-semibold text-primary">{node.operator}</span>
        {node.operator !== "EXISTS" ? (
          <span className="text-accent">{formatValue(node.value)}</span>
        ) : null}
        <span className="font-sans text-[11px] text-ink-faint">§{node.sourceSection}</span>
      </div>
    );
  }
  return (
    <div className={depth > 0 ? "border-l border-line pl-4" : ""}>
      <div className="py-0.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-ink-soft">
        {node.operator}
      </div>
      {node.children.map((child) => (
        <RuleTreeView key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

/** Render of an evaluated decision trace with pass/fail marks. */
export function TraceView({ result, depth = 0 }: { result: NodeResult; depth?: number }) {
  const mark = result.passed ? (
    <span className="font-semibold text-ok">✓</span>
  ) : (
    <span className="font-semibold text-bad">✗</span>
  );

  if (result.kind === "condition") {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 py-1 text-[13px]">
        {mark}
        <span className="text-ink">{result.label}</span>
        <span className="font-mono text-[12px] text-ink-soft">
          {result.field} {result.operator}{" "}
          {result.operator !== "EXISTS" ? formatValue(result.expected) : ""}
        </span>
        <span className="font-mono text-[12px] text-ink-faint">
          · applicant: {formatValue(result.actual)}
        </span>
        <span className="text-[11px] text-ink-faint">§{result.sourceSection}</span>
      </div>
    );
  }
  return (
    <div className={depth > 0 ? "border-l border-line pl-4" : ""}>
      <div className="flex items-baseline gap-2 py-1">
        {mark}
        <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-ink-soft">
          {result.operator}
        </span>
        {result.label ? <span className="text-[12px] text-ink-faint">{result.label}</span> : null}
      </div>
      {result.children.map((child) => (
        <TraceView key={child.nodeId} result={child} depth={depth + 1} />
      ))}
    </div>
  );
}

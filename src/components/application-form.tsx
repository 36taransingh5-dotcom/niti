"use client";

import { useMemo, useState } from "react";
import { submitApplicationAction } from "@/app/actions";
import { Applicant } from "@/core/engine/evaluate";
import { generateForm, isFieldVisible } from "@/core/formgen/formgen";
import { FieldDef, PolicySpec } from "@/core/schema/spec";

/**
 * The generated citizen application form.
 *
 * Contains zero scholarship-specific logic: steps, fields, labels, options,
 * and conditional visibility are all read from the deployed PolicySpec.
 */

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const inputClass =
    "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[14px] focus:border-primary focus:outline-none";

  if (field.type === "boolean") {
    return (
      <div className="flex gap-2">
        {[
          { v: true, label: "Yes" },
          { v: false, label: "No" },
        ].map((opt) => (
          <button
            key={String(opt.v)}
            type="button"
            onClick={() => onChange(opt.v)}
            className={`rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors ${
              value === opt.v
                ? "border-primary bg-primary-soft text-primary"
                : "border-line-strong bg-surface text-ink-soft hover:border-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === "enum") {
    return (
      <select
        className={inputClass}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">Select…</option>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <div className="relative">
        <input
          type="number"
          className={inputClass}
          value={value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
        {field.unit ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-faint">
            {field.unit}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <input
      type="text"
      className={inputClass}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
}

export function ApplicationForm({ spec }: { spec: PolicySpec }) {
  const steps = useMemo(() => generateForm(spec), [spec]);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Applicant>({});
  const [touchedNext, setTouchedNext] = useState(false);

  const isReview = stepIndex === steps.length;
  const current = isReview ? null : steps[stepIndex];

  const visibleFields = (fields: FieldDef[]) =>
    fields.filter((f) => isFieldVisible(f, values));

  const stepMissing = current
    ? visibleFields(current.fields).filter((f) => {
        if (!f.required) return false;
        const v = values[f.key];
        if (f.type === "boolean") return v === undefined;
        return v === undefined || v === "";
      })
    : [];

  const goNext = () => {
    if (stepMissing.length > 0) {
      setTouchedNext(true);
      return;
    }
    setTouchedNext(false);
    setStepIndex((i) => i + 1);
  };

  return (
    <div>
      {/* Step indicator */}
      <ol className="mb-8 flex flex-wrap gap-2">
        {[...steps.map((s) => s.step.title), "Review & Submit"].map((title, i) => (
          <li
            key={title}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold ${
              i === stepIndex
                ? "border-primary bg-primary text-white"
                : i < stepIndex
                  ? "border-ok bg-ok-soft text-ok"
                  : "border-line bg-surface text-ink-faint"
            }`}
          >
            <span className="font-mono">{i + 1}</span> {title}
          </li>
        ))}
      </ol>

      {current ? (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">{current.step.title}</h2>
          {current.step.description ? (
            <p className="mt-1 text-[13px] text-ink-soft">{current.step.description}</p>
          ) : null}
          <div className="mt-6 space-y-5">
            {visibleFields(current.fields).map((f) => (
              <div key={f.key}>
                <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                  {f.label}
                  {!f.required ? (
                    <span className="ml-1 font-normal text-ink-faint">(optional)</span>
                  ) : null}
                </label>
                <FieldInput
                  field={f}
                  value={values[f.key]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                />
                {f.helpText ? (
                  <p className="mt-1 text-[12px] text-ink-faint">{f.helpText}</p>
                ) : null}
                {touchedNext && stepMissing.some((m) => m.key === f.key) ? (
                  <p className="mt-1 text-[12px] font-medium text-bad">This field is required.</p>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-between">
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
              className="rounded-lg border border-line-strong px-4 py-2 text-[13px] font-semibold text-ink-soft disabled:opacity-40"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg bg-primary px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Continue →
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Review & Submit</h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            Check your answers. On submission, your application is evaluated
            immediately by the deterministic rules engine — you will receive a
            full explanation of the result.
          </p>
          <dl className="mt-6 divide-y divide-line">
            {steps.flatMap(({ fields }) =>
              visibleFields(fields).map((f) => (
                <div key={f.key} className="flex justify-between gap-6 py-2.5">
                  <dt className="text-[13px] text-ink-soft">{f.label}</dt>
                  <dd className="text-right font-mono text-[13px] font-medium text-ink">
                    {values[f.key] === undefined
                      ? "—"
                      : typeof values[f.key] === "boolean"
                        ? values[f.key]
                          ? "Yes"
                          : "No"
                        : typeof values[f.key] === "number" &&
                            (values[f.key] as number) >= 1000
                          ? `₹${(values[f.key] as number).toLocaleString("en-IN")}`
                          : String(values[f.key])}
                  </dd>
                </div>
              )),
            )}
          </dl>
          <form action={submitApplicationAction} className="mt-8 flex justify-between">
            {Object.entries(values).map(([k, v]) =>
              v === undefined ? null : (
                <input key={k} type="hidden" name={k} value={String(v)} />
              ),
            )}
            <button
              type="button"
              onClick={() => setStepIndex(steps.length - 1)}
              className="rounded-lg border border-line-strong px-4 py-2 text-[13px] font-semibold text-ink-soft"
            >
              ← Back
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary px-6 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Submit application
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

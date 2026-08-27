# NITI — Policy as Infrastructure

**An AI-powered compiler for government services.** Built for the *Build What
Moves India* hackathon.

Government policies are written in documents. Citizens experience them as
portals. Between the two sits months of manual interpretation and custom
software development. NITI closes that gap:

```
Policy document → AI compiler → Structured specification → Human validation
                → Deterministic rules engine → Citizen service
                                             + Caseworker dashboard
```

**The architecture principle: AI at compilation time, deterministic systems
at runtime.** AI extracts rules once, with confidence scores and citations.
A human approves every rule. After that, no LLM is involved in any citizen
transaction — every decision is produced by a pure, auditable rules engine
and traceable to a policy section.

> All policies and applicant data in this demo are **synthetic and
> fictional**. Nothing represents an actual government scheme.

## Quick start

```bash
npm install
npm run seed     # creates data/niti.db: deployed 2025 policy + 1,500 synthetic applications
npm run dev      # http://localhost:3000
```

Optional: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` to
enable live AI compilation. **The demo is fully functional without it** —
the compiler falls back to verified fixture compilations of the bundled
policies, so the demo never depends on a network call.

`npm test` runs the engine/diff/impact unit tests.

## The demo story

1. **`/studio`** — Compile the *Scholarship Policy 2026* document. The
   compiler extracts eligibility conditions, an exception, documents, and
   workflow — each with a confidence score and a verbatim source quote.
2. **`/studio/review`** — Review each extracted rule. Edit a threshold,
   approve the rest. Deployment is blocked until every element is
   human-approved.
3. **Deploy** — the citizen service regenerates from the new specification.
   No code changes.
4. **`/service`** — Apply as a citizen. The multi-step form is generated
   from the spec (the disability certificate field only appears when the
   exemption is claimed). Submission is evaluated instantly by the rules
   engine; the result explains every passed and failed rule with policy
   citations.
5. **`/caseworker`** — The application arrives with a system recommendation,
   a full eligibility trace, and flagged documents. The caseworker — not the
   system — makes the final decision.
6. **`/studio/diff`** — The finale: NITI diffs the 2025 and 2026
   specifications (₹3,00,000 → ₹3,50,000, age 18 → 21, diploma programmes
   added, new disability exemption) and re-evaluates all 1,500 applications
   against **both** versions — 3,000 real engine evaluations. Every headline
   number (newly eligible, no longer eligible, needs review) is a real count
   with per-application drill-down. Nothing is estimated or faked.

## Architecture

```
src/core/          The product. Pure TypeScript, zero framework imports.
  schema/          Zod schemas — PolicySpec is the single source of truth
  engine/          Deterministic rules engine (recursive tree, full trace)
  compiler/        AI compilation (validated structured output) + fixture fallback
  diff/            Structural spec diff (thresholds, options, exceptions, documents)
  impact/          Re-evaluates every application against two spec versions
  formgen/         Derives the citizen form (steps, fields, visibility) from a spec
  synth/           Deterministic synthetic applicant generator (seeded PRNG)
src/db/            SQLite (better-sqlite3) — policy versions + applications
src/app/           Next.js App Router UI (studio, review, diff, service, caseworker)
data/policies/     The two demonstration policy documents (Markdown)
```

Nothing scholarship-specific lives in the UI: pages and the form renderer
consume whatever `PolicySpec` is deployed. Compile a different policy and
the same infrastructure produces a different service.

import fs from "fs";
import path from "path";
import { evaluate } from "../src/core/engine/evaluate";
import { PolicySpec, collectConditions } from "../src/core/schema/spec";
import { scholarship2025 } from "../src/core/fixtures/scholarship2025";
import { generateApplications } from "../src/core/synth/generate";
import { getDb, insertApplication, insertPolicyVersion } from "../src/db/db";

/**
 * Seeds the demo database:
 *  - the 2025 policy version, human-approved and deployed
 *  - 1,500 synthetic applications evaluated by the real rules engine
 *
 * The 2026 revision is intentionally NOT seeded — it is compiled live in
 * the Policy Studio during the demo (with a fixture fallback if offline).
 */

function approveAll(spec: PolicySpec): PolicySpec {
  const clone: PolicySpec = JSON.parse(JSON.stringify(spec));
  for (const c of collectConditions(clone.eligibility)) c.status = "approved";
  for (const d of clone.documents) d.status = "approved";
  for (const e of clone.exceptions) e.status = "approved";
  return clone;
}

const dbPath = path.join(process.cwd(), "data", "niti.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix);
}

const db = getDb();

const sourceText = fs.readFileSync(
  path.join(process.cwd(), "data", "policies", "scholarship-2025.md"),
  "utf-8",
);

const spec2025 = approveAll(scholarship2025);
const versionId = insertPolicyVersion({
  spec: spec2025,
  sourceText,
  status: "deployed",
  compiledBy: "fixture",
});

console.log(`Seeded policy version ${versionId}: ${spec2025.title} ${spec2025.versionLabel} (deployed)`);

const apps = generateApplications();
const insertMany = db.transaction(() => {
  for (const app of apps) {
    insertApplication({
      appNumber: app.appNumber,
      versionId,
      data: app.data,
      decision: evaluate(spec2025, app.data),
      source: "synthetic",
      submittedAt: app.submittedAt,
    });
  }
});
insertMany();

const outcomes = db
  .prepare(`SELECT outcome, COUNT(*) n FROM applications GROUP BY outcome`)
  .all() as { outcome: string; n: number }[];
console.log(`Seeded ${apps.length} synthetic applications:`);
for (const o of outcomes) console.log(`  ${o.outcome}: ${o.n}`);

import Database from "better-sqlite3";
import path from "path";
import { Applicant, Decision, evaluate } from "@/core/engine/evaluate";
import { PolicySpec, collectConditions } from "@/core/schema/spec";
import { scholarship2025 } from "@/core/fixtures/scholarship2025";
import { generateApplications } from "@/core/synth/generate";

/**
 * SQLite persistence for policy versions and applications.
 * File-based, zero external infrastructure: the demo cannot lose its
 * database because a cloud service is down.
 *
 * On Vercel, the filesystem outside /tmp is read-only and /tmp itself is
 * ephemeral per serverless instance — there is no durable disk. Rather than
 * pull in a hosted database for a hackathon demo, getDb() detects an empty
 * database (which is what every cold start sees) and seeds it synchronously
 * on first access, so the deployed app is always self-contained and never
 * boots into an empty state. The trade-off: a citizen submission or a
 * studio deploy made against one serverless instance is not guaranteed to
 * survive a cold start on another — acceptable for a demo, not for
 * production (that would call for a hosted Postgres/LibSQL database).
 */

const DB_PATH =
  process.env.NITI_DB_PATH ??
  (process.env.VERCEL ? "/tmp/niti.db" : path.join(process.cwd(), "data", "niti.db"));

declare global {
  // eslint-disable-next-line no-var
  var __nitiDb: Database.Database | undefined;
}

function seedIfEmpty(db: Database.Database): void {
  const { n } = db.prepare(`SELECT COUNT(*) n FROM policy_versions`).get() as { n: number };
  if (n > 0) return;

  const spec: PolicySpec = JSON.parse(JSON.stringify(scholarship2025));
  for (const c of collectConditions(spec.eligibility)) c.status = "approved";
  for (const d of spec.documents) d.status = "approved";
  for (const e of spec.exceptions) e.status = "approved";

  const insertVersion = db.prepare(
    `INSERT INTO policy_versions (slug, version_label, title, source_text, spec_json, status, compiled_by)
     VALUES (?, ?, ?, ?, ?, 'deployed', 'fixture')`,
  );
  const versionResult = insertVersion.run(
    spec.policySlug,
    spec.versionLabel,
    spec.title,
    spec.description,
    JSON.stringify(spec),
  );
  const versionId = Number(versionResult.lastInsertRowid);

  const insertApp = db.prepare(
    `INSERT INTO applications (app_number, version_id, data_json, decision_json, outcome, source, submitted_at)
     VALUES (?, ?, ?, ?, ?, 'synthetic', ?)`,
  );
  const seedApps = db.transaction(() => {
    for (const app of generateApplications()) {
      const decision = evaluate(spec, app.data);
      insertApp.run(
        app.appNumber,
        versionId,
        JSON.stringify(app.data),
        JSON.stringify(decision),
        decision.outcome,
        app.submittedAt,
      );
    }
  });
  seedApps();
}

export function getDb(): Database.Database {
  if (globalThis.__nitiDb) return globalThis.__nitiDb;
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      version_label TEXT NOT NULL,
      title TEXT NOT NULL,
      source_text TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      compiled_by TEXT NOT NULL DEFAULT 'fixture',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_number TEXT NOT NULL UNIQUE,
      version_id INTEGER NOT NULL REFERENCES policy_versions(id),
      data_json TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      outcome TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'synthetic',
      caseworker_status TEXT NOT NULL DEFAULT 'pending',
      caseworker_note TEXT,
      submitted_at TEXT NOT NULL
    );
  `);
  seedIfEmpty(db);
  globalThis.__nitiDb = db;
  return db;
}

// ---------------------------------------------------------------------------
// Policy versions
// ---------------------------------------------------------------------------

export interface PolicyVersionRow {
  id: number;
  slug: string;
  versionLabel: string;
  title: string;
  sourceText: string;
  spec: PolicySpec;
  status: "draft" | "deployed" | "archived";
  compiledBy: "ai" | "fixture";
  createdAt: string;
}

interface RawVersion {
  id: number;
  slug: string;
  version_label: string;
  title: string;
  source_text: string;
  spec_json: string;
  status: string;
  compiled_by: string;
  created_at: string;
}

function toVersion(r: RawVersion): PolicyVersionRow {
  return {
    id: r.id,
    slug: r.slug,
    versionLabel: r.version_label,
    title: r.title,
    sourceText: r.source_text,
    spec: JSON.parse(r.spec_json) as PolicySpec,
    status: r.status as PolicyVersionRow["status"],
    compiledBy: r.compiled_by as PolicyVersionRow["compiledBy"],
    createdAt: r.created_at,
  };
}

export function insertPolicyVersion(input: {
  spec: PolicySpec;
  sourceText: string;
  status?: PolicyVersionRow["status"];
  compiledBy?: PolicyVersionRow["compiledBy"];
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO policy_versions (slug, version_label, title, source_text, spec_json, status, compiled_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.spec.policySlug,
      input.spec.versionLabel,
      input.spec.title,
      input.sourceText,
      JSON.stringify(input.spec),
      input.status ?? "draft",
      input.compiledBy ?? "fixture",
    );
  return Number(res.lastInsertRowid);
}

export function listPolicyVersions(): PolicyVersionRow[] {
  return (
    getDb()
      .prepare(`SELECT * FROM policy_versions ORDER BY id ASC`)
      .all() as RawVersion[]
  ).map(toVersion);
}

export function getPolicyVersion(id: number): PolicyVersionRow | undefined {
  const r = getDb()
    .prepare(`SELECT * FROM policy_versions WHERE id = ?`)
    .get(id) as RawVersion | undefined;
  return r ? toVersion(r) : undefined;
}

export function getDeployedVersion(): PolicyVersionRow | undefined {
  const r = getDb()
    .prepare(`SELECT * FROM policy_versions WHERE status = 'deployed' ORDER BY id DESC LIMIT 1`)
    .get() as RawVersion | undefined;
  return r ? toVersion(r) : undefined;
}

export function updateSpec(id: number, spec: PolicySpec): void {
  getDb()
    .prepare(`UPDATE policy_versions SET spec_json = ? WHERE id = ?`)
    .run(JSON.stringify(spec), id);
}

/** Deploy a version: archive any currently deployed version of the same slug. */
export function deployVersion(id: number): void {
  const db = getDb();
  const v = getPolicyVersion(id);
  if (!v) throw new Error(`No policy version ${id}`);
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE policy_versions SET status = 'archived' WHERE slug = ? AND status = 'deployed'`,
    ).run(v.slug);
    db.prepare(`UPDATE policy_versions SET status = 'deployed' WHERE id = ?`).run(id);
  });
  tx();
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export interface ApplicationRow {
  id: number;
  appNumber: string;
  versionId: number;
  data: Applicant;
  decision: Decision;
  outcome: string;
  source: "synthetic" | "citizen";
  caseworkerStatus: "pending" | "approved" | "rejected";
  caseworkerNote: string | null;
  submittedAt: string;
}

interface RawApplication {
  id: number;
  app_number: string;
  version_id: number;
  data_json: string;
  decision_json: string;
  outcome: string;
  source: string;
  caseworker_status: string;
  caseworker_note: string | null;
  submitted_at: string;
}

function toApplication(r: RawApplication): ApplicationRow {
  return {
    id: r.id,
    appNumber: r.app_number,
    versionId: r.version_id,
    data: JSON.parse(r.data_json) as Applicant,
    decision: JSON.parse(r.decision_json) as Decision,
    outcome: r.outcome,
    source: r.source as ApplicationRow["source"],
    caseworkerStatus: r.caseworker_status as ApplicationRow["caseworkerStatus"],
    caseworkerNote: r.caseworker_note,
    submittedAt: r.submitted_at,
  };
}

export function insertApplication(input: {
  appNumber: string;
  versionId: number;
  data: Applicant;
  decision: Decision;
  source: "synthetic" | "citizen";
  submittedAt: string;
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO applications (app_number, version_id, data_json, decision_json, outcome, source, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.appNumber,
      input.versionId,
      JSON.stringify(input.data),
      JSON.stringify(input.decision),
      input.decision.outcome,
      input.source,
      input.submittedAt,
    );
  return Number(res.lastInsertRowid);
}

export function listApplications(limit = 50): ApplicationRow[] {
  return (
    getDb()
      .prepare(`SELECT * FROM applications ORDER BY id DESC LIMIT ?`)
      .all(limit) as RawApplication[]
  ).map(toApplication);
}

export function getAllApplications(): ApplicationRow[] {
  return (
    getDb().prepare(`SELECT * FROM applications ORDER BY id ASC`).all() as RawApplication[]
  ).map(toApplication);
}

export function getApplication(id: number): ApplicationRow | undefined {
  const r = getDb()
    .prepare(`SELECT * FROM applications WHERE id = ?`)
    .get(id) as RawApplication | undefined;
  return r ? toApplication(r) : undefined;
}

export function setCaseworkerDecision(
  id: number,
  status: "approved" | "rejected",
  note: string | null,
): void {
  getDb()
    .prepare(`UPDATE applications SET caseworker_status = ?, caseworker_note = ? WHERE id = ?`)
    .run(status, note, id);
}

export function applicationStats(): {
  total: number;
  pendingReview: number;
  autoEligible: number;
  autoIneligible: number;
} {
  const db = getDb();
  const count = (sql: string) =>
    (db.prepare(sql).get() as { n: number }).n;
  return {
    total: count(`SELECT COUNT(*) n FROM applications`),
    pendingReview: count(
      `SELECT COUNT(*) n FROM applications WHERE outcome = 'eligible_pending_review' AND caseworker_status = 'pending'`,
    ),
    autoEligible: count(
      `SELECT COUNT(*) n FROM applications WHERE outcome IN ('eligible', 'eligible_pending_review')`,
    ),
    autoIneligible: count(`SELECT COUNT(*) n FROM applications WHERE outcome = 'ineligible'`),
  };
}

/** Re-evaluate and persist a citizen application against a spec (used on submit). */
export function decideAndInsert(
  spec: PolicySpec,
  versionId: number,
  data: Applicant,
): { id: number; appNumber: string; decision: Decision } {
  const decision = evaluate(spec, data);
  const appNumber = `2026-${String(90000 + Math.floor(Math.random() * 9999))}`;
  const id = insertApplication({
    appNumber,
    versionId,
    data,
    decision,
    source: "citizen",
    submittedAt: new Date().toISOString().slice(0, 10),
  });
  return { id, appNumber, decision };
}

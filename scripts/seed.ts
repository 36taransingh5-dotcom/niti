import fs from "fs";
import path from "path";
import { applicationStats, getDb, listPolicyVersions } from "../src/db/db";

/**
 * Resets the local demo database to its clean starting state: the 2025
 * policy deployed and approved, plus 1,500 synthetic applications evaluated
 * by the real rules engine.
 *
 * The seeding logic itself lives in getDb() (src/db/db.ts) — it runs
 * automatically whenever the database is empty, which is exactly what a
 * fresh Vercel serverless cold start sees too. This script just deletes the
 * local file first so getDb() seeds it from scratch.
 */

const dbPath = process.env.NITI_DB_PATH ?? path.join(process.cwd(), "data", "niti.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix);
}

getDb();

const version = listPolicyVersions()[0];
console.log(`Seeded policy version ${version.id}: ${version.title} ${version.versionLabel} (${version.status})`);
console.log("Seeded applications:", applicationStats());

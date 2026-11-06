import pg from "pg";
import { TEST_DATABASE_URL } from "../vitest.config.js";

/**
 * Runs once before the whole test run: creates the test database if needed,
 * then drops, migrates and seeds it so every run starts from known data.
 */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);

  // CREATE DATABASE has to run from a connection to a different database.
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  // Set env before importing app code: config.ts reads it at import time.
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { reset } = await import("../src/db/reset.js");
  const { pool } = await import("../src/db/pool.js");
  await reset();
  await pool.end();
}

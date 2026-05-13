/**
 * Database connection — raw pg Pool
 *
 * No ORM. Full SQL control.
 * Uses node-postgres (pg) with connection pooling.
 */

import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error("[db] Connection failed:", err.message);
    return;
  }
  console.log("[db] PostgreSQL connected successfully");
  release();
});
/**
 * Raw SQL query examples
 *
 * Demonstrates JOIN skill and raw SQL fluency
 * without any ORM abstraction.
 */

import { pool } from "./db";

// fetches the 50 most recent messages with conversation and guest info
export async function getRecentMessages() {
  const result = await pool.query(`
    SELECT
      m.id,
      m.messagetext,
      m.querytype,
      m.confidencescore,
      m.action,
      m.aidrafted,
      m.autosent,
      m.createdat,
      c.source,
      g.fullname as guest_name
    FROM message m
    JOIN conversation c ON m.conversationid = c.id
    JOIN guest g ON c.guestid = g.id
    ORDER BY m.createdat DESC
    LIMIT 50
  `);
  return result.rows;
}

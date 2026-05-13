/**
 * Persistence Service
 *
 * Saves the full conversation flow to PostgreSQL using raw SQL.
 * Called after the AI reply is generated and confidence is scored.
 *
 * Flow:
 *   1. Find or create Guest by name
 *   2. Look up Property by propertyCode
 *   3. Find or create Conversation (guestId + propertyId + source)
 *   4. Insert inbound message (the guest's original message)
 *   5. Insert outbound message (the AI-drafted reply)
 *
 * All queries use parameterised $1, $2 — never string interpolation.
 * Table/column names are lowercase (schema.sql created without quotes).
 */

import { pool } from "../lib/db";
import type { NormalisedMessage, MessageAction } from "../types/message.types";

export interface PersistenceInput {
  normalised: NormalisedMessage;
  draftedReply: string;
  confidenceScore: number;
  action: MessageAction;
}

export async function persistConversation(data: PersistenceInput): Promise<void> {
  const { normalised, draftedReply, confidenceScore, action } = data;

  try {
    // Step 1 — find or create guest by name
    const guestResult = await pool.query(
      `INSERT INTO guest (fullname)
       VALUES ($1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [normalised.guest_name]
    );

    let guestId: string;
    if (guestResult.rows.length > 0) {
      guestId = guestResult.rows[0].id;
      console.log(`[persist] created guest: ${guestId}`);
    } else {
      // guest already exists, look them up
      const existing = await pool.query(
        `SELECT id FROM guest WHERE fullname = $1 LIMIT 1`,
        [normalised.guest_name]
      );
      guestId = existing.rows[0].id;
      console.log(`[persist] found existing guest: ${guestId}`);
    }

    // Step 2 — look up property by propertycode
    const propertyResult = await pool.query(
      `SELECT id FROM property WHERE propertycode = $1`,
      [normalised.property_id]
    );

    if (propertyResult.rows.length === 0) {
      console.error(`[persist] property not found: ${normalised.property_id}, skipping persistence`);
      return;
    }
    const propertyId = propertyResult.rows[0].id;
    console.log(`[persist] found property: ${propertyId}`);

    // Step 3 — find or create conversation
    let conversationResult = await pool.query(
      `SELECT id FROM conversation
       WHERE guestid = $1 AND propertyid = $2 AND source = $3
       ORDER BY createdat DESC
       LIMIT 1`,
      [guestId, propertyId, normalised.source]
    );

    let conversationId: string;
    if (conversationResult.rows.length > 0) {
      conversationId = conversationResult.rows[0].id;
      await pool.query(
        `UPDATE conversation SET updatedat = NOW() WHERE id = $1`,
        [conversationId]
      );
      console.log(`[persist] found existing conversation: ${conversationId}`);
    } else {
      const newConvo = await pool.query(
        `INSERT INTO conversation (guestid, propertyid, source, status)
         VALUES ($1, $2, $3, 'open')
         RETURNING id`,
        [guestId, propertyId, normalised.source]
      );
      conversationId = newConvo.rows[0].id;
      console.log(`[persist] created conversation: ${conversationId}`);
    }

    // Step 4 — insert inbound message (the guest's original message)
    await pool.query(
      `INSERT INTO message
       (conversationid, direction, messagetext, querytype, aidrafted, agentedited, autosent)
       VALUES ($1, 'inbound', $2, $3, false, false, false)`,
      [conversationId, normalised.message_text, normalised.query_type]
    );
    console.log("[persist] saved inbound message");

    // Step 5 — insert outbound message (the AI-drafted reply)
    const autoSent = action === "auto_send";
    await pool.query(
      `INSERT INTO message
       (conversationid, direction, messagetext, querytype, confidencescore, action, aidrafted, agentedited, autosent)
       VALUES ($1, 'outbound', $2, $3, $4, $5, true, false, $6)`,
      [conversationId, draftedReply, normalised.query_type, confidenceScore, action, autoSent]
    );
    console.log(`[persist] saved outbound message (action: ${action}, autoSent: ${autoSent})`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[persist] failed: ${msg}`);
  }
}

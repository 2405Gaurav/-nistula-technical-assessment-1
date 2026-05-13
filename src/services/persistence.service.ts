/**
 * Persistence Service
 *
 * Saves the full conversation flow to PostgreSQL using raw SQL.
 *
 * Flow:
 *   1. Upsert Guest by full name (UNIQUE fullname in schema — one profile per name)
 *   2. Look up Property by propertyCode
 *   3. Resolve Reservation id when booking_ref matches **and** guest name matches reservation guest (integrity)
 *   4. Find or create Conversation; set / backfill reservationId when a booking matches
 *   5. Insert inbound + outbound Message rows
 *   6. Update Conversation.status (escalated when action is escalate)
 *   7. Touch Reservation.updatedAt when this turn is tied to a booking
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
    const guestUpsert = await pool.query(
      `INSERT INTO guest (fullname) VALUES ($1)
       ON CONFLICT (fullname) DO UPDATE SET fullname = EXCLUDED.fullname
       RETURNING id`,
      [normalised.guest_name],
    );
    const guestId: string = guestUpsert.rows[0].id;
    console.log(`[persist] guest id: ${guestId}`);

    const propertyResult = await pool.query(
      `SELECT id FROM property WHERE propertycode = $1`,
      [normalised.property_id],
    );

    if (propertyResult.rows.length === 0) {
      console.error(`[persist] property not found: ${normalised.property_id}, skipping persistence`);
      return;
    }
    const propertyId: string = propertyResult.rows[0].id;
    console.log(`[persist] found property: ${propertyId}`);

    let reservationId: string | null = null;
    if (normalised.booking_ref) {
      const resLookup = await pool.query(
        `SELECT r.id
         FROM reservation r
         JOIN guest g ON r.guestid = g.id
         WHERE r.bookingref = $1
           AND lower(trim(g.fullname)) = lower(trim($2))`,
        [normalised.booking_ref, normalised.guest_name],
      );
      if (resLookup.rows.length > 0) {
        reservationId = resLookup.rows[0].id;
        console.log(`[persist] reservation linked: ${reservationId}`);
      } else {
        console.log(
          `[persist] no reservation row for ref + guest combo: ${normalised.booking_ref} / ${normalised.guest_name}`,
        );
      }
    }

    let conversationResult = await pool.query(
      `SELECT id, reservationid FROM conversation
       WHERE guestid = $1 AND propertyid = $2 AND source = $3
       ORDER BY createdat DESC
       LIMIT 1`,
      [guestId, propertyId, normalised.source],
    );

    let conversationId: string;
    if (conversationResult.rows.length > 0) {
      conversationId = conversationResult.rows[0].id;
      const existingResId = conversationResult.rows[0].reservationid;
      if (reservationId && !existingResId) {
        await pool.query(
          `UPDATE conversation SET reservationid = $1, updatedat = NOW() WHERE id = $2`,
          [reservationId, conversationId],
        );
        console.log(`[persist] backfilled conversation.reservationid`);
      }
      await pool.query(`UPDATE conversation SET updatedat = NOW() WHERE id = $1`, [conversationId]);
      console.log(`[persist] found existing conversation: ${conversationId}`);
    } else {
      const newConvo = await pool.query(
        `INSERT INTO conversation (guestid, propertyid, source, status, reservationid)
         VALUES ($1, $2, $3, 'open', $4)
         RETURNING id`,
        [guestId, propertyId, normalised.source, reservationId],
      );
      conversationId = newConvo.rows[0].id;
      console.log(`[persist] created conversation: ${conversationId}`);
    }

    await pool.query(
      `INSERT INTO message
       (conversationid, direction, messagetext, querytype, confidencescore, action, aidrafted, agentedited, autosent)
       VALUES ($1, 'inbound', $2, $3, $4, $5, false, false, false)`,
      [conversationId, normalised.message_text, normalised.query_type, confidenceScore, action],
    );
    console.log("[persist] saved inbound message (with confidence + action)");

    const autoSent = action === "auto_send";
    await pool.query(
      `INSERT INTO message
       (conversationid, direction, messagetext, querytype, confidencescore, action, aidrafted, agentedited, autosent)
       VALUES ($1, 'outbound', $2, $3, $4, $5, true, false, $6)`,
      [conversationId, draftedReply, normalised.query_type, confidenceScore, action, autoSent],
    );
    console.log(`[persist] saved outbound message (action: ${action}, autoSent: ${autoSent})`);

    await pool.query(
      `UPDATE conversation
       SET status = CASE WHEN $2 = 'escalate' THEN 'escalated' ELSE status END,
           updatedat = NOW()
       WHERE id = $1`,
      [conversationId, action],
    );

    if (reservationId) {
      await pool.query(`UPDATE reservation SET updatedat = NOW() WHERE id = $1`, [reservationId]);
      console.log("[persist] reservation.updatedAt touched");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[persist] failed: ${msg}`);
  }
}

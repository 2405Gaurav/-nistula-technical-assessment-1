/**
 * Context Service (raw pg version)
 *
 * Gathers background info for AI prompt building:
 *   - Property context → always from static utility
 *   - Reservation context → raw SQL lookup by booking_ref
 *
 * If DB throws, we log and return property context anyway.
 */

import { pool } from "../lib/db";
import { getPropertyContext } from "../utils/propertyContext";
import type { NormalisedMessage, MessageContext } from "../types/message.types";

// turns a Date into "20 April 2026"
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Build the context object for AI prompts.
 * Always returns property context. Reservation is best-effort.
 */
export async function buildMessageContext(
  normalised: NormalisedMessage,
): Promise<MessageContext> {
  const propertyContext = getPropertyContext(normalised.property_id);

  if (!normalised.booking_ref) {
    console.log("[context] no booking_ref, skipping reservation lookup");
    return { propertyContext, reservationContext: "", hasReservation: false };
  }

  try {
    // schema.sql uses unquoted identifiers → PostgreSQL stores them lowercase
    const result = await pool.query(
      `SELECT r.*, g.fullname as guest_name
       FROM reservation r
       JOIN guest g ON r.guestid = g.id
       WHERE r.bookingref = $1`,
      [normalised.booking_ref]
    );

    const reservation = result.rows[0] ?? null;

    if (!reservation) {
      console.log(`[context] reservation not found for: ${normalised.booking_ref}`);
      return { propertyContext, reservationContext: "", hasReservation: false };
    }

    const reservationContext = [
      `Reservation: ${reservation.bookingref}`,
      `Check-in: ${formatDate(new Date(reservation.checkindate))} | Check-out: ${formatDate(new Date(reservation.checkoutdate))}`,
      `Guests: ${reservation.numberofguests} | Status: ${reservation.status} | Payment: ${reservation.paymentstatus}`,
    ].join("\n");

    console.log(`[context] reservation found: ${reservation.bookingref} (${reservation.status})`);
    return { propertyContext, reservationContext, hasReservation: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[context] DB error, continuing without reservation: ${msg}`);
    return { propertyContext, reservationContext: "", hasReservation: false };
  }
}

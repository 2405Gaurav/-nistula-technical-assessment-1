/**
 * Context Service
 *
 * Gathers background info for AI prompt building:
 *   - Property context → always from static utility (getPropertyContext)
 *   - Reservation context → Prisma lookup by booking_ref, if provided
 *
 * If DB throws, we log and return property context anyway — the AI
 * pipeline should never break because of a failed reservation lookup.
 */

import { prisma } from "../lib/db";
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
 * Build the context object that downstream services need for AI prompts.
 * Always returns property context. Reservation is best-effort.
 */
export async function buildMessageContext(
  normalised: NormalisedMessage,
): Promise<MessageContext> {
  const propertyContext = getPropertyContext(normalised.property_id);

  // no booking ref → nothing to look up
  if (!normalised.booking_ref) {
    console.log("[context] no booking_ref, skipping reservation lookup");
    return { propertyContext, reservationContext: "", hasReservation: false };
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { bookingRef: normalised.booking_ref },
    });

    if (!reservation) {
      console.log(`[context] reservation not found for: ${normalised.booking_ref}`);
      return { propertyContext, reservationContext: "", hasReservation: false };
    }

    // format into a clean string the AI can read
    const reservationContext = [
      `Reservation: ${reservation.bookingRef}`,
      `Check-in: ${formatDate(reservation.checkInDate)} | Check-out: ${formatDate(reservation.checkOutDate)}`,
      `Guests: ${reservation.numberOfGuests} | Status: ${reservation.status} | Payment: ${reservation.paymentStatus}`,
    ].join("\n");

    console.log(`[context] reservation found: ${reservation.bookingRef} (${reservation.status})`);
    return { propertyContext, reservationContext, hasReservation: true };
  } catch (err) {
    // DB failed — log it, return what we have, keep the pipeline alive
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[context] DB error, continuing without reservation: ${msg}`);
    return { propertyContext, reservationContext: "", hasReservation: false };
  }
}

/**
 * Context Service (raw pg)
 *
 * Builds AI prompt context from PostgreSQL:
 *   • Property — row from Property by propertyCode (rates, WiFi, policies, availabilityNotes).
 *   • Reservation — row from Reservation joined with Guest + Property by bookingRef.
 *
 * Falls back to getPropertyContextFallback only when the DB has no property row or errors.
 */

import { pool } from "../lib/db";
import { getPropertyContextFallback, PROPERTY_CONTEXT_UNKNOWN } from "../utils/propertyContext";
import type { NormalisedMessage, MessageContext } from "../types/message.types";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function moneyInr(value: string | number): string {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(n)) return String(value);
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(0);
}

/** Format a Property row (pg lowercases unquoted identifiers) for the Claude prompt. */
function formatPropertyRow(row: Record<string, unknown>): string {
  const name = String(row.name ?? "");
  const location = String(row.location ?? "");
  const bedrooms = Number(row.bedrooms ?? 0);
  const maxGuests = Number(row.maxguests ?? 0);
  const poolYes = row.privatepool === true;
  const checkIn = String(row.checkintime ?? "");
  const checkOut = String(row.checkouttime ?? "");
  const baseRate = moneyInr(row.baseratepernight as string | number);
  const baseGuestCount = Number(row.baseguestcount ?? 0);
  const extraGuest = moneyInr(row.extraguestcharge as string | number);
  const wifi = row.wifipassword != null ? String(row.wifipassword) : "—";
  const caretaker = String(row.caretakeravailability ?? "—");
  const chef = row.chefoncall === true ? "Yes" : "No";
  const chefPre =
    row.chefoncall === true && row.chefbookingrequired === true ? ", pre-booking required" : "";
  const cancel = String(row.cancellationpolicy ?? "—");
  const availability =
    row.availabilitynotes != null && String(row.availabilitynotes).trim() !== ""
      ? `${String(row.availabilitynotes).trim()}\n`
      : "";

  return [
    `Property: ${name}, ${location}`,
    `Bedrooms: ${bedrooms} | Max guests: ${maxGuests} | Private pool: ${poolYes ? "Yes" : "No"}`,
    `Check-in: ${checkIn} | Check-out: ${checkOut}`,
    `Base rate: INR ${baseRate} per night (up to ${baseGuestCount} guests)`,
    `Extra guest: INR ${extraGuest} per night per person`,
    `WiFi password: ${wifi}`,
    `Caretaker: ${caretaker}`,
    `Chef on call: ${chef}${chefPre}`,
    `${availability}Cancellation: ${cancel}`,
  ]
    .join("\n")
    .trim();
}

async function loadPropertyContextFromDb(propertyCode: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT name, location, bedrooms, maxguests, privatepool,
            checkintime, checkouttime, baseratepernight, baseguestcount, extraguestcharge,
            wifipassword, caretakeravailability, chefoncall, chefbookingrequired,
            cancellationpolicy, availabilitynotes
     FROM property
     WHERE propertycode = $1`,
    [propertyCode],
  );
  const row = result.rows[0];
  if (!row) return null;
  return formatPropertyRow(row as Record<string, unknown>);
}

/**
 * Build the context object for AI prompts.
 * Property text prefers the database; reservation block is best-effort from DB.
 */
export async function buildMessageContext(
  normalised: NormalisedMessage,
): Promise<MessageContext> {
  let propertyContext = PROPERTY_CONTEXT_UNKNOWN;

  try {
    const fromDb = await loadPropertyContextFromDb(normalised.property_id);
    if (fromDb) {
      propertyContext = fromDb;
      console.log(`[context] property loaded from DB: ${normalised.property_id}`);
    } else {
      propertyContext = getPropertyContextFallback(normalised.property_id);
      console.log(`[context] property not in DB, using fallback for: ${normalised.property_id}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[context] property DB error, using fallback: ${msg}`);
    propertyContext = getPropertyContextFallback(normalised.property_id);
  }

  if (!normalised.booking_ref) {
    console.log("[context] no booking_ref, skipping reservation lookup");
    return { propertyContext, reservationContext: "", hasReservation: false };
  }

  try {
    const result = await pool.query(
      `SELECT r.id, r.bookingref, r.checkindate, r.checkoutdate, r.numberofguests,
              r.totalamount, r.paymentstatus, r.status,
              g.fullname AS guest_name,
              p.propertycode AS res_property_code, p.name AS res_property_name
       FROM reservation r
       JOIN guest g ON r.guestid = g.id
       JOIN property p ON r.propertyid = p.id
       WHERE r.bookingref = $1
         AND lower(trim(g.fullname)) = lower(trim($2))`,
      [normalised.booking_ref, normalised.guest_name],
    );

    const reservation = result.rows[0] ?? null;

    if (!reservation) {
      console.log(`[context] reservation not found for: ${normalised.booking_ref}`);
      return { propertyContext, reservationContext: "", hasReservation: false };
    }

    const resCode = String(reservation.res_property_code ?? "");
    const payloadCode = normalised.property_id.trim().toLowerCase();
    const mismatch =
      resCode.toLowerCase() !== payloadCode
        ? `\nNote: message property_id (${normalised.property_id}) differs from this booking's property (${resCode}). Prefer facts for the booked property (${reservation.res_property_name}).`
        : "";

    const reservationContext = [
      `Reservation: ${reservation.bookingref}`,
      `Guest on file: ${reservation.guest_name}`,
      `Property: ${reservation.res_property_name} (${resCode})`,
      `Check-in: ${formatDate(new Date(reservation.checkindate))} | Check-out: ${formatDate(new Date(reservation.checkoutdate))}`,
      `Guests: ${reservation.numberofguests} | Status: ${reservation.status} | Payment: ${reservation.paymentstatus}`,
      `Total amount: INR ${moneyInr(reservation.totalamount as string | number)}`,
      `${mismatch}`.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    console.log(`[context] reservation found: ${reservation.bookingref} (${reservation.status})`);
    return { propertyContext, reservationContext, hasReservation: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[context] reservation DB error: ${msg}`);
    return { propertyContext, reservationContext: "", hasReservation: false };
  }
}

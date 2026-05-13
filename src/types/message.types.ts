/**
 * Canonical internal message types.
 *
 * These types represent the *normalised* shape that every service
 * downstream of the validation layer works with.  They are intentionally
 * decoupled from the raw webhook schema so that external payload changes
 * only affect the normalization service, not the rest of the codebase.
 */

import type { MESSAGE_SOURCES, QUERY_TYPES, MESSAGE_DIRECTIONS, MESSAGE_ACTIONS, CONVERSATION_STATUSES } from "../constants/message";

// ---------------------------------------------------------------------------
// Utility: extract union type from a readonly const array
// ---------------------------------------------------------------------------

type ArrayElement<T extends ReadonlyArray<unknown>> = T[number];

// ---------------------------------------------------------------------------
// Derived union types — always in sync with the constants arrays
// ---------------------------------------------------------------------------

export type MessageSource = ArrayElement<typeof MESSAGE_SOURCES>;
export type QueryType = ArrayElement<typeof QUERY_TYPES>;
export type MessageDirection = ArrayElement<typeof MESSAGE_DIRECTIONS>;
export type MessageAction = ArrayElement<typeof MESSAGE_ACTIONS>;
export type ConversationStatus = ArrayElement<typeof CONVERSATION_STATUSES>;

// ---------------------------------------------------------------------------
// Normalised message — the canonical internal representation
// ---------------------------------------------------------------------------

export interface NormalisedMessage {
  /** System-generated UUID for this message */
  message_id: string;

  /** Channel origin (whatsapp | booking_com | airbnb | …) */
  source: MessageSource;

  /** Sanitised guest display name */
  guest_name: string;

  /** Cleaned message body */
  message_text: string;

  /** ISO-8601 timestamp preserved from the original payload */
  timestamp: string;

  /** Booking reference, if one was provided */
  booking_ref: string | null;

  /** Property code this message is associated with */
  property_id: string;
}

// ---------------------------------------------------------------------------
// API response envelope — standard shape for all JSON responses
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Array<{ field: string; message: string }>;
}

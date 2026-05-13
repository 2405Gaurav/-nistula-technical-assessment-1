/**
 * Normalization Service
 *
 * Converts validated(by zod in the middleware) external webhook payloads into the
 * `NormalisedMessage` structure used by every downstream service.
 *
 * Responsibilities:
 *  - UUID generation for message_id
 *  - Field mapping (external → internal naming)
 *  - Null coalescing for optional fields
 *  - Additional sanitisation beyond what Zod provides
 *  - query type (will now implement uisng the claude,out of the constants/messages )
 */

import { randomUUID } from "node:crypto";
import type { IncomingWebhookPayload } from "../schemas/webhook.schema";
import type { NormalisedMessage } from "../types/message.types";

/**
 * Transform a validated webhook payload into the internal normalised shape.
 *
 * @param payload  A payload that has already passed Zod validation.
 * @returns        A fully normalised message ready for downstream processing.
 */
export function normaliseMessage(
  payload: IncomingWebhookPayload,
): NormalisedMessage {
  return {
    message_id: randomUUID(),
    source: payload.source,
    guest_name: payload.guest_name,
    message_text: payload.message,
    timestamp: payload.timestamp,
    booking_ref: payload.booking_ref ?? null,
    property_id: payload.property_id,
  };
}

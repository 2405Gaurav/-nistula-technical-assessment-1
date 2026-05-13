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
 *  - Query type classification (hybrid: rule-based + Claude fallback)
 */

import { randomUUID } from "node:crypto";
import type { IncomingWebhookPayload } from "../schemas/webhook.schema";
import type { NormalisedMessage } from "../types/message.types";
import { classifyMessage } from "./classification.service";

/**
 * Transform a validated webhook payload into the internal normalised shape.
 *
 * Now async because classification may call Claude as a fallback.
 *
 * @param payload  A payload that has already passed Zod validation.
 * @returns        A fully normalised message with query_type, ready for downstream processing.
 */
export async function normaliseMessage(
  payload: IncomingWebhookPayload,
): Promise<NormalisedMessage> {
  const messageText = payload.message;

  // Classify the message (rule-based first, Claude fallback if ambiguous)
  const queryType = await classifyMessage(messageText);

  return {
    message_id: randomUUID(),
    source: payload.source,
    guest_name: payload.guest_name,
    message_text: messageText,
    timestamp: payload.timestamp,
    booking_ref: payload.booking_ref ?? null,
    property_id: payload.property_id,
    query_type: queryType,
  };
}

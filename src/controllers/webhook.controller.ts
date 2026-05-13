/**
 * Webhook Controller
 *
 * Full pipeline:
 *   1. Normalise + classify     (normalization service)
 *   2. Build message context    (context service — raw SQL)
 *   3. Generate AI reply        (response service — Claude)
 *   4. Compute confidence score (confidence service — deterministic)
 *   5. Persist to database      (persistence service — raw SQL)
 *   6. Return final response
 */

import type { Request, Response } from "express";
import type { IncomingWebhookPayload } from "../schemas/webhook.schema";
import { normaliseMessage } from "../services/normalization.service";
import { buildMessageContext } from "../services/context.service";
import { generateGuestReply } from "../services/response.service";
import { computeConfidence } from "../services/confidence.service";
import { persistConversation } from "../services/persistence.service";
import type { ApiResponse } from "../types/message.types";

// final response shape — matches the assignment spec
interface WebhookResponse {
  message_id: string;
  query_type: string;
  drafted_reply: string;
  confidence_score: number;
  action: string;
}

export async function handleWebhook(
  req: Request,
  res: Response<ApiResponse<WebhookResponse>>,
): Promise<void> {
  const payload = req.body as IncomingWebhookPayload;

  // Step 1 — normalise + classify
  const normalised = await normaliseMessage(payload);

  // Step 2 — build context (property info + reservation lookup)
  const context = await buildMessageContext(normalised);

  // Step 3 — generate AI reply
  let draftedReply: string;
  try {
    draftedReply = await generateGuestReply(normalised, context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] AI reply failed: ${msg}`);
    draftedReply = "We've received your message and our team will get back to you shortly.";
  }

  // Step 4 — compute confidence score
  const { confidenceScore, action } = computeConfidence({
    queryType: normalised.query_type,
    bookingRef: normalised.booking_ref,
    messageText: normalised.message_text,
    propertyContext: context.propertyContext,
    reservationContext: context.reservationContext,
    hasReservation: context.hasReservation,
  });

  // Step 5 — persist to database (fire and forget — don't block the response)
  persistConversation({
    normalised,
    draftedReply,
    confidenceScore,
    action,
  });

  // Step 6 — return final response
  res.status(200).json({
    success: true,
    data: {
      message_id: normalised.message_id,
      query_type: normalised.query_type,
      drafted_reply: draftedReply,
      confidence_score: confidenceScore,
      action,
    },
  });
}

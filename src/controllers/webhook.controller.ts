/**
 * Webhook Controller
 *
 * Orchestrates the full inbound message pipeline:
 *   1. Normalise + classify the validated payload  (normalization service)
 *   2. Return the enriched response
 *
 * Controllers own the request/response cycle — services never touch
 * Express objects.  This keeps services pure and testable.
 */

import type { Request, Response } from "express";
import type { IncomingWebhookPayload } from "../schemas/webhook.schema";
import { normaliseMessage } from "../services/normalization.service";
import type { ApiResponse, NormalisedMessage } from "../types/message.types";

// ---------------------------------------------------------------------------
// POST /api/webhook
// ---------------------------------------------------------------------------

export async function handleWebhook(
  req: Request,
  res: Response<ApiResponse<NormalisedMessage>>,
): Promise<void> {
  const payload = req.body as IncomingWebhookPayload;

  // normaliseMessage now handles both normalisation and classification
  const normalised = await normaliseMessage(payload);

  res.status(200).json({
    success: true,
    data: normalised,
  });
}

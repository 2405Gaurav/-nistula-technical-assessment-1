/**
 * Webhook Controller
 *
 * Orchestrates the full inbound message pipeline:
 *   1. Normalise + classify the validated payload  (normalization service)
 *   2. Generate a guest-facing AI reply            (response service)
 *   3. Return both the normalised message and the reply
 *
 * Controllers own the request/response cycle — services never touch
 * Express objects.  This keeps services pure and testable.
 */

import type { Request, Response } from "express";
import type { IncomingWebhookPayload } from "../schemas/webhook.schema";
import { normaliseMessage } from "../services/normalization.service";
import { generateGuestReply } from "../services/response.service";
import type { ApiResponse, NormalisedMessage } from "../types/message.types";

// ---------------------------------------------------------------------------
// Response shape — normalised message + AI-generated reply
// ---------------------------------------------------------------------------

interface WebhookResponse {
  normalised: NormalisedMessage;
  ai_reply: string;
}

// ---------------------------------------------------------------------------
// POST /api/webhook
// ---------------------------------------------------------------------------

export async function handleWebhook(
  req: Request,
  res: Response<ApiResponse<WebhookResponse>>,
): Promise<void> {
  const payload = req.body as IncomingWebhookPayload;

  // Step 1 — normalise + classify
  const normalised = await normaliseMessage(payload);

  // Step 2 — generate guest reply using Claude
  try {
    const aiReply = await generateGuestReply(normalised);

    res.status(200).json({
      success: true,
      data: {
        normalised,
        ai_reply: aiReply,
      },
    });
  } catch (err) {
    // Claude failed but normalisation succeeded — return what we have
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] AI reply generation failed: ${message}`);

    res.status(500).json({
      success: false,
      error: "AI reply generation failed",
      data: {
        normalised,
        ai_reply: "We've received your message and our team will get back to you shortly.",
      },
    });
  }
}

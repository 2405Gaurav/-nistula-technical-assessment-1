/**
 * Webhook Routes
 *
 * POST /api/webhook — accepts incoming messages from external channels,
 * validates the payload, normalises it, and returns the canonical shape.
 *
 * NOTE: Database persistence and AI response generation are intentionally
 * omitted at this stage.  This route exists purely to demonstrate the
 * validation → normalisation pipeline.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { IncomingWebhookSchema } from "../schemas/webhook.schema";
import type { IncomingWebhookPayload } from "../schemas/webhook.schema";
import { normaliseMessage } from "../services/normalization.service";
import { validate } from "../middleware/validation.middleware";
import type { ApiResponse, NormalisedMessage } from "../types/message.types";

export const webhookRouter = Router();

/**
 * POST /api/webhook
 *
 * 1. Zod validates the raw JSON body
 * 2. Normalization service maps it to canonical internal shape
 * 3. Returns the normalised message (no DB write yet)
 */
webhookRouter.post(
  "/",
  validate(IncomingWebhookSchema),
  (req: Request, res: Response<ApiResponse<NormalisedMessage>>): void => {
    const payload = req.body as IncomingWebhookPayload;
    const normalised = normaliseMessage(payload);

    res.status(200).json({
      success: true,
      data: normalised,
    });
  },
);

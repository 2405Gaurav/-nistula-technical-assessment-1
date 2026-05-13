/**
 * Webhook Routes
 *
 * Thin routing layer — only wires middleware and controllers.
 * No business logic lives here.
 */

import { Router } from "express";
import { IncomingWebhookSchema } from "../schemas/webhook.schema";
import { validate } from "../middleware/validation.middleware";
import { handleWebhook } from "../controllers/webhook.controller";

export const webhookRouter = Router();

// POST /api/webhook — validate → controller handles the rest
webhookRouter.post("/", validate(IncomingWebhookSchema), handleWebhook);

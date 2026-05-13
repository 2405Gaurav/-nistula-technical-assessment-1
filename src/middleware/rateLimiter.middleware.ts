/**
 * Rate limiting middleware (production-oriented).
 *
 * Two layers:
 *   1. Global — caps total API traffic per IP so the whole surface is protected.
 *   2. Webhook — stricter cap on POST /webhook/message because each hit can invoke Claude.
 *
 * When a client exceeds a limit, responses use the shared ApiResponse envelope
 * ({ success: false, error: string }) instead of the library’s default plain text.
 */

import rateLimit, { type RateLimitExceededEventHandler } from "express-rate-limit";
import type { Response } from "express";
import type { ApiResponse } from "../types/message.types";

/** Shown when the global per-IP window is exhausted. */
const GLOBAL_LIMIT_MESSAGE = "Too many requests, please try again later.";

/** Shown when the webhook-specific per-IP window is exhausted. */
const WEBHOOK_LIMIT_MESSAGE =
  "Webhook rate limit exceeded. Each request triggers a Claude API call.";

const sendRateLimitJson = (
  res: Response<ApiResponse>,
  statusCode: number,
  error: string,
): void => {
  res.status(statusCode).json({
    success: false,
    error,
  });
};

const globalRateLimitHandler: RateLimitExceededEventHandler = (
  _req,
  res,
  _next,
  options,
) => {
  sendRateLimitJson(res as Response<ApiResponse>, options.statusCode, GLOBAL_LIMIT_MESSAGE);
};

const webhookRateLimitHandler: RateLimitExceededEventHandler = (
  _req,
  res,
  _next,
  options,
) => {
  sendRateLimitJson(res as Response<ApiResponse>, options.statusCode, WEBHOOK_LIMIT_MESSAGE);
};

/**
 * Global limiter: 100 requests per 15 minutes per IP (all routes that sit after it in the stack).
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: GLOBAL_LIMIT_MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: globalRateLimitHandler,
});

/**
 * Webhook limiter: 10 requests per 60 seconds per IP (apply only to /webhook/message).
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  message: WEBHOOK_LIMIT_MESSAGE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: webhookRateLimitHandler,
});

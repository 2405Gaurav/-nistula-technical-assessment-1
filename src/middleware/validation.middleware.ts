/**
 * Generic Zod validation middleware for Express.
 *
 * Accepts any Zod schema and returns an Express middleware that:
 *  1. Validates `req.body` against the schema.
 *  2. On success — replaces `req.body` with the parsed (trimmed/coerced) data
 *     and calls `next()`.
 *  3. On failure — returns a structured 400 response with field-level errors.-> error handling 
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import type { ApiResponse } from "../types/message.types";

/**
 * Create a validation middleware for the given Zod schema.
 *
 * @example
 * ```ts
 * router.post("/webhook", validate(IncomingWebhookSchema), handler);
 * ```
 */
export function validate<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));

      res.status(400).json({
        success: false,
        error: "Validation failed",
        errors: fieldErrors,
      });
      return;
    }

    // Replace body with the parsed (trimmed / coerced) output
    req.body = result.data;
    next();
  };
}

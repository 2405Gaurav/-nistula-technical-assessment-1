/**
 * Messages Routes
 *
 * GET /api/messages — returns the 50 most recent messages
 * with guest name and conversation source via raw SQL JOINs.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { getRecentMessages } from "../lib/rawQuery";
import type { ApiResponse } from "../types/message.types";

export const messagesRouter = Router();

messagesRouter.get("/", async (_req: Request, res: Response<ApiResponse>): Promise<void> => {
  try {
    const messages = await getRecentMessages();
    res.status(200).json({ success: true, data: messages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[messages] query failed: ${msg}`);
    res.status(500).json({ success: false, error: "Failed to fetch messages" });
  }
});

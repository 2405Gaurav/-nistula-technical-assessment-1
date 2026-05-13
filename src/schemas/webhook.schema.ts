/**
 * Zod validation schemas for incoming webhook payloads.
 *
 * Each external channel (WhatsApp, Booking.com, Airbnb, etc.) sends a
 * webhook with a loosely-typed JSON body.  These schemas enforce shape,
 * types, and basic sanitisation (trimming) at the API boundary so that
 * downstream services always receive clean, typed data.
 */

import { z } from "zod/v4";
import { MESSAGE_SOURCES } from "../constants/message";

//Incoming webhook payload — the raw shape sent by external channels

export const IncomingWebhookSchema = z.object({
  // Channel the message arrived from 
  source: z.enum(MESSAGE_SOURCES, {
    error: "Invalid message source. Must be one of: whatsapp, booking_com, airbnb, instagram, direct",
  }),
  //this source validation also can serve as a secirity feature for the backend so we dont get the payload from the unknown source as well 

  //Full name of the guest as provided by the channel
  guest_name: z
    .string()
    .trim()
    .min(1, "Guest name is required")
    .max(255, "Guest name must be 255 characters or fewer"),

  //The guest's raw message text
  message: z
    .string()
    .trim()
    .min(1, "Message text is required")
    .max(5000, "Message text must be 5000 characters or fewer"),

  //ISO-8601 timestamp of when the message was sent
  timestamp: z
    .iso.datetime({ message: "Timestamp must be a valid ISO-8601 datetime" }),

  //Optional booking reference tied to this message 
  booking_ref: z
    .string()
    .trim()
    .max(100, "Booking reference must be 100 characters or fewer")
    .optional()
    .nullable(),

  //Property code the message relates to
  property_id: z
    .string()
    .trim()
    .min(1, "Property ID is required")
    .max(100, "Property ID must be 100 characters or fewer"),
});

//Inferred TypeScript type — always stays in sync with the schema

export type IncomingWebhookPayload = z.infer<typeof IncomingWebhookSchema>;

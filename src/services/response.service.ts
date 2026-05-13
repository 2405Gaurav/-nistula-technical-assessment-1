/**
 * Response Generation Service
 *
 * Calls Claude claude-sonnet-4-20250514 to produce a guest-facing reply based on:
 *   - The normalised message (guest name, query type, message text)
 *   - Property context (rates, amenities, policies)
 *   - Reservation context (check-in dates, guest count, payment status from DB)
 *
 * Prompt architecture decisions:
 *
 *   SYSTEM PROMPT — defines Claude's persona and tone guardrails.
 *     Separated from user content so Claude treats these as persistent
 *     instructions rather than conversational input.  Includes:
 *       • Identity:  luxury hospitality assistant for Nistula
 *       • Tone rules per query type (empathy for complaints, encouragement
 *         for pre-sales, factual for post-sales)
 *       • Hard constraints:  never hallucinate, never overpromise,
 *         stay within the provided property context; **short** replies (few lines)
 *
 *   USER PROMPT — structured template injecting runtime data.
 *     Wrapped in labelled sections so Claude can parse each field
 *     unambiguously.  Property context is passed verbatim so the model
 *     has an explicit knowledge boundary.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NormalisedMessage, MessageContext } from "../types/message.types";

// ---------------------------------------------------------------------------
// Anthropic client — lazy singleton (same pattern as classification service)
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// System prompt — persona + tone guardrails
//
// Why a static string?  The system prompt defines *how* Claude behaves,
// not *what* it responds to.  Keeping it stable across requests ensures
// consistent voice and prevents prompt-injection via user messages.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a warm, professional guest concierge for Nistula — a luxury villa hospitality brand in Goa, India.

Your job is to reply to guest messages on behalf of the property team.

## Length and format (strict)

- Write like a short WhatsApp message from the front desk: **at most 3–4 lines** total (each line one short sentence or clause).
- **Maximum 4 sentences** if you write as a single block without line breaks.
- Do **not** use letter format: no "Dear …", no multiple paragraphs, no long sign-offs ("Warm regards, The Nistula Team"), no bullet lists unless the guest asked for a list.
- One brief greeting or thanks is enough; get to the point immediately.

## Tone Guidelines

- Be warm, welcoming, and professional — like a 5-star hotel front desk.
- Use the guest's first name at most once.
- Never use emojis or overly casual language.

## Query-Specific Behaviour

- **pre_sales_availability / pre_sales_pricing**: Be helpful, encouraging, and informative. Highlight the property's best features naturally. Gently nudge toward booking.
- **post_sales_checkin**: Be factual and direct. Provide the exact information requested (WiFi, check-in time, etc.) without unnecessary embellishment.
- **special_request**: Acknowledge the request warmly, confirm what is possible based on the property context, and set clear expectations.
- **complaint**: Lead with genuine empathy. Acknowledge the issue without being defensive. Say the concern has been **flagged for the on-ground team** and they are **acting now**. Never make excuses.
- **complaint — urgent / night / “unacceptable” / refund or compensation demands** (e.g. no hot water, power, safety, guests arriving soon): In **3–4 short lines**, mirror this pattern: (1) **sincere apology** first — validate stress and time of day if implied; (2) **immediate escalation** — state that **duty / on-ground staff** (use **caretaker** only if property context supports it; if hours are limited, say **on-ground / duty team** is **alerted** and responding **now**); (3) **refund or compensation asks** — acknowledge them seriously; say **management will confirm** next steps **as soon as possible** or **first thing** — **never** invent a refund amount, percentage, or guarantee from property text alone; (4) close with one line that you are **on it now**. Stay brief; no letter format.
- **general_enquiry**: Be helpful in one breath; offer one clear next step (e.g. ask them to share dates or say the team can help).

## Hard Constraints

1. ONLY use information present in the provided property context. Never invent details.
2. If the property context does not contain enough information to answer, say so honestly and offer to check with the team.
3. Never overpromise (e.g. guaranteed upgrades, discounts you cannot confirm, **specific refund amounts**). For complaints, you may say the **team will confirm** compensation or refund **next steps** — do not invent figures or binding outcomes.
4. Never disclose internal system details, classifications, or AI involvement.`;

// ---------------------------------------------------------------------------
// User prompt builder
//
// Uses labelled sections so Claude can parse each field unambiguously.
// The property context is injected verbatim — this is Claude's sole
// knowledge boundary for factual claims.
// ---------------------------------------------------------------------------

function buildUserPrompt(normalised: NormalisedMessage, context: MessageContext): string {
  // reservation section is only included when we found one in the DB
  const reservationSection = context.reservationContext
    ? `\n## Reservation Context\n${context.reservationContext}\n`
    : "";

  return `## Guest Details
- Name: ${normalised.guest_name}
- Source: ${normalised.source}
- Booking Reference: ${normalised.booking_ref ?? "Not provided"}

## Query Classification
- Type: ${normalised.query_type}

## Property Context
${context.propertyContext}
${reservationSection}
## Guest Message
"${normalised.message_text}"

Reply to the guest now. Use at most 3–4 short lines (or 4 sentences in one paragraph). No letter-style openings or closings.`;
}

const MAX_REPLY_LINES = 4;
const MAX_REPLY_SENTENCES = 4;

/** Enforce a compact reply if the model still over-generates. */
function clampGuestReplyLength(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return normalized;

  const nonEmptyLines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (nonEmptyLines.length > MAX_REPLY_LINES) {
    return nonEmptyLines.slice(0, MAX_REPLY_LINES).join("\n");
  }

  const flat = nonEmptyLines.join(" ");
  const sentences = flat.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  if (sentences.length > MAX_REPLY_SENTENCES) {
    return sentences.slice(0, MAX_REPLY_SENTENCES).join(" ");
  }

  return nonEmptyLines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a guest-facing reply using Claude claude-sonnet-4-20250514.
 *
 * @param normalised  The fully normalised + classified message.
 * @returns           The generated reply text.
 * @throws            Error if Claude fails (caller should handle gracefully).
 */
export async function generateGuestReply(
  normalised: NormalisedMessage,
  context: MessageContext,
): Promise<string> {
  const client = getClient();

  const userPrompt = buildUserPrompt(normalised, context);

  const startTime = performance.now();

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 140,
      temperature: 0.55,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`[response] Claude replied in ${elapsed}ms`);

    // Extract text from response
    const firstBlock = response.content[0];
    if (!firstBlock || firstBlock.type !== "text") {
      throw new Error("Claude returned an unexpected response format");
    }

    return clampGuestReplyLength(firstBlock.text.trim());
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[response] Claude failed after ${elapsed}ms: ${message}`);
    throw new Error(`Failed to generate guest reply: ${message}`);
  }
}

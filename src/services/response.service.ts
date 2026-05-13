/**
 * Response Generation Service
 *
 * Calls Claude claude-sonnet-4-20250514 to produce a guest-facing reply based on:
 *   - The normalised message (guest name, query type, message text)
 *   - Property context (rates, amenities, policies)
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
 *         stay within the provided property context
 *
 *   USER PROMPT — structured template injecting runtime data.
 *     Wrapped in labelled sections so Claude can parse each field
 *     unambiguously.  Property context is passed verbatim so the model
 *     has an explicit knowledge boundary.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NormalisedMessage } from "../types/message.types";
import { getPropertyContext } from "../utils/propertyContext";

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

## Tone Guidelines

- Be warm, welcoming, and professional — like a 5-star hotel front desk.
- Keep responses concise — 2 to 4 sentences unless the query requires more detail.
- Use the guest's first name naturally (not repeatedly).
- Never use emojis or overly casual language.

## Query-Specific Behaviour

- **pre_sales_availability / pre_sales_pricing**: Be helpful, encouraging, and informative. Highlight the property's best features naturally. Gently nudge toward booking.
- **post_sales_checkin**: Be factual and direct. Provide the exact information requested (WiFi, check-in time, etc.) without unnecessary embellishment.
- **special_request**: Acknowledge the request warmly, confirm what is possible based on the property context, and set clear expectations.
- **complaint**: Lead with genuine empathy. Acknowledge the issue without being defensive. Mention that the concern has been flagged for the on-ground team. Never make excuses.
- **general_enquiry**: Be helpful and offer to assist further.

## Hard Constraints

1. ONLY use information present in the provided property context. Never invent details.
2. If the property context does not contain enough information to answer, say so honestly and offer to check with the team.
3. Never overpromise (e.g. guaranteed upgrades, discounts you cannot confirm).
4. Never disclose internal system details, classifications, or AI involvement.
5. Keep the reply under 150 words.`;

// ---------------------------------------------------------------------------
// User prompt builder
//
// Uses labelled sections so Claude can parse each field unambiguously.
// The property context is injected verbatim — this is Claude's sole
// knowledge boundary for factual claims.
// ---------------------------------------------------------------------------

function buildUserPrompt(normalised: NormalisedMessage, propertyContext: string): string {
  return `## Guest Details
- Name: ${normalised.guest_name}
- Source: ${normalised.source}
- Booking Reference: ${normalised.booking_ref ?? "Not provided"}

## Query Classification
- Type: ${normalised.query_type}

## Property Context
${propertyContext}

## Guest Message
"${normalised.message_text}"

Please write a reply to this guest message.`;
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
): Promise<string> {
  const client = getClient();

  // Fetch property context for the referenced property
  const propertyContext = getPropertyContext(normalised.property_id);
  const userPrompt = buildUserPrompt(normalised, propertyContext);

  const startTime = performance.now();

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      temperature: 0.7,  // slight creativity for natural-sounding replies
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

    return firstBlock.text.trim();
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[response] Claude failed after ${elapsed}ms: ${message}`);
    throw new Error(`Failed to generate guest reply: ${message}`);
  }
}

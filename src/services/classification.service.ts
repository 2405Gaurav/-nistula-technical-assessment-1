/**
 * Classification Service — Hybrid Approach
 *
 * Classifies incoming guest messages into one of the valid QueryType
 * categories using a two-step strategy:
 *
 *  Step 1 (Rule-based):  Fast, deterministic keyword matching against the
 *          normalised message text.  Keywords live in constants/message.ts
 *          so they can be updated without touching business logic.
 *
 *  Step 2 (Claude fallback):  If the rule engine returns "general_enquiry"
 *          (i.e. no keyword matched), the message is forwarded to Claude
 *          claude-sonnet-4-20250514 with a strict classification prompt.
 *
 * Why hybrid?
 *  - Rule-based catches 70-80% of messages instantly and for free.
 *  - Claude handles nuanced / ambiguous messages that keywords miss.
 *  - If Claude itself fails (network, rate-limit, malformed response),
 *    we gracefully degrade back to "general_enquiry" so the pipeline
 *    never breaks.
 */

import Anthropic from "@anthropic-ai/sdk";
import { QUERY_TYPES, CLASSIFICATION_KEYWORDS } from "../constants/message";
import type { QueryType } from "../types/message.types";

// ---------------------------------------------------------------------------
// Anthropic client — initialised lazily so the module can be imported even
// when the API key is not yet available (e.g. during tests).
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
// Step 1 — Rule-based classification (keywords from constants)
// ---------------------------------------------------------------------------

function classifyByRules(messageText: string): QueryType {
  const lower = messageText.toLowerCase();

  for (const entry of CLASSIFICATION_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.type;
    }
  }

  return "general_enquiry";
}

// ---------------------------------------------------------------------------
// Step 2 — Claude fallback classification
// ---------------------------------------------------------------------------

const CLASSIFICATION_PROMPT = `You are a message classifier for a hospitality property management system.

Classify the following guest message into EXACTLY ONE of these categories:
${QUERY_TYPES.map((t) => `- ${t}`).join("\n")}

Rules:
1. Return ONLY the category string, nothing else.
2. Do not add quotes, punctuation, or explanation.
3. If genuinely ambiguous, return "general_enquiry".

Guest message:
`;

async function classifyByClaude(messageText: string): Promise<QueryType> {
  const client = getClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 30,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: CLASSIFICATION_PROMPT + messageText,
      },
    ],
  });

  const firstBlock = response.content[0];
  if (!firstBlock || firstBlock.type !== "text") {
    throw new Error("Claude returned an unexpected response format");
  }

  const raw = firstBlock.text.trim().toLowerCase();

  const validTypes: readonly string[] = QUERY_TYPES;
  if (validTypes.includes(raw)) {
    return raw as QueryType;
  }

  console.warn(`[classification] Claude returned invalid type: "${raw}"`);
  return "general_enquiry";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a guest message into a QueryType using the hybrid strategy.
 *
 * @param messageText  The normalised message body.
 * @returns            One of the valid QueryType values.
 */
export async function classifyMessage(
  messageText: string,
): Promise<QueryType> {
  // Step 1 — try rule-based first
  const ruleResult = classifyByRules(messageText);
  if (ruleResult !== "general_enquiry") {
    console.log(`[classification] rule-based → ${ruleResult}`);
    return ruleResult;
  }

  // Step 2 — escalate to Claude for ambiguous messages
  try {
    console.log("[classification] rule-based → general_enquiry, escalating to Claude…");
    const claudeResult = await classifyByClaude(messageText);
    console.log(`[classification] Claude fallback → ${claudeResult}`);
    return claudeResult;
  } catch (err) {
    console.error(
      "[classification] Claude fallback failed, defaulting to general_enquiry:",
      err instanceof Error ? err.message : err,
    );
    return "general_enquiry";
  }
}

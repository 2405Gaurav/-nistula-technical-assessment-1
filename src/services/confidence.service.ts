/**
 * Confidence Service
 *
 * Computes a deterministic confidence score for an AI-drafted reply
 * based on input signals — NOT on the AI response itself.
 *
 * Why deterministic?
 *   The score reflects how much context was available to the AI when
 *   it generated the reply.  More context = higher confidence that the
 *   reply is accurate.  Complaints always get low confidence because
 *   they need human empathy and judgment.
 *
 * Why not score the AI response?
 *   Scoring the response would require a second Claude call (expensive)
 *   or a fragile regex-based check.  Scoring the inputs is free, instant,
 *   and reproducible — same inputs always give the same score.
 */

import type { ConfidenceInput, ConfidenceResult, MessageAction } from "../types/message.types";

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  let score = 0.60;
  console.log("[confidence] base: 0.60");

  // --- query type bonuses ---
  // post_sales_checkin is the easiest — factual info like WiFi/checkin times
  if (input.queryType === "post_sales_checkin") {
    score += 0.20;
    console.log("[confidence] +0.20 post_sales_checkin (simple factual)");
  }
  // availability is a clear yes/no from property context
  if (input.queryType === "pre_sales_availability") {
    score += 0.15;
    console.log("[confidence] +0.15 pre_sales_availability");
  }
  // pricing can be answered exactly from rate info in context
  if (input.queryType === "pre_sales_pricing") {
    score += 0.10;
    console.log("[confidence] +0.10 pre_sales_pricing");
  }
  // special requests are manageable — caretaker/chef info available
  if (input.queryType === "special_request") {
    score += 0.05;
    console.log("[confidence] +0.05 special_request");
  }

  // --- context bonuses ---
  // property context found means the AI had real data to work with
  if (input.propertyContext !== "") {
    score += 0.10;
    console.log("[confidence] +0.10 property context found");
  }
  // booking ref means we can identify the guest/reservation
  if (input.bookingRef) {
    score += 0.10;
    console.log("[confidence] +0.10 booking_ref present");
  }
  // verified reservation in DB adds extra trust
  if (input.hasReservation) {
    score += 0.05;
    console.log("[confidence] +0.05 reservation verified in DB");
  }

  // --- deductions ---
  // complaints always need human eyes — empathy can't be fully automated
  if (input.queryType === "complaint") {
    score -= 0.40;
    console.log("[confidence] -0.40 complaint (needs human review)");
  }
  // general_enquiry means rules couldn't classify it — ambiguous
  if (input.queryType === "general_enquiry") {
    score -= 0.20;
    console.log("[confidence] -0.20 general_enquiry (ambiguous)");
  }
  // no booking ref = unverified guest, less trust
  if (!input.bookingRef) {
    score -= 0.10;
    console.log("[confidence] -0.10 no booking_ref (unverified guest)");
  }
  // very short messages are too ambiguous to classify reliably
  if (input.messageText.length < 10) {
    score -= 0.10;
    console.log("[confidence] -0.10 message under 10 chars (too short)");
  }

  // clamp between 0 and 1, round to 2 decimal places
  score = Math.min(Math.max(score, 0), 1);
  score = Math.round(score * 100) / 100;

  // --- action decision ---
  let action: MessageAction;

  if (input.queryType === "complaint") {
    // complaints always escalate, regardless of score
    action = "escalate";
  } else if (score > 0.85) {
    action = "auto_send";
  } else if (score >= 0.60) {
    action = "agent_review";
  } else {
    action = "escalate";
  }

  console.log(`[confidence] final: ${score} → ${action}`);
  return { confidenceScore: score, action };
}

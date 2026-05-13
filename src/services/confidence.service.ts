/**
 * Confidence Service
 *
 * Computes a deterministic confidence score for an AI-drafted reply
 * based on input signals — NOT on the AI response text itself.
 *
 * Signals intentionally combine:
 *   • Property context — static + DB-backed facts in the prompt (rates, WiFi, policies).
 *   • Reservation context — verified booking row (dates, guest count, payment/status).
 *
 * When BOTH are present, the model received the richest possible grounding, so we add
 * a small "full context" bonus on top of the individual reservation signals.
 *
 * Assessment alignment (action thresholds):
 *   • complaint → always "escalate"
 *   • score > 0.85 → "auto_send"
 *   • score >= 0.60 and <= 0.85 → "agent_review"
 *   • score < 0.60 → "escalate"
 */

import type { ConfidenceInput, ConfidenceResult, MessageAction } from "../types/message.types";

/** Property block was loaded (not the unknown-property fallback string). */
function isPropertyContextKnown(propertyContext: string): boolean {
  return (
    propertyContext !== "" &&
    !propertyContext.includes("Property details not available")
  );
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  let score = 0.60;
  console.log("[confidence] base: 0.60");

  const propertyKnown = isPropertyContextKnown(input.propertyContext);
  const hasReservationBlock =
    input.hasReservation && input.reservationContext !== "";

  // --- query type bonuses ---
  if (input.queryType === "post_sales_checkin") {
    score += 0.20;
    console.log("[confidence] +0.20 post_sales_checkin (simple factual)");
  }
  if (input.queryType === "pre_sales_availability") {
    score += 0.15;
    console.log("[confidence] +0.15 pre_sales_availability");
  }
  if (input.queryType === "pre_sales_pricing") {
    score += 0.10;
    console.log("[confidence] +0.10 pre_sales_pricing");
  }
  if (input.queryType === "special_request") {
    score += 0.05;
    console.log("[confidence] +0.05 special_request");
  }

  // --- property context ---
  if (propertyKnown) {
    score += 0.10;
    console.log("[confidence] +0.10 property context (known property)");
  }

  // --- booking / reservation signals ---
  if (input.bookingRef) {
    score += 0.10;
    console.log("[confidence] +0.10 booking_ref present");
  }
  if (input.hasReservation) {
    score += 0.05;
    console.log("[confidence] +0.05 reservation verified in DB");
  }
  if (input.reservationContext !== "") {
    score += 0.10;
    console.log("[confidence] +0.10 reservation details in prompt");
  }

  // --- optimisation: both property + reservation context in the prompt ---
  if (propertyKnown && hasReservationBlock) {
    score += 0.05;
    console.log("[confidence] +0.05 full context (property + reservation block)");
  }

  // --- deductions ---
  if (input.queryType === "complaint") {
    score -= 0.40;
    console.log("[confidence] -0.40 complaint (needs human review)");
  }
  if (input.queryType === "general_enquiry") {
    score -= 0.20;
    console.log("[confidence] -0.20 general_enquiry (ambiguous / classifier fallback)");
  }
  if (!input.bookingRef) {
    score -= 0.10;
    console.log("[confidence] -0.10 no booking_ref (unverified guest)");
  }
  if (input.messageText.length < 10) {
    score -= 0.10;
    console.log("[confidence] -0.10 message under 10 chars (too short)");
  }

  score = Math.min(Math.max(score, 0), 1);
  score = Math.round(score * 100) / 100;

  let action: MessageAction;

  if (input.queryType === "complaint") {
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

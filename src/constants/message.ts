export const MESSAGE_SOURCES = [
  "whatsapp",
  "booking_com",
  "airbnb",
  "instagram",
  "direct"
] as const;
// these are the values that will wokr for the most of the source and can be expanded if needed and i forgot to add the problmes i faced for the schema designing 

export const QUERY_TYPES = [
  "pre_sales_availability",
  "pre_sales_pricing",
  "post_sales_checkin",
  "special_request",
  "complaint",
  "general_enquiry"
] as const;

export const MESSAGE_DIRECTIONS = [
  "inbound",
  "outbound"
] as const;

export const MESSAGE_ACTIONS = [
  "auto_send",
  "agent_review",
  "escalate"
] as const;

export const CONVERSATION_STATUSES = [
  "open",
  "resolved",
  "escalated",
  "closed"
] as const;

/**
 * Keyword → QueryType classification rules.
 *
 * Order matters: more specific categories come first so that a message
 * like "the wifi is not working" matches "complaint" before "post_sales_checkin".
 * "general_enquiry" is the implicit fallback — no keywords needed.
 */
export const CLASSIFICATION_KEYWORDS = [
  {
    type: "complaint" as const,
    keywords: [
      "refund", "unacceptable", "terrible", "complaint",
      "not working", "broken", "dirty", "disgusting",
      "worst", "horrible", "damaged",
    ],
  },
  {
    type: "special_request" as const,
    keywords: [
      "chef", "arrange", "request", "need",
      "organise", "organize", "book a", "can you",
      "could you", "extra bed", "birthday", "anniversary",
      "celebration", "decorate",
    ],
  },
  {
    type: "pre_sales_availability" as const,
    keywords: [
      "available", "availability", "vacancy", "vacant",
      "dates", "free dates", "open dates", "book from", "book for",
    ],
  },
  {
    type: "pre_sales_pricing" as const,
    keywords: [
      "rate", "price", "pricing", "cost", "charge",
      "tariff", "per night", "how much", "total cost", "extra guest",
    ],
  },
  {
    type: "post_sales_checkin" as const,
    keywords: [
      "wifi", "wi-fi", "check in", "check-in", "checkin",
      "checkout", "check out", "check-out", "password",
      "pool", "caretaker", "directions", "address", "parking",
      "key", "towel",
    ],
  },
] as const;
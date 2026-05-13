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
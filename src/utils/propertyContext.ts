/**
 * Fallback property copy when PostgreSQL has no row (or before schema is loaded).
 * Primary source of truth for prompts is the Property table — see context.service.ts.
 */

/** Same phrase used by confidence scoring to detect “unknown property”. */
export const PROPERTY_CONTEXT_UNKNOWN = "Property details not available.";

export function getPropertyContextFallback(propertyCode: string): string {
  const properties: Record<string, string> = {
    "villa-b1": `
Property: Villa B1, Assagao, North Goa
Bedrooms: 3 | Max guests: 6 | Private pool: Yes
Check-in: 2pm | Check-out: 11am
Base rate: INR 18,000 per night (up to 4 guests)
Extra guest: INR 2,000 per night per person
WiFi password: Nistula@2024
Caretaker: Available 8am to 10pm
Chef on call: Yes, pre-booking required
Availability April 20-24: Available
Cancellation: Free up to 7 days before check-in
    `.trim(),
  };

  return properties[propertyCode] ?? PROPERTY_CONTEXT_UNKNOWN;
}

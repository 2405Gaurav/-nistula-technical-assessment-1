// src/utils/propertyContext.ts
// Property context is currently loaded from a static utility for assessment purposes.
// In production this would be fetched dynamically from the Property table in PostgreSQL via Prisma.
// i already have made the table fro this purpose , a little bit code changes and it will work with that as well 

export function getPropertyContext(propertyId: string): string {
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
    `.trim()
  };

  return properties[propertyId] ?? "Property details not available.";
}   